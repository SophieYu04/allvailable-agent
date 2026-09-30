\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000001','a@example.test','{"name":"A"}'),
 ('00000000-0000-4000-8000-000000000002','b@example.test','{"name":"B"}'),
 ('00000000-0000-4000-8000-000000000003','c@example.test','{"name":"C"}');
insert into public.calendar_connections(user_id,provider) values('00000000-0000-4000-8000-000000000001','google');
insert into public.calendar_credentials(user_id,provider,access_token_ciphertext) values('00000000-0000-4000-8000-000000000001','google','synthetic-ciphertext');
select public.begin_calendar_sync('00000000-0000-4000-8000-000000000001','google') as ticket \gset
select public.commit_calendar_sync('00000000-0000-4000-8000-000000000001','google',(:'ticket'::jsonb->>'generation')::timestamptz,(:'ticket'::jsonb->>'revision')::bigint,'primary','2030-01-01T00:00Z','2030-02-01T00:00Z','Asia/Taipei',
 '[{"external_id":"g1","title":"PRIVATE_OWNER_TITLE","all_day":false,"start_at":"2030-01-05T01:00Z","end_at":"2030-01-05T02:00Z","availability":"tentative"}]');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin if (select count(*) from public.external_calendar_events where title='PRIVATE_OWNER_TITLE')<>1 then raise exception 'owner title unavailable'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.external_calendar_events) then raise exception 'private title leak'; end if; end $$;
reset role;
do $$ declare ticket jsonb; begin
 ticket := public.begin_calendar_sync('00000000-0000-4000-8000-000000000001','google');
 begin
 perform public.commit_calendar_sync('00000000-0000-4000-8000-000000000001','google',(ticket->>'generation')::timestamptz,(ticket->>'revision')::bigint,'primary','2030-01-01T00:00Z','2030-02-01T00:00Z','Asia/Taipei','[{"external_id":"g1","title":"BROKEN","all_day":false,"start_at":"2030-01-05T02:00Z","end_at":"2030-01-05T01:00Z","availability":"busy"}]');
 raise exception 'invalid sync should fail';
 exception when check_violation then null; end;
 if (select title from public.external_calendar_events where external_id='g1')<>'PRIVATE_OWNER_TITLE' then raise exception 'partial sync overwrote snapshot'; end if;
 perform public.disconnect_calendar('00000000-0000-4000-8000-000000000001','google');
 begin
 perform public.commit_calendar_sync('00000000-0000-4000-8000-000000000001','google',(ticket->>'generation')::timestamptz,(ticket->>'revision')::bigint,'primary','2030-01-01T00:00Z','2030-02-01T00:00Z','Asia/Taipei','[]');
 raise exception 'stale sync should fail';
 exception when raise_exception then if sqlerrm<>'CALENDAR_SYNC_SUPERSEDED' then raise; end if; end;
 if exists(select 1 from public.calendar_credentials) or exists(select 1 from public.external_calendar_events) then raise exception 'disconnect failed'; end if;
end $$;
\echo 'PASS: owner title RLS, sync rollback, disconnect rejects old sync'
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.create_gathering('test','2030-01-05','2030-01-06','18:00','22:00',60,'2030-01-01T00:00Z',3) as created \gset
select invite_token as invitation from public.gatherings where id=(:'created'::jsonb->>'id')::uuid \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.join_gathering(:'invitation');
select revision as revision_before from public.gatherings where id=(:'created'::jsonb->>'id')::uuid \gset
select public.join_gathering(:'invitation');
select set_config('test.gathering',:'created'::jsonb->>'id',true);
select set_config('test.revision',:'revision_before',true);
do $$ begin
 if (select revision from public.gatherings where id=current_setting('test.gathering')::uuid)<>current_setting('test.revision')::bigint then raise exception 'duplicate join increments revision'; end if;
 if (select count(*) from public.memberships where gathering_id=current_setting('test.gathering')::uuid)<>2 then raise exception 'member read or join failed'; end if;
end $$;
select public.save_availability_draft((:'created'::jsonb->>'id')::uuid,1,'{"2030-01-05-18:00":"green","2030-01-05-18:30":"yellow"}');
select public.save_availability_draft((:'created'::jsonb->>'id')::uuid,1,'{"2030-01-05-18:00":"green","2030-01-05-18:30":"yellow"}');
select public.submit_availability((:'created'::jsonb->>'id')::uuid,2,'{"2030-01-05-18:00":"green","2030-01-05-18:30":"yellow"}','[]');
select public.submit_availability((:'created'::jsonb->>'id')::uuid,2,'{"2030-01-05-18:00":"green","2030-01-05-18:30":"yellow"}','[]');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$ begin if exists(select 1 from public.gatherings) then raise exception 'nonmember access'; end if; end $$;
reset role;
select revision as current_revision from public.gatherings where id=(:'created'::jsonb->>'id')::uuid \gset
select public.commit_gathering_snapshot((:'created'::jsonb->>'id')::uuid,:'current_revision','{}','[{"id":"candidate","startsAt":"2030-01-05T10:00:00Z","endsAt":"2030-01-05T11:00:00Z","participantScores":[]}]',array['00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid]) as snapshot \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.finalize_gathering((:'created'::jsonb->>'id')::uuid,(:'snapshot'::jsonb->>'id')::uuid,'candidate',:'current_revision');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.add_finalized_calendar_event((:'created'::jsonb->>'id')::uuid,(:'snapshot'::jsonb->>'id')::uuid,'candidate');
select public.add_finalized_calendar_event((:'created'::jsonb->>'id')::uuid,(:'snapshot'::jsonb->>'id')::uuid,'candidate');
do $$ begin
 if (select count(*) from public.calendar_events where gathering_id=current_setting('test.gathering')::uuid)<>1 then raise exception 'duplicate calendar event'; end if;
 if (select count(*) from public.finalizations where gathering_id=current_setting('test.gathering')::uuid)<>1 then raise exception 'member cannot read finalization'; end if;
end $$;
reset role;
\echo 'PASS: member RLS, idempotent join/draft/submit, finalized self calendar'
-- AI preview is owner-only; application is explicit and repeatable.
insert into public.coordination_proposals(id,user_id,request_key,input) values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',gen_random_uuid(),
'{"name":"AI test","dateStart":"2030-02-05","dateEnd":"2030-02-06","dailyStart":"18:00","dailyEnd":"22:00","duration":60,"deadline":"2030-02-01T00:00:00+08:00"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.coordination_proposals) then raise exception 'proposal privacy leak'; end if;
 begin perform public.apply_coordination_proposal('10000000-0000-4000-8000-000000000001'); raise exception 'nonowner applied';
 exception when raise_exception then if sqlerrm <> 'PROPOSAL_NOT_FOUND' then raise; end if; end;
 if has_function_privilege('authenticated','public.commit_gathering_snapshot(uuid,bigint,jsonb,jsonb,uuid[])','execute') then raise exception 'client can forge snapshot'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.apply_coordination_proposal('10000000-0000-4000-8000-000000000001') as ai_created \gset
select public.apply_coordination_proposal('10000000-0000-4000-8000-000000000001');
select set_config('test.ai_gathering',:'ai_created'::jsonb->>'id',true);
select public.save_availability_draft((:'ai_created'::jsonb->>'id')::uuid,1,'{"2030-02-05-18:00":"green","2030-02-06-18:00":"yellow"}');
select public.submit_availability((:'ai_created'::jsonb->>'id')::uuid,2,'{"2030-02-05-18:00":"green","2030-02-06-18:00":"yellow"}','[]');
reset role;
insert into public.coordination_proposals(id,user_id,request_key,gathering_id,base_revision,input)
select '10000000-0000-4000-8000-000000000002',host_id,gen_random_uuid(),id,revision,
'{"name":"AI adjusted","dateStart":"2030-02-06","dateEnd":"2030-02-07","dailyStart":"18:00","dailyEnd":"22:00","duration":60,"deadline":"2030-02-01T00:00:00+08:00"}' from public.gatherings where id=current_setting('test.ai_gathering')::uuid;
insert into public.coordination_proposals(id,user_id,request_key,gathering_id,base_revision,input)
select '10000000-0000-4000-8000-000000000003',user_id,gen_random_uuid(),gathering_id,base_revision,input from public.coordination_proposals where id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select public.apply_coordination_proposal('10000000-0000-4000-8000-000000000002');
do $$ begin
 if exists(select 1 from public.availability_submissions where gathering_id=current_setting('test.ai_gathering')::uuid) then raise exception 'changed range left submitted data'; end if;
 if (select cells from public.availability_drafts where gathering_id=current_setting('test.ai_gathering')::uuid) <> '{"2030-02-06-18:00":"yellow"}'::jsonb then raise exception 'intersection draft incorrect'; end if;
 begin perform public.apply_coordination_proposal('10000000-0000-4000-8000-000000000003'); raise exception 'stale proposal applied';
 exception when raise_exception then if sqlerrm <> 'STALE_RESULT' then raise; end if; end;
end $$;
reset role;
insert into public.coordination_transcripts(user_id,request_key,transcript) values ('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'PRIVATE_TRANSCRIPT');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.coordination_transcripts) then raise exception 'transcript leaked'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin if (select count(*) from public.coordination_transcripts)<>1 then raise exception 'owner transcript unavailable'; end if; end $$;
reset role;
\echo 'PASS: AI proposal/transcript privacy, replay, intersection, reconfirmation and stale revision'
rollback;
