-- First-party events are separate from imported busy data. They are safe to
-- sync between the web app and native clients.
create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('apple', 'google', 'microsoft', 'ics', 'manual')),
  external_account_id text not null default 'local',
  calendar_id text not null default 'primary',
  display_name text not null default '',
  include_in_display boolean not null default true,
  include_in_coordination boolean not null default true,
  can_write boolean not null default false,
  sync_cursor text,
  sync_status text not null default 'idle' check (sync_status in ('idle', 'syncing', 'ready', 'error', 'revoked')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_account_id, calendar_id)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.calendar_sources(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  color text not null default 'sage' check (color in ('sage', 'blue', 'peach', 'lilac')),
  all_day boolean not null default false,
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  end_date_exclusive date,
  time_zone text,
  version bigint not null default 1,
  idempotency_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (all_day and start_date is not null and end_date_exclusive is not null and end_date_exclusive > start_date and start_at is null and end_at is null)
    or
    (not all_day and start_at is not null and end_at is not null and end_at > start_at and start_date is null and end_date_exclusive is null)
  ),
  unique (user_id, idempotency_key)
);
create index calendar_events_user_range_idx on public.calendar_events(user_id, start_at, end_at) where deleted_at is null and not all_day;
create index calendar_events_user_dates_idx on public.calendar_events(user_id, start_date, end_date_exclusive) where deleted_at is null and all_day;

create table public.mobile_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  push_token text not null,
  app_version text,
  time_zone text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, push_token)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('invite', 'availability', 'finalized', 'sync_error', 'friend_share')),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table public.friend_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  can_see_tentative boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 30),
  unique (owner_id, friend_id)
);

-- A native calendar connection starts in the app, finishes in the system
-- browser, and returns through a deep link. This one-use record replaces the
-- browser cookie as the OAuth correlation mechanism for mobile clients.
create table public.calendar_link_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  state text not null unique,
  verifier text not null,
  return_to text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index calendar_link_transactions_expiry_idx on public.calendar_link_transactions(expires_at);

-- Native calendars upload only busy/tentative intervals. There is deliberately
-- no title, location, or description column in this table.
create table public.device_calendar_busy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.calendar_sources(id) on delete cascade,
  calendar_id text not null,
  external_event_id text not null,
  occurrence_key text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  availability text not null check (availability in ('busy', 'tentative')),
  synced_at timestamptz not null default now(),
  unique (user_id, source_id, calendar_id, occurrence_key),
  check (end_at > start_at)
);
create index device_calendar_busy_range_idx on public.device_calendar_busy(user_id, start_at, end_at);

create table public.ics_import_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.calendar_sources(id) on delete cascade,
  events jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index ics_import_previews_expiry_idx on public.ics_import_previews(expires_at);

alter table public.calendar_sources enable row level security;
alter table public.calendar_events enable row level security;
alter table public.mobile_devices enable row level security;
alter table public.notifications enable row level security;
alter table public.friend_shares enable row level security;
alter table public.calendar_link_transactions enable row level security;
alter table public.device_calendar_busy enable row level security;
alter table public.ics_import_previews enable row level security;

create policy "calendar sources are self manageable" on public.calendar_sources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar events are self manageable" on public.calendar_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "devices are self manageable" on public.mobile_devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications are self readable" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications are self updatable" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "friend shares are visible to either party" on public.friend_shares for select to authenticated
  using (owner_id = (select auth.uid()) or friend_id = (select auth.uid()));
create policy "owners manage friend shares" on public.friend_shares for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and friend_id <> (select auth.uid()));

grant select, insert, update, delete on public.calendar_sources to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, update, delete on public.mobile_devices to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.friend_shares to authenticated;
revoke all on public.calendar_link_transactions from anon, authenticated;
create policy "device busy is self manageable" on public.device_calendar_busy for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.device_calendar_busy to authenticated;
create policy "ics previews are self manageable" on public.ics_import_previews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.ics_import_previews to authenticated;

create trigger calendar_sources_updated_at before update on public.calendar_sources for each row execute procedure public.touch_updated_at();
create trigger calendar_events_updated_at before update on public.calendar_events for each row execute procedure public.touch_updated_at();

-- New users get a first-party calendar immediately. The API also lazily creates
-- it for accounts created before this migration, so rollout is safe for existing
-- users.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '新朋友'))
  on conflict (id) do nothing;
  insert into public.calendar_sources (user_id, provider, external_account_id, calendar_id, display_name, can_write, sync_status)
  values (new.id, 'manual', 'local', 'primary', '我的行事曆', true, 'ready')
  on conflict (user_id, provider, external_account_id, calendar_id) do nothing;
  return new;
end;
$$;

-- Finalization and its in-app notifications commit together. Push delivery can
-- retry from the notifications row without changing the finalized result.
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
  insert into public.notifications(user_id, kind, payload)
    select m.user_id, 'finalized', jsonb_build_object('gatheringId', p_gathering_id, 'candidateId', p_candidate_id)
    from public.memberships m where m.gathering_id = p_gathering_id and m.status = 'joined';
  return jsonb_build_object('id', finalization.id, 'candidateId', p_candidate_id, 'snapshotId', p_snapshot_id);
end;
$$;
