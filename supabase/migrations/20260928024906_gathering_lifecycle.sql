alter table public.gatherings add column conditions_public boolean not null default false;
alter table public.gatherings add column host_participates boolean not null default true;
alter table public.gatherings add column manual_candidates jsonb not null default '[]';
alter table public.gatherings add column excluded_candidates jsonb not null default '[]';
create table private.gathering_operations(gathering_id uuid references public.gatherings(id) on delete cascade,user_id uuid,request_key uuid,input jsonb,result jsonb,primary key(gathering_id,user_id,request_key));

create function private.validate_gathering_input(p jsonb) returns void language plpgsql set search_path='' as $$
begin
 if coalesce(length(trim(p->>'name')),0) not between 1 and 80
 or (p->>'dateEnd')::date < (p->>'dateStart')::date or (p->>'dateEnd')::date-(p->>'dateStart')::date>13
 or (p->>'duration')::int not between 30 and 240 or (p->>'duration')::int%30<>0
 or (p->>'dailyStart')::time >= (p->>'dailyEnd')::time
 or extract(epoch from ((p->>'dailyEnd')::time-(p->>'dailyStart')::time))/60 < (p->>'duration')::int
 or extract(minute from (p->>'dailyStart')::time)::int%30<>0 or extract(minute from (p->>'dailyEnd')::time)::int%30<>0
 or coalesce((p->>'recommendationCount')::int,3) not between 1 and 3
 or (p->>'deadline')::timestamptz<=now()
 or (p->>'deadline')::timestamptz>=((p->>'dateStart')||'T'||(p->>'dailyStart')||'+08:00')::timestamptz
 then raise exception 'GATHERING_INVALID'; end if;
 if not p ?& array['name','dateStart','dateEnd','dailyStart','dailyEnd','duration','deadline'] then raise exception 'GATHERING_INVALID'; end if;
end $$;
revoke all on function private.validate_gathering_input(jsonb) from public;

create or replace function public.create_gathering_once(p_key uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.gatherings; result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if p_key is null then raise exception 'KEY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into g from public.gatherings where host_id=auth.uid() and creation_key=p_key;
 if found then
  if g.creation_input is distinct from p_input then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(g)||jsonb_build_object('revision',g.revision::text,'replayed',true);
 end if;
 perform private.validate_gathering_input(p_input);
 result:=public.create_gathering(p_input->>'name',(p_input->>'dateStart')::date,(p_input->>'dateEnd')::date,(p_input->>'dailyStart')::time,(p_input->>'dailyEnd')::time,(p_input->>'duration')::int,(p_input->>'deadline')::timestamptz,coalesce((p_input->>'recommendationCount')::int,3));
 update public.gatherings set creation_key=p_key,creation_input=p_input,status=case when p_input->>'saveAsDraft'='true' then 'draft'::public.gathering_status else 'open'::public.gathering_status end,
 conditions_public=coalesce((p_input->>'conditionsPublic')::boolean,false),host_participates=coalesce((p_input->>'hostParticipates')::boolean,true) where id=(result->>'id')::uuid returning * into g;
 if not g.host_participates then update public.memberships set status='left',is_priority=false,left_at=now() where gathering_id=g.id and user_id=auth.uid(); end if;
 return to_jsonb(g)||jsonb_build_object('revision',g.revision::text);
end $$;

create function public.manage_gathering(p_id uuid,p_version bigint,p_key uuid,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.gatherings; previous private.gathering_operations; result jsonb; input jsonb; changed_range boolean; c jsonb; start_at timestamptz; end_at timestamptz;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if p_key is null then raise exception 'KEY_REQUIRED'; end if;
 select * into g from public.gatherings where id=p_id for update;
 if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
 if p_action='leave' then
  if not exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid()) then raise exception 'NOT_MEMBER'; end if;
 elsif g.host_id<>auth.uid() then raise exception 'HOST_REQUIRED'; end if;
 input:=jsonb_build_object('action',p_action,'version',p_version::text,'input',p_input);
 select * into previous from private.gathering_operations where gathering_id=g.id and user_id=auth.uid() and request_key=p_key;
 if found then
  if previous.input is distinct from input then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return previous.result;
 end if;
 if g.revision is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 if p_action='reopen' then
  if g.status not in ('finalized','cancelled','calculated','open') then raise exception 'GATHERING_LOCKED'; end if;
  if (p_input->>'deadline') is null or (p_input->>'deadline')::timestamptz<=now() or (p_input->>'deadline')::timestamptz>=(g.date_start+g.daily_start) at time zone 'Asia/Taipei' then raise exception 'GATHERING_INVALID'; end if;
  update public.gatherings set status='open',deadline_at=(p_input->>'deadline')::timestamptz,current_snapshot_id=null,finalized_at=null where id=g.id;
 elsif p_action='leave' then
  if g.status in ('draft','finalized','cancelled') or now()>=g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  update public.memberships set status='left',is_priority=false,left_at=now() where gathering_id=g.id and user_id=auth.uid();
  if auth.uid()=g.host_id then update public.gatherings set host_participates=false where id=g.id; end if;
 elsif p_action='publish' then
  if g.status<>'draft' or now()>=g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  update public.gatherings set status='open' where id=g.id;
 elsif p_action='settings' then
  if g.status in ('finalized','cancelled') or now()>=g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  perform private.validate_gathering_input(p_input);
  changed_range:=(g.date_start,g.date_end,g.daily_start,g.daily_end,g.duration_minutes) is distinct from ((p_input->>'dateStart')::date,(p_input->>'dateEnd')::date,(p_input->>'dailyStart')::time,(p_input->>'dailyEnd')::time,(p_input->>'duration')::int);
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_input->'priorityIds','[]')) i where not exists(select 1 from public.memberships m where m.gathering_id=g.id and m.user_id=i::uuid and m.status='joined')) then raise exception 'INVALID_PRIORITY'; end if;
  if coalesce((p_input->>'hostParticipates')::boolean,true) and not exists(select 1 from public.memberships where gathering_id=g.id and user_id=g.host_id and status='joined') and (select count(*) from public.memberships where gathering_id=g.id and status='joined')>=10 then raise exception 'GATHERING_FULL'; end if;
  update public.gatherings set name=p_input->>'name',date_start=(p_input->>'dateStart')::date,date_end=(p_input->>'dateEnd')::date,daily_start=(p_input->>'dailyStart')::time,daily_end=(p_input->>'dailyEnd')::time,duration_minutes=(p_input->>'duration')::int,deadline_at=(p_input->>'deadline')::timestamptz,recommendation_count=coalesce((p_input->>'recommendationCount')::int,3),conditions_public=coalesce((p_input->>'conditionsPublic')::boolean,false),host_participates=coalesce((p_input->>'hostParticipates')::boolean,true) where id=g.id;
  update public.memberships set status=case when coalesce((p_input->>'hostParticipates')::boolean,true) then 'joined'::public.member_status else 'left'::public.member_status end where gathering_id=g.id and user_id=g.host_id;
  update public.memberships set is_priority=(status='joined' and coalesce(p_input->'priorityIds','[]') ? user_id::text) where gathering_id=g.id;
  if changed_range then
   update public.availability_drafts d set cells=(select coalesce(jsonb_object_agg(e.key,e.value),'{}') from jsonb_each(d.cells) e where substring(e.key,1,10)::date between (p_input->>'dateStart')::date and (p_input->>'dateEnd')::date and substring(e.key,12)::time>=(p_input->>'dailyStart')::time and substring(e.key,12)::time<(p_input->>'dailyEnd')::time),version=version+1 where gathering_id=g.id;
   delete from public.availability_submissions where gathering_id=g.id;
   update public.gatherings set manual_candidates='[]',excluded_candidates='[]' where id=g.id;
  end if;
 elsif p_action in ('add-candidate','remove-candidate') then
  if g.status in ('draft','finalized','cancelled') then raise exception 'GATHERING_LOCKED'; end if;
  start_at:=(p_input->>'startsAt')::timestamptz;
  end_at:=start_at+make_interval(mins=>g.duration_minutes);
  if start_at is null or start_at<=now() or (start_at at time zone 'Asia/Taipei')::date not between g.date_start and g.date_end or (start_at at time zone 'Asia/Taipei')::time<g.daily_start or end_at>((start_at at time zone 'Asia/Taipei')::date+g.daily_end) at time zone 'Asia/Taipei' or extract(minute from start_at)::int%30<>0 or extract(second from start_at)<>0 then raise exception 'CANDIDATE_INVALID'; end if;
  c:=jsonb_build_object('id',to_char(start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'startsAt',to_char(start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endsAt',to_char(end_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.gatherings set manual_candidates=(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(manual_candidates) v where v->>'id'<>c->>'id'),excluded_candidates=(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(excluded_candidates) v where v#>>'{}'<>c->>'id') where id=g.id;
  if p_action='add-candidate' then
   if jsonb_array_length(g.manual_candidates)>=3 and not exists(select 1 from jsonb_array_elements(g.manual_candidates) v where v->>'id'=c->>'id') then raise exception 'MAX_CANDIDATES'; end if;
   update public.gatherings set manual_candidates=manual_candidates||jsonb_build_array(c) where id=g.id;
  else update public.gatherings set excluded_candidates=excluded_candidates||jsonb_build_array(c->>'id') where id=g.id; end if;
 else raise exception 'ACTION_INVALID'; end if;
 update public.gatherings set revision=revision+1 where id=g.id returning * into g;
 result:=jsonb_build_object('id',g.id,'revision',g.revision::text,'status',g.status);
 insert into private.gathering_operations values(g.id,auth.uid(),p_key,input,result);
 return result;
end $$;
revoke all on function public.manage_gathering(uuid,bigint,uuid,text,jsonb) from public,anon;
grant execute on function public.manage_gathering(uuid,bigint,uuid,text,jsonb) to authenticated;

-- Restrict underlying priority and raw snapshots; serve authorized projections via RPC.
revoke select on public.memberships,public.result_snapshots from authenticated;
grant select(gathering_id,user_id,display_name,status,joined_at,left_at) on public.memberships to authenticated;
create function public.read_gathering(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.gatherings; result jsonb; reveal boolean; rows jsonb; snap public.result_snapshots;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into g from public.gatherings where id=p_id;
 if not found or (g.host_id<>auth.uid() and not exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined')) then raise exception 'NOT_MEMBER'; end if;
 if g.status='draft' and g.host_id<>auth.uid() then raise exception 'NOT_MEMBER'; end if;
 reveal:=g.host_id=auth.uid() or g.conditions_public;
 result:=to_jsonb(g)-'creation_input'-'creation_key'-'manual_candidates'-'excluded_candidates';
 result:=result||jsonb_build_object('revision',g.revision::text,'host_name',(select display_name from public.profiles where id=g.host_id));
 select coalesce(jsonb_agg(case when reveal then to_jsonb(m) else to_jsonb(m)-'is_priority' end),'[]') into rows from public.memberships m where gathering_id=g.id;
 result:=result||jsonb_build_object('memberships',rows);
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'version',version::text)),'[]') into rows from public.availability_submissions where gathering_id=g.id;
 result:=result||jsonb_build_object('availability_submissions',rows);
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'version',version::text,'cells',cells)),'[]') into rows from public.availability_drafts where gathering_id=g.id and user_id=auth.uid();
 result:=result||jsonb_build_object('availability_drafts',rows);
 select * into snap from public.result_snapshots where id=g.current_snapshot_id;
 rows:='[]';
 if found then
  rows:=jsonb_build_array(jsonb_build_object('id',snap.id,'revision',snap.revision::text,'calculated_at',snap.calculated_at,'criteria',case when reveal then snap.criteria else '{}'::jsonb end,'candidates',(select coalesce(jsonb_agg(case when reveal then c else c-'priorityScore' end),'[]') from jsonb_array_elements(snap.candidates) c)));
 end if;
 result:=result||jsonb_build_object('result_snapshots',rows);
 select coalesce(jsonb_agg(to_jsonb(f)),'[]') into rows from public.finalizations f where gathering_id=g.id;
 return result||jsonb_build_object('finalizations',rows);
end $$;
revoke all on function public.read_gathering(uuid) from public,anon;
grant execute on function public.read_gathering(uuid) to authenticated;
create function public.list_gatherings() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(public.read_gathering(g.id) order by g.updated_at desc),'[]') from public.gatherings g where auth.uid() is not null and (g.host_id=auth.uid() or (g.status<>'draft' and exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined')));
$$;
revoke all on function public.list_gatherings() from public,anon;
grant execute on function public.list_gatherings() to authenticated;
-- Creation inputs contain hidden criteria and cannot be exposed through direct table reads.
revoke select on public.gatherings from authenticated;
grant select(id,host_id,name,date_start,date_end,daily_start,daily_end,duration_minutes,deadline_at,recommendation_count,status,invite_token,revision,current_snapshot_id,finalized_at,retention_until,created_at,updated_at,conditions_public,host_participates) on public.gatherings to authenticated;

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
  if g.status in ('draft', 'finalized', 'cancelled') or now() >= g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
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
  if g.status in ('draft', 'finalized', 'cancelled') or now() >= g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
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
  if g.status='finalized' and g.current_snapshot_id=p_snapshot_id and g.revision=p_expected_revision then
    select * into finalization from public.finalizations where gathering_id=g.id and snapshot_id=p_snapshot_id and candidate_id=p_candidate_id;
    if found then return jsonb_build_object('id',finalization.id,'candidateId',p_candidate_id,'snapshotId',p_snapshot_id); end if;
  end if;
  if g.status in ('draft', 'finalized', 'cancelled') then raise exception 'GATHERING_LOCKED'; end if;
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
create or replace function public.commit_gathering_snapshot(p_gathering_id uuid, p_revision bigint, p_criteria jsonb, p_candidates jsonb, p_members uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare g public.gatherings; s public.result_snapshots;
begin
  select * into g from public.gatherings where id = p_gathering_id for update;
  if not found or g.status in ('draft','finalized','cancelled') then raise exception 'GATHERING_LOCKED'; end if;
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


create or replace function public.save_availability_draft(p_gathering_id uuid,p_version bigint,p_cells jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gatherings; d public.availability_drafts;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id=p_gathering_id for update;
  if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
  if not exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined') then raise exception 'NOT_MEMBER'; end if;
  select * into d from public.availability_drafts where gathering_id=g.id and user_id=auth.uid() for update;
  if d.cells=p_cells and d.version=p_version+1 then return jsonb_build_object('cells',d.cells,'version',d.version::text); end if;
  if g.status in ('draft','finalized','cancelled') or now()>=g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  if d.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
  if jsonb_typeof(p_cells) <> 'object' or exists(select 1 from jsonb_each_text(p_cells) e where e.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-([01][0-9]|2[0-3]):(00|30)$' or e.value not in ('unknown','green','yellow','red')) then raise exception 'INVALID_CELLS'; end if;
  if exists(select 1 from jsonb_each(p_cells) e where substring(e.key,1,10)::date not between g.date_start and g.date_end or substring(e.key,12)::time < g.daily_start or substring(e.key,12)::time >= g.daily_end) then raise exception 'CELL_OUT_OF_RANGE'; end if;
  update public.availability_drafts set cells=p_cells,version=version+1,updated_at=now() where gathering_id=g.id and user_id=auth.uid() returning * into d;
  return jsonb_build_object('cells',d.cells,'version',d.version::text);
end;
$$;
revoke all on function public.save_availability_draft(uuid,bigint,jsonb) from public,anon;
grant execute on function public.save_availability_draft(uuid,bigint,jsonb) to authenticated;


create or replace function public.add_finalized_calendar_event(p_gathering_id uuid,p_snapshot_id uuid,p_candidate_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gatherings; e public.calendar_events; source_id uuid; personal_calendar_id uuid; c jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id=p_gathering_id for update;
  if not found or not exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined') then raise exception 'NOT_MEMBER'; end if;
  if g.status <> 'finalized' or g.current_snapshot_id is distinct from p_snapshot_id or not exists(select 1 from public.finalizations where gathering_id=g.id and snapshot_id=p_snapshot_id and candidate_id=p_candidate_id) then raise exception 'GATHERING_NOT_FINALIZED'; end if;
  select * into e from public.calendar_events where user_id=auth.uid() and (gathering_id=g.id or idempotency_key='gathering-'||g.id::text);
  if found then return to_jsonb(e) || jsonb_build_object('replayed',true); end if;
  select item into c from public.result_snapshots s, jsonb_array_elements(s.candidates) item where s.id=p_snapshot_id and s.gathering_id=g.id and item->>'id'=p_candidate_id;
  if c is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  insert into public.calendar_sources(user_id,provider,external_account_id,calendar_id,display_name,can_write,sync_status)
    values(auth.uid(),'manual','local','primary','我的行事曆',true,'ready') on conflict do nothing;
  select id into source_id from public.calendar_sources where user_id=auth.uid() and provider='manual' and external_account_id='local' and calendar_id='primary';
  select id into personal_calendar_id from public.shared_calendars where owner_id=auth.uid() and kind='personal' and deleted_at is null order by created_at limit 1;
  if personal_calendar_id is null then raise exception 'PERSONAL_CALENDAR_NOT_FOUND'; end if;
  insert into public.calendar_events(user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,time_zone,idempotency_key,gathering_id)
    values(auth.uid(),source_id,personal_calendar_id,g.name,'sage',false,(c->>'startsAt')::timestamptz,(c->>'endsAt')::timestamptz,'Asia/Taipei','gathering-'||g.id::text,g.id) returning * into e;
  return to_jsonb(e);
end;
$$;
revoke all on function public.add_finalized_calendar_event(uuid,uuid,text) from public,anon;
grant execute on function public.add_finalized_calendar_event(uuid,uuid,text) to authenticated;
