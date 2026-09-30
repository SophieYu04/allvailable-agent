create function public.commit_gathering_snapshot(p_gathering_id uuid, p_revision bigint, p_criteria jsonb, p_candidates jsonb, p_members uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare g public.gatherings; s public.result_snapshots;
begin
  select * into g from public.gatherings where id = p_gathering_id for update;
  if not found or g.status in ('finalized','cancelled') then raise exception 'GATHERING_LOCKED'; end if;
  if g.revision <> p_revision then raise exception 'STALE_RESULT'; end if;
  insert into public.result_snapshots(gathering_id,revision,criteria,candidates,member_ids)
    values(g.id,p_revision,p_criteria,p_candidates,p_members) on conflict(gathering_id,revision) do nothing;
  select * into s from public.result_snapshots where gathering_id=g.id and revision=p_revision;
  update public.gatherings set current_snapshot_id=s.id,status='calculated' where id=g.id;
  return to_jsonb(s) || jsonb_build_object('revision',s.revision::text);
end;
$$;
revoke all on function public.commit_gathering_snapshot(uuid,bigint,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.commit_gathering_snapshot(uuid,bigint,jsonb,jsonb,uuid[]) to service_role;

create function public.save_availability_draft(p_gathering_id uuid,p_version bigint,p_cells jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gatherings; d public.availability_drafts;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id=p_gathering_id for update;
  if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
  if not exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined') then raise exception 'NOT_MEMBER'; end if;
  select * into d from public.availability_drafts where gathering_id=g.id and user_id=auth.uid() for update;
  if d.cells=p_cells and d.version=p_version+1 then return jsonb_build_object('cells',d.cells,'version',d.version::text); end if;
  if g.status in ('finalized','cancelled') or now()>=g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  if d.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
  if jsonb_typeof(p_cells) <> 'object' or exists(select 1 from jsonb_each_text(p_cells) e where e.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-([01][0-9]|2[0-3]):(00|30)$' or e.value not in ('unknown','green','yellow','red')) then raise exception 'INVALID_CELLS'; end if;
  if exists(select 1 from jsonb_each(p_cells) e where substring(e.key,1,10)::date not between g.date_start and g.date_end or substring(e.key,12)::time < g.daily_start or substring(e.key,12)::time >= g.daily_end) then raise exception 'CELL_OUT_OF_RANGE'; end if;
  update public.availability_drafts set cells=p_cells,version=version+1,updated_at=now() where gathering_id=g.id and user_id=auth.uid() returning * into d;
  return jsonb_build_object('cells',d.cells,'version',d.version::text);
end;
$$;
revoke all on function public.save_availability_draft(uuid,bigint,jsonb) from public,anon;
grant execute on function public.save_availability_draft(uuid,bigint,jsonb) to authenticated;

alter table public.calendar_events add column gathering_id uuid references public.gatherings(id) on delete set null;
create unique index calendar_event_gathering_owner on public.calendar_events(user_id,gathering_id) where gathering_id is not null;
create function public.add_finalized_calendar_event(p_gathering_id uuid,p_snapshot_id uuid,p_candidate_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gatherings; e public.calendar_events; source_id uuid; c jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id=p_gathering_id for update;
  if not found or not exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined') then raise exception 'NOT_MEMBER'; end if;
  if g.status <> 'finalized' or not exists(select 1 from public.finalizations where gathering_id=g.id and snapshot_id=p_snapshot_id and candidate_id=p_candidate_id) then raise exception 'GATHERING_NOT_FINALIZED'; end if;
  select * into e from public.calendar_events where user_id=auth.uid() and (gathering_id=g.id or idempotency_key='gathering-'||g.id::text);
  if found then return to_jsonb(e) || jsonb_build_object('replayed',true); end if;
  select item into c from public.result_snapshots s, jsonb_array_elements(s.candidates) item where s.id=p_snapshot_id and s.gathering_id=g.id and item->>'id'=p_candidate_id;
  if c is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  insert into public.calendar_sources(user_id,provider,external_account_id,calendar_id,display_name,can_write,sync_status)
    values(auth.uid(),'manual','local','primary','我的行事曆',true,'ready') on conflict do nothing;
  select id into source_id from public.calendar_sources where user_id=auth.uid() and provider='manual' and external_account_id='local' and calendar_id='primary';
  insert into public.calendar_events(user_id,source_id,title,color,all_day,start_at,end_at,time_zone,idempotency_key,gathering_id)
    values(auth.uid(),source_id,g.name,'sage',false,(c->>'startsAt')::timestamptz,(c->>'endsAt')::timestamptz,'Asia/Taipei','gathering-'||g.id::text,g.id) returning * into e;
  return to_jsonb(e);
end;
$$;
revoke all on function public.add_finalized_calendar_event(uuid,uuid,text) from public,anon;
grant execute on function public.add_finalized_calendar_event(uuid,uuid,text) to authenticated;

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
  if exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined') then return jsonb_build_object('id',g.id,'name',g.name); end if;
  if g.status in ('finalized', 'cancelled') or now() >= g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  select count(*) into member_count from public.memberships where gathering_id = g.id and status = 'joined';
  if member_count >= 10 and not exists (select 1 from public.memberships where gathering_id = g.id and user_id = auth.uid() and status = 'joined') then raise exception 'GATHERING_FULL'; end if;
  select display_name into profile_name from public.profiles where id = auth.uid();
  insert into public.memberships(gathering_id, user_id, display_name, status) values (g.id, auth.uid(), coalesce(profile_name, '新朋友'), 'joined')
    on conflict (gathering_id, user_id) do update set status = 'joined', left_at = null;
  insert into public.availability_drafts(gathering_id, user_id, cells, version) values (g.id, auth.uid(), '{}'::jsonb, 1) on conflict do nothing;
  update public.gatherings set revision=revision+1 where id=g.id;
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
  previous public.availability_submissions;
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
  select * into previous from public.availability_submissions where gathering_id=p_gathering_id and user_id=auth.uid();
  if found and previous.cells=p_cells then return jsonb_build_object('submitted',true,'submissionVersion',previous.version::text,'gatheringRevision',g.revision::text); end if;
  select coalesce(max(version), 0) + 1 into next_submission_version from public.availability_submissions where gathering_id = p_gathering_id and user_id = auth.uid();
  insert into public.availability_submissions(gathering_id, user_id, cells, version, submitted_at) values (p_gathering_id, auth.uid(), p_cells, next_submission_version, now())
    on conflict (gathering_id, user_id) do update set cells = excluded.cells, version = excluded.version, submitted_at = excluded.submitted_at;
  insert into public.personal_calendar_versions(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  perform public.apply_personal_busy_cells((select version from public.personal_calendar_versions where user_id = auth.uid()), (select coalesce(jsonb_agg(jsonb_build_object('date',substring(e.key,1,10),'minute',split_part(substring(e.key,12),':',1)::integer*60+split_part(substring(e.key,12),':',2)::integer,'status',e.value)), '[]'::jsonb) from jsonb_each_text(p_cells) e));
  update public.gatherings set revision = revision + 1, status = case when status = 'draft' then 'open' else status end where id = p_gathering_id;
  return jsonb_build_object('submitted', true, 'submissionVersion', next_submission_version::text, 'gatheringRevision', (g.revision + 1)::text);
end;
$$;

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
  finalization public.finalizations;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id = p_gathering_id for update;
  if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
  if g.host_id <> auth.uid() then raise exception 'HOST_REQUIRED'; end if;
  if g.status in ('finalized', 'cancelled') then raise exception 'GATHERING_LOCKED'; end if;
  if p_expected_revision is null or g.revision is distinct from p_expected_revision or g.current_snapshot_id is distinct from p_snapshot_id then raise exception 'STALE_RESULT'; end if;
  select * into s from public.result_snapshots where id = p_snapshot_id and gathering_id = p_gathering_id;
  if s.revision is distinct from g.revision then raise exception 'STALE_RESULT'; end if;
  if not found or not exists (select 1 from jsonb_array_elements(s.candidates) candidate where candidate->>'id' = p_candidate_id) then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  insert into public.finalizations(gathering_id, snapshot_id, candidate_id, finalized_by) values (p_gathering_id, p_snapshot_id, p_candidate_id, auth.uid()) returning * into finalization;
  update public.gatherings set status = 'finalized', finalized_at = now() where id = p_gathering_id;
  insert into public.notifications(user_id, kind, payload)
    select m.user_id, 'finalized', jsonb_build_object('gatheringId', p_gathering_id, 'candidateId', p_candidate_id)
    from public.memberships m where m.gathering_id = p_gathering_id and m.status = 'joined';
  return jsonb_build_object('id', finalization.id, 'candidateId', p_candidate_id, 'snapshotId', p_snapshot_id);
end;
$$;