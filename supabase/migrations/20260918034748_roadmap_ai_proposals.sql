create table public.coordination_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gathering_id uuid references public.gatherings(id) on delete cascade,
  request_key uuid not null,
  base_revision bigint,
  input jsonb not null,
  questions jsonb not null default '[]',
  applied_gathering_id uuid references public.gatherings(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique(user_id, request_key)
);
alter table public.coordination_proposals enable row level security;
create policy "proposal owner reads" on public.coordination_proposals for select to authenticated using (user_id = (select auth.uid()));
-- Only authenticated server routes insert validated model output.
revoke all on public.coordination_proposals from public, anon, authenticated;
grant select on public.coordination_proposals to authenticated;

create function public.apply_coordination_proposal(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.coordination_proposals; g public.gatherings; result jsonb; v jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into p from public.coordination_proposals where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;
  if p.applied_gathering_id is not null then return jsonb_build_object('id', p.applied_gathering_id, 'replayed', true); end if;
  if p.expires_at <= now() then raise exception 'PROPOSAL_EXPIRED'; end if;
  if jsonb_array_length(p.questions) > 0 then raise exception 'CLARIFICATION_REQUIRED'; end if;
  v := p.input;
  if (v->>'deadline')::timestamptz <= now() or (v->>'deadline')::timestamptz >= ((v->>'dateStart') || 'T' || (v->>'dailyStart') || ':00+08:00')::timestamptz then raise exception 'GATHERING_DEADLINE_INVALID'; end if;
  if p.gathering_id is null then
    result := public.create_gathering(v->>'name', (v->>'dateStart')::date, (v->>'dateEnd')::date,
      (v->>'dailyStart')::time, (v->>'dailyEnd')::time, (v->>'duration')::integer, (v->>'deadline')::timestamptz, 3);
  else
    select * into g from public.gatherings where id = p.gathering_id for update;
    if not found or g.host_id <> auth.uid() then raise exception 'HOST_REQUIRED'; end if;
    if g.status in ('finalized','cancelled') or now() >= g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
    if g.revision <> p.base_revision then raise exception 'STALE_RESULT'; end if;
    if g.date_start <> (v->>'dateStart')::date or g.date_end <> (v->>'dateEnd')::date
      or g.daily_start <> (v->>'dailyStart')::time or g.daily_end <> (v->>'dailyEnd')::time
      or g.duration_minutes <> (v->>'duration')::integer then
      update public.availability_drafts d set cells = coalesce((select jsonb_object_agg(e.key,e.value) from jsonb_each(d.cells) e
        where substring(e.key,1,10)::date between (v->>'dateStart')::date and (v->>'dateEnd')::date
        and substring(e.key,12)::time >= (v->>'dailyStart')::time and substring(e.key,12)::time < (v->>'dailyEnd')::time), '{}'::jsonb),
        version = version + 1, updated_at = now() where gathering_id = g.id;
      delete from public.availability_submissions where gathering_id = g.id;
    end if;
    update public.gatherings set name = v->>'name', date_start = (v->>'dateStart')::date, date_end = (v->>'dateEnd')::date,
      daily_start = (v->>'dailyStart')::time, daily_end = (v->>'dailyEnd')::time, duration_minutes = (v->>'duration')::integer,
      deadline_at = (v->>'deadline')::timestamptz, revision = revision + 1, status = 'open', current_snapshot_id = null
      where id = g.id;
    result := jsonb_build_object('id', g.id);
  end if;
  update public.coordination_proposals set applied_gathering_id = (result->>'id')::uuid where id = p.id;
  return result;
end;
$$;
revoke all on function public.apply_coordination_proposal(uuid) from public, anon;
grant execute on function public.apply_coordination_proposal(uuid) to authenticated;
