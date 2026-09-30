-- Hosted Supabase installs pgcrypto in extensions; local PostgreSQL may use public.
set search_path = public, extensions;
create extension if not exists pgcrypto;

create type public.gathering_status as enum ('draft', 'open', 'calculated', 'finalized', 'cancelled');
create type public.member_status as enum ('joined', 'left');
create type public.availability_status as enum ('unknown', 'green', 'yellow', 'red');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '新朋友',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gatherings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  date_start date not null,
  date_end date not null,
  daily_start time not null default '18:00',
  daily_end time not null default '22:00',
  duration_minutes integer not null default 120 check (duration_minutes between 30 and 240 and mod(duration_minutes, 30) = 0),
  deadline_at timestamptz not null,
  recommendation_count integer not null default 3 check (recommendation_count between 1 and 10),
  status public.gathering_status not null default 'draft',
  invite_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  revision bigint not null default 1,
  current_snapshot_id uuid,
  finalized_at timestamptz,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_end >= date_start and date_end - date_start <= 30),
  check (daily_end > daily_start)
);

create table public.memberships (
  gathering_id uuid not null references public.gatherings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  status public.member_status not null default 'joined',
  is_priority boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (gathering_id, user_id)
);

create table public.availability_drafts (
  gathering_id uuid not null references public.gatherings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cells jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (gathering_id, user_id)
);

create table public.availability_submissions (
  gathering_id uuid not null references public.gatherings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cells jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  submitted_at timestamptz not null default now(),
  primary key (gathering_id, user_id)
);

create table public.result_snapshots (
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.gatherings(id) on delete cascade,
  revision bigint not null,
  criteria jsonb not null default '{}'::jsonb,
  candidates jsonb not null default '[]'::jsonb,
  member_ids uuid[] not null default '{}',
  calculated_at timestamptz not null default now(),
  unique (gathering_id, revision)
);

create table public.finalizations (
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.gatherings(id) on delete cascade,
  snapshot_id uuid not null references public.result_snapshots(id) on delete restrict,
  candidate_id text not null,
  finalized_by uuid not null references public.profiles(id) on delete restrict,
  finalized_at timestamptz not null default now()
);

alter table public.gatherings add constraint gatherings_snapshot_fk foreign key (current_snapshot_id) references public.result_snapshots(id) on delete set null;

create index memberships_user_idx on public.memberships(user_id, status);
create index gatherings_host_idx on public.gatherings(host_id, updated_at desc);
create index gatherings_deadline_idx on public.gatherings(status, deadline_at);
create index result_snapshots_gathering_idx on public.result_snapshots(gathering_id, revision desc);

alter table public.profiles enable row level security;
alter table public.gatherings enable row level security;
alter table public.memberships enable row level security;
alter table public.availability_drafts enable row level security;
alter table public.availability_submissions enable row level security;
alter table public.result_snapshots enable row level security;
alter table public.finalizations enable row level security;

create policy "profiles are self readable" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles are self editable" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "hosts and members can read gatherings" on public.gatherings for select to authenticated using (
  gatherings.host_id = (select auth.uid()) or exists (select 1 from public.memberships m where m.gathering_id = gatherings.id and m.user_id = (select auth.uid()) and m.status = 'joined')
);
create policy "hosts can create gatherings" on public.gatherings for insert to authenticated with check (host_id = (select auth.uid()));
create policy "hosts can update gatherings" on public.gatherings for update to authenticated using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "hosts can delete gatherings" on public.gatherings for delete to authenticated using (host_id = (select auth.uid()));

create policy "members can read membership list" on public.memberships for select to authenticated using (
  memberships.user_id = (select auth.uid()) or exists (select 1 from public.memberships own where own.gathering_id = memberships.gathering_id and own.user_id = (select auth.uid()) and own.status = 'joined')
);
create policy "users can join themselves" on public.memberships for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users can update their membership" on public.memberships for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "users own drafts" on public.availability_drafts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users own submissions" on public.availability_submissions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "members can read snapshots" on public.result_snapshots for select to authenticated using (
  exists (select 1 from public.memberships m where m.gathering_id = result_snapshots.gathering_id and m.user_id = (select auth.uid()) and m.status = 'joined')
);
create policy "hosts can read finalizations" on public.finalizations for select to authenticated using (
  exists (select 1 from public.gatherings g where g.id = gathering_id and g.host_id = (select auth.uid()))
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger gatherings_updated_at before update on public.gatherings for each row execute procedure public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name) values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '新朋友')) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
