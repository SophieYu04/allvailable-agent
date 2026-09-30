-- AI calendar MVP: personal busy cells, resumable imports, and atomic submission.
create table if not exists public.personal_calendar_versions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_busy_cells (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  minute_of_day smallint not null check (minute_of_day between 0 and 1410 and mod(minute_of_day, 30) = 0),
  status public.availability_status not null check (status in ('yellow', 'red')),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date, minute_of_day)
);

create table if not exists public.calendar_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gathering_id uuid references public.gatherings(id) on delete cascade,
  source_kind text not null check (source_kind in ('image', 'voice')),
  status text not null check (status in ('processing', 'rejected', 'needs_clarification', 'ready', 'failed')),
  version bigint not null default 1,
  extraction jsonb not null default '{}'::jsonb,
  clarification_count integer not null default 0 check (clarification_count between 0 and 10),
  idempotency_key text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
alter table public.calendar_imports add column if not exists clarification_count integer not null default 0;

create table if not exists public.ai_usage_daily (
  usage_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  imports integer not null default 0,
  primary key (usage_date, user_id)
);
create table if not exists public.ai_usage_global (
  usage_date date primary key,
  imports integer not null default 0
);
create table if not exists public.ai_request_keys (
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);
create table if not exists public.ai_active_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  request_id uuid not null,
  started_at timestamptz not null default now()
);

create index if not exists calendar_imports_user_expiry_idx on public.calendar_imports(user_id, expires_at);
create index if not exists personal_busy_cells_date_idx on public.personal_busy_cells(user_id, local_date);

create table if not exists public.calendar_import_previews (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.calendar_imports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  import_version bigint not null,
  target_version bigint not null,
  range_start date not null,
  range_end date not null,
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists calendar_import_previews_user_idx on public.calendar_import_previews(user_id, expires_at);
create index if not exists calendar_import_previews_import_idx on public.calendar_import_previews(import_id, created_at desc);

alter table public.personal_calendar_versions enable row level security;
alter table public.personal_busy_cells enable row level security;
alter table public.calendar_imports enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_usage_global enable row level security;
alter table public.ai_request_keys enable row level security;
alter table public.calendar_import_previews enable row level security;
alter table public.ai_active_requests enable row level security;

create policy "personal versions are self readable" on public.personal_calendar_versions for select to authenticated using (user_id = (select auth.uid()));
create policy "personal busy cells are self manageable" on public.personal_busy_cells for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "imports are self manageable" on public.calendar_imports for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "import previews are self manageable" on public.calendar_import_previews for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.consume_ai_quota(p_idempotency_key text, p_user_limit integer default 3, p_global_limit integer default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := timezone('Asia/Taipei', now())::date;
  user_count integer;
  global_count integer;
  user_limit integer := least(greatest(coalesce(p_user_limit, 3), 1), 3);
  global_limit integer := least(greatest(coalesce(p_global_limit, 30), 1), 30);
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if exists (select 1 from public.ai_request_keys where user_id = auth.uid() and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('allowed', true, 'replayed', true);
  end if;
  insert into public.ai_usage_daily(usage_date, user_id) values (today, auth.uid()) on conflict (usage_date, user_id) do nothing;
  insert into public.ai_usage_global(usage_date) values (today) on conflict (usage_date) do nothing;
  select imports into user_count from public.ai_usage_daily where usage_date = today and user_id = auth.uid() for update;
  select imports into global_count from public.ai_usage_global where usage_date = today for update;
  if user_count >= user_limit then return jsonb_build_object('allowed', false, 'scope', 'user', 'count', user_count); end if;
  if global_count >= global_limit then return jsonb_build_object('allowed', false, 'scope', 'global', 'count', global_count); end if;
  update public.ai_usage_daily set imports = imports + 1 where usage_date = today and user_id = auth.uid();
  update public.ai_usage_global set imports = imports + 1 where usage_date = today;
  insert into public.ai_request_keys(user_id, idempotency_key) values (auth.uid(), p_idempotency_key);
  return jsonb_build_object('allowed', true, 'replayed', false, 'userCount', user_count + 1, 'globalCount', global_count + 1);
end;
$$;
revoke all on function public.consume_ai_quota(text, integer, integer) from public;
grant execute on function public.consume_ai_quota(text, integer, integer) to authenticated;

create or replace function public.acquire_ai_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  insert into public.ai_active_requests(user_id, request_id, started_at)
  values (auth.uid(), p_request_id, now())
  on conflict (user_id) do update set request_id = excluded.request_id, started_at = excluded.started_at
  where public.ai_active_requests.started_at < now() - interval '10 minutes';
  return exists (select 1 from public.ai_active_requests where user_id = auth.uid() and request_id = p_request_id);
end;
$$;
revoke all on function public.acquire_ai_request(uuid) from public;
grant execute on function public.acquire_ai_request(uuid) to authenticated;

create or replace function public.release_ai_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  delete from public.ai_active_requests where user_id = auth.uid() and request_id = p_request_id;
  return found;
end;
$$;
revoke all on function public.release_ai_request(uuid) from public;
grant execute on function public.release_ai_request(uuid) to authenticated;

create or replace function public.apply_personal_busy_cells(
  p_expected_version bigint,
  p_changes jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version bigint;
  change jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if jsonb_typeof(coalesce(p_changes, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_CHANGES'; end if;
  insert into public.personal_calendar_versions(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select version into current_version from public.personal_calendar_versions where user_id = auth.uid() for update;
  if p_expected_version is null or current_version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  for change in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    if jsonb_typeof(change) <> 'object' then raise exception 'INVALID_CHANGES'; end if;
    if (change->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (change->>'minute') !~ '^[0-9]+$' then raise exception 'INVALID_CHANGES'; end if;
    if ((change->>'minute')::integer < 0) or ((change->>'minute')::integer > 1410) or mod((change->>'minute')::integer, 30) <> 0 or coalesce(change->>'status', '') not in ('unknown', 'green', 'yellow', 'red') then raise exception 'INVALID_CHANGES'; end if;
    if (change->>'status') in ('red', 'yellow') then
      insert into public.personal_busy_cells(user_id, local_date, minute_of_day, status)
      values (auth.uid(), (change->>'date')::date, (change->>'minute')::smallint, (change->>'status')::availability_status)
      on conflict (user_id, local_date, minute_of_day) do update set status = excluded.status, updated_at = now();
    elsif (change->>'status') = 'green' then
      delete from public.personal_busy_cells where user_id = auth.uid() and local_date = (change->>'date')::date and minute_of_day = (change->>'minute')::smallint;
    end if;
  end loop;
  update public.personal_calendar_versions set version = current_version + 1, updated_at = now() where user_id = auth.uid();
  return current_version + 1;
end;
$$;
revoke all on function public.apply_personal_busy_cells(bigint, jsonb) from public;
grant execute on function public.apply_personal_busy_cells(bigint, jsonb) to authenticated;

create or replace function public.submit_availability(
  p_gathering_id uuid,
  p_expected_draft_version bigint,
  p_cells jsonb,
  p_changes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.gatherings;
  draft public.availability_drafts;
  next_submission_version bigint;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if jsonb_typeof(coalesce(p_cells, '{}'::jsonb)) <> 'object' then raise exception 'INVALID_CELLS'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_cells, '{}'::jsonb)) item where item.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-([01][0-9]|2[0-3]):(00|30)$' or item.value not in ('unknown', 'green', 'yellow', 'red')) then raise exception 'INVALID_CELLS'; end if;
  select * into g from public.gatherings where id = p_gathering_id for update;
  if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
  if g.status in ('finalized', 'cancelled') then raise exception 'GATHERING_LOCKED'; end if;
  if not exists (select 1 from public.memberships where gathering_id = p_gathering_id and user_id = auth.uid() and status = 'joined') then raise exception 'NOT_MEMBER'; end if;
  select * into draft from public.availability_drafts where gathering_id = p_gathering_id and user_id = auth.uid() for update;
  if draft.version is distinct from p_expected_draft_version then raise exception 'VERSION_CONFLICT'; end if;
  select coalesce(max(version), 0) + 1 into next_submission_version from public.availability_submissions where gathering_id = p_gathering_id and user_id = auth.uid();
  insert into public.availability_submissions(gathering_id, user_id, cells, version, submitted_at) values (p_gathering_id, auth.uid(), p_cells, next_submission_version, now())
    on conflict (gathering_id, user_id) do update set cells = excluded.cells, version = excluded.version, submitted_at = excluded.submitted_at;
  -- Only explicit red/yellow/green changes from this submission affect the shared busy store.
  insert into public.personal_calendar_versions(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  perform public.apply_personal_busy_cells((select version from public.personal_calendar_versions where user_id = auth.uid()), p_changes);
  update public.gatherings set revision = revision + 1, status = case when status = 'draft' then 'open' else status end where id = p_gathering_id;
  return jsonb_build_object('submitted', true, 'submissionVersion', next_submission_version, 'gatheringRevision', g.revision + 1);
end;
$$;
revoke all on function public.submit_availability(uuid, bigint, jsonb, jsonb) from public;
grant execute on function public.submit_availability(uuid, bigint, jsonb, jsonb) to authenticated;

create unique index if not exists finalizations_one_per_gathering on public.finalizations(gathering_id);

-- Joining is token-gated in a server-side function; clients cannot insert an arbitrary gathering_id.
drop policy if exists "users can join themselves" on public.memberships;
drop policy if exists "users can update their membership" on public.memberships;
create policy "hosts can create own membership" on public.memberships for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.gatherings g where g.id = gathering_id and g.host_id = (select auth.uid())));
create policy "members can read finalizations" on public.finalizations for select to authenticated using (
  exists (select 1 from public.memberships m where m.gathering_id = finalizations.gathering_id and m.user_id = (select auth.uid()) and m.status = 'joined')
);

drop policy if exists "users own drafts" on public.availability_drafts;
drop policy if exists "users own submissions" on public.availability_submissions;
create policy "members own drafts" on public.availability_drafts for all to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.memberships m where m.gathering_id = availability_drafts.gathering_id and m.user_id = (select auth.uid()) and m.status = 'joined'))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.memberships m where m.gathering_id = availability_drafts.gathering_id and m.user_id = (select auth.uid()) and m.status = 'joined'));
create policy "members own submissions" on public.availability_submissions for select to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.memberships m where m.gathering_id = availability_submissions.gathering_id and m.user_id = (select auth.uid()) and m.status = 'joined'));

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
  if g.status in ('finalized', 'cancelled') then raise exception 'GATHERING_LOCKED'; end if;
  select count(*) into member_count from public.memberships where gathering_id = g.id and status = 'joined';
  if member_count >= 10 and not exists (select 1 from public.memberships where gathering_id = g.id and user_id = auth.uid()) then raise exception 'GATHERING_FULL'; end if;
  select display_name into profile_name from public.profiles where id = auth.uid();
  insert into public.memberships(gathering_id, user_id, display_name, status) values (g.id, auth.uid(), coalesce(profile_name, '新朋友'), 'joined')
    on conflict (gathering_id, user_id) do update set status = 'joined', left_at = null;
  insert into public.availability_drafts(gathering_id, user_id, cells, version) values (g.id, auth.uid(), '{}'::jsonb, 1) on conflict do nothing;
  return jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status, 'dateStart', g.date_start, 'dateEnd', g.date_end);
end;
$$;
revoke all on function public.join_gathering(text) from public;
grant execute on function public.join_gathering(text) to authenticated;

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
  if g.status in ('finalized', 'cancelled') then raise exception 'GATHERING_LOCKED'; end if;
  if p_expected_revision is null or g.revision is distinct from p_expected_revision or g.current_snapshot_id is distinct from p_snapshot_id then raise exception 'STALE_RESULT'; end if;
  select * into s from public.result_snapshots where id = p_snapshot_id and gathering_id = p_gathering_id;
  if not found or not exists (select 1 from jsonb_array_elements(s.candidates) candidate where candidate->>'id' = p_candidate_id) then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  insert into public.finalizations(gathering_id, snapshot_id, candidate_id, finalized_by) values (p_gathering_id, p_snapshot_id, p_candidate_id, auth.uid()) returning * into finalization;
  update public.gatherings set status = 'finalized', finalized_at = now() where id = p_gathering_id;
  return jsonb_build_object('id', finalization.id, 'candidateId', p_candidate_id, 'snapshotId', p_snapshot_id);
end;
$$;
revoke all on function public.finalize_gathering(uuid, uuid, text, bigint) from public;
grant execute on function public.finalize_gathering(uuid, uuid, text, bigint) to authenticated;
