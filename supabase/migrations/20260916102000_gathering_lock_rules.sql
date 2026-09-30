-- Joining and submitting stop at the response deadline. The row lock keeps
-- the deadline check and the state transition atomic with the write.
create or replace function public.join_gathering(p_invite_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.gatherings;
  member_count integer;
  profile_name text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where invite_token = p_invite_token for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if g.status in ('finalized', 'cancelled') or now() >= g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  select count(*) into member_count from public.memberships where gathering_id = g.id and status = 'joined';
  if member_count >= 10 and not exists (select 1 from public.memberships where gathering_id = g.id and user_id = auth.uid()) then raise exception 'GATHERING_FULL'; end if;
  select display_name into profile_name from public.profiles where id = auth.uid();
  insert into public.memberships(gathering_id, user_id, display_name, status) values (g.id, auth.uid(), coalesce(profile_name, '新朋友'), 'joined')
    on conflict (gathering_id, user_id) do update set status = 'joined', left_at = null;
  insert into public.availability_drafts(gathering_id, user_id, cells, version) values (g.id, auth.uid(), '{}'::jsonb, 1) on conflict do nothing;
  return jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status, 'dateStart', g.date_start, 'dateEnd', g.date_end);
end;
$$;

create or replace function public.submit_availability(
  p_gathering_id uuid,
  p_expected_draft_version bigint,
  p_cells jsonb,
  p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.gatherings;
  draft public.availability_drafts;
  next_submission_version bigint;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if jsonb_typeof(coalesce(p_cells, '{}'::jsonb)) <> 'object' then raise exception 'INVALID_CELLS'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_cells, '{}'::jsonb)) item where item.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-([01][0-9]|2[0-3]):(00|30)$' or item.value not in ('unknown', 'green', 'yellow', 'red')) then raise exception 'INVALID_CELLS'; end if;
  select * into g from public.gatherings where id = p_gathering_id for update;
  if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
  if exists (
    select 1 from jsonb_each_text(coalesce(p_cells, '{}'::jsonb)) item
    where (substring(item.key from 1 for 10)::date < g.date_start or substring(item.key from 1 for 10)::date > g.date_end)
      or ((split_part(substring(item.key from 12), ':', 1)::integer * 60 + split_part(substring(item.key from 12), ':', 2)::integer) < (extract(hour from g.daily_start)::integer * 60 + extract(minute from g.daily_start)::integer))
      or ((split_part(substring(item.key from 12), ':', 1)::integer * 60 + split_part(substring(item.key from 12), ':', 2)::integer) >= (extract(hour from g.daily_end)::integer * 60 + extract(minute from g.daily_end)::integer))
  ) then raise exception 'CELL_OUT_OF_RANGE'; end if;
  if g.status in ('finalized', 'cancelled') or now() >= g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  if not exists (select 1 from public.memberships where gathering_id = p_gathering_id and user_id = auth.uid() and status = 'joined') then raise exception 'NOT_MEMBER'; end if;
  select * into draft from public.availability_drafts where gathering_id = p_gathering_id and user_id = auth.uid() for update;
  if draft.version is distinct from p_expected_draft_version then raise exception 'VERSION_CONFLICT'; end if;
  select coalesce(max(version), 0) + 1 into next_submission_version from public.availability_submissions where gathering_id = p_gathering_id and user_id = auth.uid();
  insert into public.availability_submissions(gathering_id, user_id, cells, version, submitted_at) values (p_gathering_id, auth.uid(), p_cells, next_submission_version, now())
    on conflict (gathering_id, user_id) do update set cells = excluded.cells, version = excluded.version, submitted_at = excluded.submitted_at;
  insert into public.personal_calendar_versions(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  perform public.apply_personal_busy_cells((select version from public.personal_calendar_versions where user_id = auth.uid()), p_changes);
  update public.gatherings set revision = revision + 1, status = case when status = 'draft' then 'open' else status end where id = p_gathering_id;
  return jsonb_build_object('submitted', true, 'submissionVersion', next_submission_version, 'gatheringRevision', g.revision + 1);
end;
$$;
