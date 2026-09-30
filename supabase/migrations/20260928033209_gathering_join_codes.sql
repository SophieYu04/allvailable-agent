-- Codes are discovery handles only; membership and private availability policies stay in force.
alter table public.gatherings add column join_code text unique check (join_code ~ '^[0-9]{6}$');
create function private.assign_gathering_code() returns trigger language plpgsql security definer set search_path='' as $$
declare candidate text; attempt integer;
begin
 if new.status='draft' then new.join_code:=null; return new; end if;
 if TG_OP='UPDATE' and old.join_code is not null then new.join_code:=old.join_code; return new; end if;
 perform pg_advisory_xact_lock(726194);
 for attempt in 1..1000 loop
  candidate:=lpad(floor(random()*1000000)::integer::text,6,'0');
  if not exists(select 1 from public.gatherings where join_code=candidate) then new.join_code:=candidate; return new; end if;
 end loop;
 raise exception 'CODE_CAPACITY_REACHED';
end $$;
revoke all on function private.assign_gathering_code() from public,anon,authenticated;
create trigger assign_gathering_code before insert or update on public.gatherings for each row execute function private.assign_gathering_code();
update public.gatherings set status=status where status<>'draft';

create table private.code_lookup_limits(user_id uuid primary key references auth.users(id) on delete cascade, window_start timestamptz not null, attempts integer not null);
alter table private.code_lookup_limits enable row level security;
revoke all on private.code_lookup_limits from public,anon,authenticated;
create function public.resolve_gathering_code(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempts_now integer; token text;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 insert into private.code_lookup_limits as limits(user_id,window_start,attempts) values(auth.uid(),now(),1)
 on conflict(user_id) do update set
 attempts=case when limits.window_start<now()-interval '10 minutes' then 1 else limits.attempts+1 end,
 window_start=case when limits.window_start<now()-interval '10 minutes' then now() else limits.window_start end
 returning attempts into attempts_now;
 -- Return errors rather than raising so failed guesses consume the limit.
 if attempts_now>20 then return jsonb_build_object('error','RATE_LIMITED'); end if;
 if p_code !~ '^[0-9]{6}$' then return jsonb_build_object('error','INVALID_CODE'); end if;
 select invite_token into token from public.gatherings where join_code=p_code and status not in ('draft','cancelled');
 if token is null then return jsonb_build_object('error','CODE_NOT_FOUND'); end if;
 return jsonb_build_object('token',token);
end $$;
revoke all on function public.resolve_gathering_code(text) from public,anon;
grant execute on function public.resolve_gathering_code(text) to authenticated;
