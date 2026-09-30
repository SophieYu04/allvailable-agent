\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,raw_user_meta_data)
select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'test'||i||'@example.test',jsonb_build_object('name','Guest '||i) from generate_series(1,11) i;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.create_gathering_once('30000000-0000-4000-8000-000000000001','{"name":"Ten people","dateStart":"2035-10-03","dateEnd":"2035-10-04","dailyStart":"18:00","dailyEnd":"22:00","duration":60,"deadline":"2035-10-02T18:00:00+08:00","saveAsDraft":true,"hostParticipates":true}') as created \gset
select set_config('test.id',(:'created'::jsonb->>'id'),true);
select set_config('test.token',(:'created'::jsonb->>'invite_token'),true);
do $$ declare g jsonb; i integer; begin
 g:=public.read_gathering(current_setting('test.id')::uuid);
 if g->>'join_code' is not null then raise exception 'draft has code'; end if;
 if g->>'status'<>'draft' then raise exception 'draft not saved'; end if;
 perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
 begin perform public.join_gathering(current_setting('test.token')); raise exception 'joined unpublished invitation'; exception when others then if sqlerrm<>'GATHERING_LOCKED' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
 perform public.manage_gathering(current_setting('test.id')::uuid,1,'30000000-0000-4000-8000-000000000002','publish');
 -- exact replay does not increase revision
 perform public.manage_gathering(current_setting('test.id')::uuid,1,'30000000-0000-4000-8000-000000000002','publish');
 if public.read_gathering(current_setting('test.id')::uuid)->>'revision'<>'2' then raise exception 'publish replay'; end if;
 g:=public.read_gathering(current_setting('test.id')::uuid);
 if (g->>'join_code') is null or (g->>'join_code') !~ '^[0-9]{6}$' then raise exception 'six digit code missing'; end if;
 if public.resolve_gathering_code(g->>'join_code')->>'token' is distinct from current_setting('test.token') then raise exception 'code lookup failed'; end if;
 for i in 1..19 loop perform public.resolve_gathering_code(g->>'join_code'); end loop;
 if public.resolve_gathering_code(g->>'join_code')->>'error' is distinct from 'RATE_LIMITED' then raise exception 'lookup not limited'; end if;

end $$;
do $$ declare i int; g jsonb; d jsonb; c jsonb:='{"2035-10-03-19:00":"green","2035-10-03-19:30":"green"}'; begin
 for i in 2..10 loop
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-'||lpad(i::text,12,'0'),true);
  perform public.join_gathering(current_setting('test.token'));
 end loop;
 perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000011',true);
 begin perform public.join_gathering(current_setting('test.token')); raise exception 'over capacity'; exception when others then if sqlerrm<>'GATHERING_FULL' then raise; end if; end;
 begin perform public.read_gathering(current_setting('test.id')::uuid); raise exception 'nonmember read'; exception when others then if sqlerrm<>'NOT_MEMBER' then raise; end if; end;
 for i in 1..10 loop
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-'||lpad(i::text,12,'0'),true);
  d:=public.save_availability_draft(current_setting('test.id')::uuid,1,c);
  perform public.submit_availability(current_setting('test.id')::uuid,(d->>'version')::bigint,c,'[]');
  perform public.submit_availability(current_setting('test.id')::uuid,(d->>'version')::bigint,c,'[]');
 end loop;
 g:=public.read_gathering(current_setting('test.id')::uuid);
 if jsonb_array_length(g->'availability_submissions')<>10 or jsonb_array_length(g->'availability_drafts')<>1 then raise exception 'private drafts or progress'; end if;
 if (g->'memberships'->0) ? 'is_priority' then raise exception 'priority leak'; end if;
 begin perform public.manage_gathering(current_setting('test.id')::uuid,(g->>'revision')::bigint,gen_random_uuid(),'publish'); raise exception 'nonhost write'; exception when others then if sqlerrm<>'HOST_REQUIRED' then raise; end if; end;
 begin perform is_priority from public.memberships; raise exception 'direct priority leak'; exception when insufficient_privilege then null; end;
 begin perform candidates from public.result_snapshots; raise exception 'raw snapshot leak'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.availability_drafts where user_id<>auth.uid()) then raise exception 'other draft readable'; end if;
 perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
 g:=public.read_gathering(current_setting('test.id')::uuid);
 perform set_config('test.revision',g->>'revision',true);
 begin perform public.manage_gathering(current_setting('test.id')::uuid,1,gen_random_uuid(),'publish'); raise exception 'stale write'; exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; end;
end $$;
set local role service_role;
select public.commit_gathering_snapshot(current_setting('test.id')::uuid,current_setting('test.revision')::bigint,'{"secret":"priority"}','[{"id":"candidate-1","startsAt":"2035-10-03T11:00:00Z","endsAt":"2035-10-03T12:00:00Z","totalScore":20,"priorityScore":2,"participantScores":[]}]','{}') as snapshot \gset
select set_config('test.snapshot',(:'snapshot'::jsonb->>'id'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$ declare g jsonb; begin
 g:=public.read_gathering(current_setting('test.id')::uuid);
 if g->'result_snapshots'->0->'criteria'<>'{}'::jsonb or (g->'result_snapshots'->0->'candidates'->0) ? 'priorityScore' then raise exception 'snapshot criteria leak'; end if;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.finalize_gathering(current_setting('test.id')::uuid,current_setting('test.snapshot')::uuid,'candidate-1',current_setting('test.revision')::bigint);
select public.finalize_gathering(current_setting('test.id')::uuid,current_setting('test.snapshot')::uuid,'candidate-1',current_setting('test.revision')::bigint);
do $$ declare g jsonb; begin
 perform public.manage_gathering(current_setting('test.id')::uuid,current_setting('test.revision')::bigint,gen_random_uuid(),'reopen','{"deadline":"2035-10-02T19:00:00+08:00"}');
 g:=public.read_gathering(current_setting('test.id')::uuid);
 if g->>'status'<>'open' or jsonb_array_length(g->'finalizations')<>1 or jsonb_array_length(g->'result_snapshots')<>0 then raise exception 'reopen history'; end if;
 perform public.manage_gathering(current_setting('test.id')::uuid,(g->>'revision')::bigint,gen_random_uuid(),'settings','{"name":"Edited","dateStart":"2035-10-03","dateEnd":"2035-10-03","dailyStart":"19:00","dailyEnd":"21:00","duration":90,"deadline":"2035-10-02T19:00:00+08:00","hostParticipates":false,"priorityIds":[]}');
 g:=public.read_gathering(current_setting('test.id')::uuid);
 if jsonb_array_length(g->'availability_submissions')<>0 or (g->>'host_participates')::boolean then raise exception 'settings invalidation'; end if;
 if (select count(*) from jsonb_object_keys(g->'availability_drafts'->0->'cells'))<>2 then raise exception 'draft intersection'; end if;
 perform public.manage_gathering(current_setting('test.id')::uuid,(g->>'revision')::bigint,gen_random_uuid(),'add-candidate','{"startsAt":"2035-10-03T19:00:00+08:00"}');
 g:=public.read_gathering(current_setting('test.id')::uuid);
 perform public.manage_gathering(current_setting('test.id')::uuid,(g->>'revision')::bigint,gen_random_uuid(),'remove-candidate','{"startsAt":"2035-10-03T19:00:00+08:00"}');
 perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
 g:=public.read_gathering(current_setting('test.id')::uuid);
 perform public.manage_gathering(current_setting('test.id')::uuid,(g->>'revision')::bigint,gen_random_uuid(),'leave');
 begin perform public.read_gathering(current_setting('test.id')::uuid); raise exception 'left user access'; exception when others then if sqlerrm<>'NOT_MEMBER' then raise; end if; end;
end $$;
-- Simulate an elapsed deadline on the isolated fixture only.
reset role;
update public.gatherings set deadline_at=now()-interval '1 minute' where id=current_setting('test.id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
do $$ declare g jsonb; d jsonb; begin
 g:=public.read_gathering(current_setting('test.id')::uuid); d:=g->'availability_drafts'->0;
 begin perform public.save_availability_draft(current_setting('test.id')::uuid,(d->>'version')::bigint,'{}'); raise exception 'deadline draft accepted'; exception when others then if sqlerrm<>'GATHERING_LOCKED' then raise; end if; end;
 begin perform public.submit_availability(current_setting('test.id')::uuid,(d->>'version')::bigint,'{}','[]'); raise exception 'deadline submission accepted'; exception when others then if sqlerrm<>'GATHERING_LOCKED' then raise; end if; end;
 begin perform public.manage_gathering(current_setting('test.id')::uuid,(g->>'revision')::bigint,gen_random_uuid(),'leave'); raise exception 'deadline leave accepted'; exception when others then if sqlerrm<>'GATHERING_LOCKED' then raise; end if; end;
end $$;
rollback;
