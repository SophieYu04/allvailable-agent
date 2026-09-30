\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','owner@example.test','{"name":"Owner"}'),
 ('10000000-0000-4000-8000-000000000002','editor@example.test','{"name":"Editor"}'),
 ('10000000-0000-4000-8000-000000000003','viewer@example.test','{"name":"Viewer"}');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','owner@example.test',true);
insert into public.shared_calendars(owner_id,name,color,kind)
values('10000000-0000-4000-8000-000000000001','共同讀書','blue','shared') returning id as calendar_id \gset
select set_config('test.calendar',:'calendar_id',true);
insert into public.calendar_members(calendar_id,user_id,role)
values(:'calendar_id','10000000-0000-4000-8000-000000000001','owner');
insert into public.calendar_invites(calendar_id,invited_by,invited_email,role)
values(:'calendar_id','10000000-0000-4000-8000-000000000001','editor@example.test','editor') returning token as editor_token \gset
insert into public.calendar_invites(calendar_id,invited_by,invited_email,role)
values(:'calendar_id','10000000-0000-4000-8000-000000000001','viewer@example.test','viewer') returning token as viewer_token \gset

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.email','editor@example.test',true);
select public.accept_calendar_invite(:'editor_token');
select id as source_id from public.calendar_sources
where user_id='10000000-0000-4000-8000-000000000002' and provider='manual'
  and external_account_id='local' and calendar_id='primary' \gset
select set_config('test.source',:'source_id',true);
insert into public.calendar_events(user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,time_zone)
values('10000000-0000-4000-8000-000000000002',:'source_id',:'calendar_id','共享事件','sage',false,'2030-01-01T09:00+08','2030-01-01T10:00+08','Asia/Taipei');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.email','viewer@example.test',true);
select public.accept_calendar_invite(:'viewer_token');
do $$ begin
  if (select count(*) from public.calendar_events where calendar_id=current_setting('test.calendar')::uuid) <> 1 then raise exception 'viewer cannot read shared event'; end if;
  begin
    insert into public.calendar_events(user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,time_zone)
    values(auth.uid(),current_setting('test.source')::uuid,current_setting('test.calendar')::uuid,'forbidden','sage',false,'2030-01-01T11:00+08','2030-01-01T12:00+08','Asia/Taipei');
    raise exception 'viewer modified shared calendar';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
delete from public.calendar_members where calendar_id=:'calendar_id' and user_id='10000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.calendar_events where calendar_id=current_setting('test.calendar')::uuid) then raise exception 'revoked member retained access'; end if; end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.goals(owner_id,title,mode) values(auth.uid(),'每日讀書','shared') returning id as goal_id \gset
select set_config('test.goal',:'goal_id',true);
insert into public.goal_members(goal_id,user_id,role) values(:'goal_id',auth.uid(),'owner');
insert into public.goal_checkins(goal_id,user_id,checkin_on,idempotency_key) values(:'goal_id',auth.uid(),'2030-01-01','same-day');
do $$ begin
  begin
    insert into public.goal_checkins(goal_id,user_id,checkin_on,idempotency_key) values(current_setting('test.goal')::uuid,auth.uid(),'2030-01-01','second-key');
    raise exception 'duplicate daily checkin accepted';
  exception when unique_violation then null; end;
end $$;

insert into public.focus_groups(owner_id,name) values(auth.uid(),'讀書群') returning id as group_id \gset
select set_config('test.group',:'group_id',true);
insert into public.focus_group_members(group_id,user_id,role) values
(:'group_id',auth.uid(),'owner'),(:'group_id','10000000-0000-4000-8000-000000000002','member');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
insert into public.subjects(user_id,name,color) values(auth.uid(),'英文','blue') returning id as subject_id \gset
insert into public.focus_sessions(user_id,subject_id,source,status,started_at,ended_at)
values(auth.uid(),:'subject_id','timer','completed','2030-01-06T09:00+08','2030-01-06T09:30+08') returning id as timer_id \gset
insert into public.focus_segments(session_id,user_id,original_start_at,original_end_at,start_at,end_at)
values(:'timer_id',auth.uid(),'2030-01-06T09:00+08','2030-01-06T09:30+08','2030-01-06T09:00+08','2030-01-06T09:30+08');
insert into public.focus_sessions(user_id,subject_id,source,status,started_at,ended_at)
values(auth.uid(),:'subject_id','manual','completed','2030-01-06T10:00+08','2030-01-06T11:00+08') returning id as manual_id \gset
insert into public.focus_segments(session_id,user_id,original_start_at,original_end_at,start_at,end_at)
values(:'manual_id',auth.uid(),'2030-01-06T10:00+08','2030-01-06T11:00+08','2030-01-06T10:00+08','2030-01-06T11:00+08');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select seconds from public.focus_group_ranking(current_setting('test.group')::uuid,'2030-01-05T00:00+08','2030-01-12T00:00+08') where user_id='10000000-0000-4000-8000-000000000002') <> 1800
  then raise exception 'manual time entered ranking or timer time missing'; end if;
end $$;

reset role;
\echo 'PASS: shared calendar roles/revocation, one daily checkin, timer-only ranking'
rollback;
