\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('50000000-0000-4000-8000-000000000001','full-day@example.test'),('50000000-0000-4000-8000-000000000002','other@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
select public.create_gathering_once(gen_random_uuid(),'{"name":"Full day","dateStart":"2035-10-03","dateEnd":"2035-10-04","dailyStart":"18:00","dailyEnd":"22:00","duration":60,"deadline":"2035-10-02T18:00:00+08:00","saveAsDraft":false,"hostParticipates":true}') as created \gset
select set_config('test.id',(:'created'::jsonb->>'id'),true);
do $$ declare d jsonb; c jsonb:='{"2035-10-03-00:00":"green","2035-10-03-23:30":"red"}'; begin
 d:=public.save_availability_draft(current_setting('test.id')::uuid,1,c);
 perform public.submit_availability(current_setting('test.id')::uuid,(d->>'version')::bigint,c,'[]');

 begin perform public.save_availability_draft(current_setting('test.id')::uuid,2,'{"2035-10-05-00:00":"red"}');raise exception 'outside date accepted';exception when others then if sqlerrm<>'CELL_OUT_OF_RANGE' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if (select cells from public.availability_submissions where gathering_id=current_setting('test.id')::uuid)<> '{"2035-10-03-00:00":"green","2035-10-03-23:30":"red"}'::jsonb then raise exception 'full-day submission lost';end if;
end $$;
insert into public.calendar_imports(id,user_id,gathering_id,source_kind,status,extraction,version,expires_at)
values('50000000-0000-4000-8000-000000000003',auth.uid(),current_setting('test.id')::uuid,'voice','ready','{"events":[{"id":"outside","intent":"busy","userConfirmed":false}],"questions":[]}',1,now()+interval '1 hour');
set local role authenticated;
do $$ declare result jsonb; v bigint; begin
 result:=public.confirm_calendar_import_event('50000000-0000-4000-8000-000000000003',1,'outside','[{"date":"2035-10-10","minute":450,"status":"red"},{"date":"2035-10-10","minute":480,"status":"red"}]');
 if not (result->'extraction'->'events'->0->>'userConfirmed')::boolean then raise exception 'card not reviewed';end if;


 perform public.confirm_calendar_import_event('50000000-0000-4000-8000-000000000003',2,'outside','[{"date":"2035-10-10","minute":450,"status":"red"}]');

 perform set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
 begin perform public.confirm_calendar_import_event('50000000-0000-4000-8000-000000000003',2,'outside','[]');raise exception 'other account confirmed';exception when others then if sqlerrm<>'IMPORT_NOT_FOUND' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.personal_busy_cells where user_id='50000000-0000-4000-8000-000000000001' and local_date='2035-10-10')<>2 then raise exception 'outside personal interval lost';end if;
 if (select version from public.personal_calendar_versions where user_id='50000000-0000-4000-8000-000000000001')<>3 then raise exception 'replay wrote twice';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
do $$ declare old_id uuid:=gen_random_uuid();new_id uuid:=gen_random_uuid();begin
 if not public.acquire_ai_request(old_id) then raise exception 'lock not acquired';end if;
 perform public.cancel_ai_request(old_id);
 if public.ai_request_is_active(old_id) or public.acquire_ai_request(old_id) then raise exception 'cancelled request restarted';end if;
 if not public.acquire_ai_request(new_id) then raise exception 'new request still blocked';end if;
 perform public.cancel_ai_request(old_id);
 if not public.ai_request_is_active(new_id) then raise exception 'old cancel removed new lock';end if;
 perform set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
 perform public.cancel_ai_request(new_id);
 perform set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
 if not public.ai_request_is_active(new_id) then raise exception 'other account cancelled lock';end if;
 perform public.cancel_ai_request(new_id);
end $$;
rollback;
