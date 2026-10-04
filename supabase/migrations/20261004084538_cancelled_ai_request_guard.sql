create or replace function public.ai_request_is_active(p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.ai_active_requests where user_id=auth.uid() and request_id=p_request_id);
$$;
revoke all on function public.ai_request_is_active(uuid) from public,anon;
grant execute on function public.ai_request_is_active(uuid) to authenticated;
-- A cancellation may arrive before acquisition; remember it so no late request starts.
create table public.ai_cancelled_requests(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,cancelled_at timestamptz not null default now(),primary key(user_id,request_id));
alter table public.ai_cancelled_requests enable row level security;
revoke all on public.ai_cancelled_requests from public,anon,authenticated;
create or replace function public.cancel_ai_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 delete from public.ai_cancelled_requests where user_id=auth.uid() and cancelled_at<now()-interval '1 day';
 insert into public.ai_cancelled_requests(user_id,request_id) values(auth.uid(),p_request_id) on conflict do nothing;
 delete from public.ai_active_requests where user_id=auth.uid() and request_id=p_request_id;
 return true;
end;
$$;
revoke all on function public.cancel_ai_request(uuid) from public,anon;
grant execute on function public.cancel_ai_request(uuid) to authenticated;
create or replace function public.acquire_ai_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 -- Serialize cancellation and acquisition even when the active row does not exist yet.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.ai_cancelled_requests where user_id=auth.uid() and request_id=p_request_id) then return false;end if;
 insert into public.ai_active_requests(user_id,request_id,started_at) values(auth.uid(),p_request_id,now())
 on conflict(user_id) do update set request_id=excluded.request_id,started_at=excluded.started_at where public.ai_active_requests.started_at<now()-interval '10 minutes';
 return exists(select 1 from public.ai_active_requests where user_id=auth.uid() and request_id=p_request_id);
end;
$$;
