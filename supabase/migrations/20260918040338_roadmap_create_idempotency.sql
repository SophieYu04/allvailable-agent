alter table public.gatherings add column creation_key uuid;
alter table public.gatherings add column creation_input jsonb;
create unique index gathering_creation_owner on public.gatherings(host_id,creation_key) where creation_key is not null;
create function public.create_gathering_once(p_key uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  result := public.create_gathering(p_input->>'name',(p_input->>'dateStart')::date,(p_input->>'dateEnd')::date,
    (p_input->>'dailyStart')::time,(p_input->>'dailyEnd')::time,(p_input->>'duration')::integer,(p_input->>'deadline')::timestamptz,3);
  update public.gatherings set creation_key=p_key,creation_input=p_input where id=(result->>'id')::uuid returning * into g;
  return to_jsonb(g)||jsonb_build_object('revision',g.revision::text);
end;
$$;
revoke all on function public.create_gathering_once(uuid,jsonb) from public,anon;
grant execute on function public.create_gathering_once(uuid,jsonb) to authenticated;
