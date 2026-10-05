-- A required attendee must be explicitly available for the entire selected slot.
-- Keep the check in the database so an old snapshot or direct RPC call cannot bypass it.
create or replace function public.finalize_gathering(
  p_gathering_id uuid,
  p_snapshot_id uuid,
  p_candidate_id text,
  p_expected_revision bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.gatherings;
  s public.result_snapshots;
  selected_candidate jsonb;
  finalization public.finalizations;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id = p_gathering_id for update;
  if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
  if g.host_id <> auth.uid() then raise exception 'HOST_REQUIRED'; end if;
  if g.status = 'finalized' and g.current_snapshot_id = p_snapshot_id and g.revision = p_expected_revision then
    select * into finalization from public.finalizations where gathering_id = g.id and snapshot_id = p_snapshot_id and candidate_id = p_candidate_id;
    if found then return jsonb_build_object('id', finalization.id, 'candidateId', p_candidate_id, 'snapshotId', p_snapshot_id); end if;
  end if;
  if g.status in ('draft', 'finalized', 'cancelled') then raise exception 'GATHERING_LOCKED'; end if;
  if p_expected_revision is null or g.revision is distinct from p_expected_revision or g.current_snapshot_id is distinct from p_snapshot_id then raise exception 'STALE_RESULT'; end if;
  select * into s from public.result_snapshots where id = p_snapshot_id and gathering_id = p_gathering_id;
  if not found or s.revision is distinct from g.revision then raise exception 'STALE_RESULT'; end if;
  select candidate into selected_candidate from jsonb_array_elements(s.candidates) candidate where candidate->>'id' = p_candidate_id;
  if selected_candidate is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  if exists (
    select 1 from public.memberships m
    where m.gathering_id = g.id and m.status = 'joined' and m.is_priority
      and not exists (
        select 1 from jsonb_array_elements(coalesce(selected_candidate->'participantScores', '[]'::jsonb)) person
        where person->>'participantId' = m.user_id::text
          and person->>'status' = 'green'
          and person->>'submitted' = 'true'
      )
  ) then raise exception 'REQUIRED_ATTENDEE_UNAVAILABLE'; end if;
  insert into public.finalizations(gathering_id, snapshot_id, candidate_id, finalized_by)
    values (p_gathering_id, p_snapshot_id, p_candidate_id, auth.uid()) returning * into finalization;
  update public.gatherings set status = 'finalized', finalized_at = now() where id = p_gathering_id;
  insert into public.notifications(user_id, kind, payload)
    select m.user_id, 'finalized', jsonb_build_object('gatheringId', p_gathering_id, 'candidateId', p_candidate_id)
    from public.memberships m where m.gathering_id = p_gathering_id and m.status = 'joined';
  return jsonb_build_object('id', finalization.id, 'candidateId', p_candidate_id, 'snapshotId', p_snapshot_id);
end;
$$;
