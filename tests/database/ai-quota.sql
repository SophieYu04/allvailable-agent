\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('40000000-0000-4000-8000-000000000001','quota@example.test');
insert into public.ai_usage_daily(usage_date,user_id,imports) values(timezone('Asia/Taipei',now())::date,'40000000-0000-4000-8000-000000000001',70);
insert into public.ai_usage_global(usage_date,imports) values(timezone('Asia/Taipei',now())::date,119);
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
do $$ declare r jsonb; begin
 r:=public.consume_ai_quota('quota-final-allowed',1,999);
 if not (r->>'allowed')::boolean or (r->>'globalCount')::integer<>120 or (r->>'userCount')::integer<>71 then raise exception 'quota counts or disabled account limit incorrect'; end if;
 r:=public.consume_ai_quota('quota-final-allowed',1,999);
 if not (r->>'replayed')::boolean then raise exception 'idempotent replay denied'; end if;
 r:=public.consume_ai_quota('quota-final-denied',1,999);
 if (r->>'allowed')::boolean or r->>'scope'<>'global' or (r->>'count')::integer<>120 then raise exception '120 cap not enforced'; end if;
end $$;
reset role;
do $$ begin
 if (select imports from public.ai_usage_global where usage_date=timezone('Asia/Taipei',now())::date)<>120 then raise exception 'replay counted twice'; end if;
 if exists(select 1 from public.ai_request_keys where idempotency_key='quota-final-denied') then raise exception 'denied request reserved'; end if;
end $$;
rollback;
