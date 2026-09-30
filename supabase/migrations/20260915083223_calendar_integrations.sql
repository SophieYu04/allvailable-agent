-- External calendar connections. Tokens are encrypted by the application before storage.
create table public.calendar_connections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  account_email text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  primary key (user_id, provider)
);

create table public.calendar_credentials (
  user_id uuid not null,
  provider text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  expires_at timestamptz,
  token_type text not null default 'Bearer',
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  foreign key (user_id, provider)
    references public.calendar_connections(user_id, provider) on delete cascade
);

create table public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  external_id text not null,
  calendar_id text not null default 'primary',
  title text not null default '',
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  start_date date,
  end_date_exclusive date,
  source_timezone text,
  availability text not null default 'busy' check (availability in ('busy', 'tentative', 'free')),
  source_updated_at timestamptz,
  source_version text,
  html_url text,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, external_id),
  foreign key (user_id, provider)
    references public.calendar_connections(user_id, provider) on delete cascade,
  check (
    (all_day and start_date is not null and end_date_exclusive is not null and start_at is null and end_at is null)
    or
    (not all_day and start_at is not null and end_at is not null and end_at > start_at)
  )
);

create index external_calendar_events_range_idx
  on public.external_calendar_events(user_id, start_at, end_at)
  where not all_day;
create index external_calendar_events_all_day_idx
  on public.external_calendar_events(user_id, start_date, end_date_exclusive)
  where all_day;

alter table public.calendar_connections enable row level security;
alter table public.calendar_credentials enable row level security;
alter table public.external_calendar_events enable row level security;

create policy "calendar connections are self readable"
  on public.calendar_connections for select to authenticated
  using (user_id = (select auth.uid()));
create policy "calendar connections are self deletable"
  on public.calendar_connections for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "external calendar events are self readable"
  on public.external_calendar_events for select to authenticated
  using (user_id = (select auth.uid()));

-- The browser never needs to write provider data or read credentials. The service role
-- performs those operations only after the route has authenticated the Supabase user.
revoke all on public.calendar_connections from anon, authenticated;
revoke all on public.calendar_credentials from anon, authenticated;
revoke all on public.external_calendar_events from anon, authenticated;
grant select, delete on public.calendar_connections to authenticated;
grant select on public.external_calendar_events to authenticated;
