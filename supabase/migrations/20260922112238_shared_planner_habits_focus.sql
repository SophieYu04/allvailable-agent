-- Hosted Supabase installs pgcrypto in extensions; local PostgreSQL may use public.
set search_path = public, extensions;
-- Shared planner, daily goals, deadline pinning and focus tracking.
-- All public tables use RLS. Security-definer invitation/ranking functions
-- validate auth.uid() and are executable only by authenticated users.

create schema if not exists yuema_private;
revoke all on schema yuema_private from public, anon;
grant usage on schema yuema_private to authenticated;

create table public.shared_calendars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'sage' check (color in ('sage','blue','peach','lilac')),
  kind text not null default 'shared' check (kind in ('personal','shared')),
  version bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_members (
  calendar_id uuid not null references public.shared_calendars(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key (calendar_id, user_id)
);

create table public.calendar_invites (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.shared_calendars(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  invited_email text not null,
  role text not null default 'editor' check (role in ('editor','viewer')),
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.calendar_events add column calendar_id uuid references public.shared_calendars(id) on delete cascade;

insert into public.shared_calendars(owner_id, name, color, kind)
select p.id, '我的行事曆', 'sage', 'personal' from public.profiles p
where not exists (select 1 from public.shared_calendars c where c.owner_id = p.id and c.kind = 'personal');

insert into public.calendar_members(calendar_id, user_id, role)
select c.id, c.owner_id, 'owner' from public.shared_calendars c
on conflict (calendar_id, user_id) do nothing;

update public.calendar_events e set calendar_id = c.id
from public.shared_calendars c
where c.owner_id = e.user_id and c.kind = 'personal' and e.calendar_id is null;

alter table public.calendar_events alter column calendar_id set not null;
create index calendar_events_calendar_range_idx on public.calendar_events(calendar_id, start_at, end_at) where deleted_at is null and not all_day;

create table public.calendar_event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_event_comments_event_idx on public.calendar_event_comments(event_id, created_at);

alter table public.calendar_deadlines add column pinned boolean not null default false;
alter table public.calendar_deadlines add column pin_order integer not null default 0;

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  color text not null default 'blue' check (color in ('sage','blue','peach','lilac','rose','amber')),
  icon text not null default 'star' check (char_length(icon) between 1 and 40),
  mode text not null default 'personal' check (mode in ('personal','shared')),
  reminder_time time,
  archived_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_members (
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','participant','viewer')),
  joined_on date not null default ((now() at time zone 'Asia/Taipei')::date),
  left_at timestamptz,
  primary key (goal_id, user_id)
);

create table public.goal_invites (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  invited_email text not null,
  role text not null check (role in ('participant','viewer')),
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.goal_checkins (
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checkin_on date not null,
  is_backfill boolean not null default false,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (goal_id, user_id, checkin_on),
  unique (user_id, idempotency_key)
);
create index goal_checkins_user_date_idx on public.goal_checkins(user_id, checkin_on);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'blue' check (color in ('sage','blue','peach','lilac','rose','amber')),
  archived_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  source text not null default 'timer' check (source in ('timer','manual')),
  status text not null default 'running' check (status in ('running','paused','completed')),
  started_at timestamptz not null,
  ended_at timestamptz,
  idempotency_key text,
  version bigint not null default 1,
  conflicted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (ended_at is null or ended_at > started_at)
);
create unique index one_active_focus_session_per_user on public.focus_sessions(user_id) where status in ('running','paused');
create index focus_sessions_user_range_idx on public.focus_sessions(user_id, started_at, ended_at);

create table public.focus_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.focus_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  original_start_at timestamptz not null,
  original_end_at timestamptz,
  start_at timestamptz not null,
  end_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (original_end_at is null or original_end_at > original_start_at),
  check (end_at is null or end_at > start_at)
);
create index focus_segments_user_range_idx on public.focus_segments(user_id, start_at, end_at);

create table public.focus_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.focus_group_members (
  group_id uuid not null references public.focus_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id, user_id)
);

create table public.focus_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.focus_groups(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  invited_email text not null,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.shared_calendars enable row level security;
alter table public.calendar_members enable row level security;
alter table public.calendar_invites enable row level security;
alter table public.calendar_event_comments enable row level security;
alter table public.goals enable row level security;
alter table public.goal_members enable row level security;
alter table public.goal_invites enable row level security;
alter table public.goal_checkins enable row level security;
alter table public.subjects enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.focus_segments enable row level security;
alter table public.focus_groups enable row level security;
alter table public.focus_group_members enable row level security;
alter table public.focus_group_invites enable row level security;

revoke all on public.shared_calendars, public.calendar_members, public.calendar_invites,
  public.calendar_event_comments, public.goals, public.goal_members, public.goal_invites,
  public.goal_checkins, public.subjects, public.focus_sessions, public.focus_segments,
  public.focus_groups, public.focus_group_members, public.focus_group_invites from anon, authenticated;
grant select, insert, update, delete on public.shared_calendars, public.calendar_members,
  public.calendar_invites, public.calendar_event_comments, public.goals, public.goal_members,
  public.goal_invites, public.goal_checkins, public.subjects, public.focus_sessions,
  public.focus_segments, public.focus_groups, public.focus_group_members,
  public.focus_group_invites to authenticated;

create or replace function yuema_private.is_calendar_member(p_calendar_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and exists (
    select 1 from public.calendar_members where calendar_id = p_calendar_id and user_id = p_user_id
  );
$$;
create or replace function yuema_private.can_edit_calendar(p_calendar_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and exists (
    select 1 from public.calendar_members where calendar_id = p_calendar_id and user_id = p_user_id and role in ('owner','editor')
  );
$$;
create or replace function yuema_private.is_calendar_owner(p_calendar_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and exists (
    select 1 from public.shared_calendars where id = p_calendar_id and owner_id = p_user_id
  );
$$;
create or replace function yuema_private.is_goal_member(p_goal_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and exists (
    select 1 from public.goal_members where goal_id = p_goal_id and user_id = p_user_id and left_at is null
  );
$$;
create or replace function yuema_private.is_goal_owner(p_goal_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and exists (
    select 1 from public.goals where id = p_goal_id and owner_id = p_user_id
  );
$$;
create or replace function yuema_private.is_focus_group_member(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and exists (
    select 1 from public.focus_group_members where group_id = p_group_id and user_id = p_user_id and left_at is null
  );
$$;
create or replace function yuema_private.is_focus_group_owner(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and exists (
    select 1 from public.focus_groups where id = p_group_id and owner_id = p_user_id
  );
$$;
create or replace function yuema_private.can_view_profile(p_target_id uuid, p_viewer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_target_id = p_viewer_id or exists (
    select 1 from public.calendar_members mine join public.calendar_members theirs using (calendar_id)
    where mine.user_id = p_viewer_id and theirs.user_id = p_target_id
  ) or exists (
    select 1 from public.goal_members mine join public.goal_members theirs using (goal_id)
    where mine.user_id = p_viewer_id and mine.left_at is null and theirs.user_id = p_target_id and theirs.left_at is null
  ) or exists (
    select 1 from public.focus_group_members mine join public.focus_group_members theirs using (group_id)
    where mine.user_id = p_viewer_id and mine.left_at is null and theirs.user_id = p_target_id and theirs.left_at is null
  );
$$;
revoke all on all functions in schema yuema_private from public, anon;
grant execute on all functions in schema yuema_private to authenticated;

create policy "collaborators can read member profiles" on public.profiles for select to authenticated
  using (yuema_private.can_view_profile(id, (select auth.uid())));

create policy "calendar members read calendars" on public.shared_calendars for select to authenticated
  using (owner_id = (select auth.uid()) or yuema_private.is_calendar_member(id, (select auth.uid())));
create policy "owners create calendars" on public.shared_calendars for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "owners update calendars" on public.shared_calendars for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners delete calendars" on public.shared_calendars for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "members read calendar membership" on public.calendar_members for select to authenticated
  using (yuema_private.is_calendar_owner(calendar_id, (select auth.uid())) or yuema_private.is_calendar_member(calendar_id, (select auth.uid())));
create policy "owners manage calendar membership" on public.calendar_members for all to authenticated
  using (yuema_private.is_calendar_owner(calendar_id, (select auth.uid())))
  with check (yuema_private.is_calendar_owner(calendar_id, (select auth.uid())));

create policy "owners manage calendar invites" on public.calendar_invites for all to authenticated
  using (yuema_private.is_calendar_owner(calendar_id, (select auth.uid())))
  with check (invited_by = (select auth.uid()) and yuema_private.is_calendar_owner(calendar_id, (select auth.uid())));
create policy "invitees read calendar invites" on public.calendar_invites for select to authenticated
  using (lower(invited_email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));

drop policy if exists "calendar events are self manageable" on public.calendar_events;
create policy "calendar members read events" on public.calendar_events for select to authenticated
  using (yuema_private.is_calendar_member(calendar_id, (select auth.uid())));
create policy "calendar editors create events" on public.calendar_events for insert to authenticated
  with check (user_id = (select auth.uid()) and yuema_private.can_edit_calendar(calendar_id, (select auth.uid())));
create policy "calendar editors update events" on public.calendar_events for update to authenticated
  using (yuema_private.can_edit_calendar(calendar_id, (select auth.uid())))
  with check (yuema_private.can_edit_calendar(calendar_id, (select auth.uid())));
create policy "calendar editors delete events" on public.calendar_events for delete to authenticated
  using (yuema_private.can_edit_calendar(calendar_id, (select auth.uid())));

create policy "calendar members read comments" on public.calendar_event_comments for select to authenticated
  using (exists (select 1 from public.calendar_events e where e.id = event_id and yuema_private.is_calendar_member(e.calendar_id, (select auth.uid()))));
create policy "calendar members create comments" on public.calendar_event_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.calendar_events e where e.id = event_id and yuema_private.is_calendar_member(e.calendar_id, (select auth.uid()))));
create policy "comment authors update comments" on public.calendar_event_comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "comment authors delete comments" on public.calendar_event_comments for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "goal members read goals" on public.goals for select to authenticated
  using (owner_id = (select auth.uid()) or yuema_private.is_goal_member(id, (select auth.uid())));
create policy "goal owners create goals" on public.goals for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "goal owners update goals" on public.goals for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "goal owners delete goals" on public.goals for delete to authenticated using (owner_id = (select auth.uid()));
create policy "goal members read membership" on public.goal_members for select to authenticated
  using (yuema_private.is_goal_owner(goal_id, (select auth.uid())) or yuema_private.is_goal_member(goal_id, (select auth.uid())));
create policy "goal owners manage membership" on public.goal_members for all to authenticated
  using (yuema_private.is_goal_owner(goal_id, (select auth.uid())))
  with check (yuema_private.is_goal_owner(goal_id, (select auth.uid())));
create policy "goal owners manage invites" on public.goal_invites for all to authenticated
  using (yuema_private.is_goal_owner(goal_id, (select auth.uid())))
  with check (invited_by = (select auth.uid()) and yuema_private.is_goal_owner(goal_id, (select auth.uid())));
create policy "goal invitees read invites" on public.goal_invites for select to authenticated
  using (lower(invited_email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));
create policy "goal members read checkins" on public.goal_checkins for select to authenticated
  using (yuema_private.is_goal_member(goal_id, (select auth.uid())));
create policy "users create own checkins" on public.goal_checkins for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.goal_members m where m.goal_id = goal_checkins.goal_id and m.user_id = (select auth.uid()) and m.left_at is null and m.role in ('owner','participant')));
create policy "users update own checkins" on public.goal_checkins for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users delete own checkins" on public.goal_checkins for delete to authenticated using (user_id = (select auth.uid()));

create policy "users manage subjects" on public.subjects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users manage focus sessions" on public.focus_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users manage focus segments" on public.focus_segments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "focus members read groups" on public.focus_groups for select to authenticated
  using (owner_id = (select auth.uid()) or yuema_private.is_focus_group_member(id, (select auth.uid())));
create policy "focus owners create groups" on public.focus_groups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "focus owners update groups" on public.focus_groups for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "focus owners delete groups" on public.focus_groups for delete to authenticated using (owner_id = (select auth.uid()));
create policy "focus members read membership" on public.focus_group_members for select to authenticated
  using (yuema_private.is_focus_group_owner(group_id, (select auth.uid())) or yuema_private.is_focus_group_member(group_id, (select auth.uid())));
create policy "focus owners manage membership" on public.focus_group_members for all to authenticated
  using (yuema_private.is_focus_group_owner(group_id, (select auth.uid())))
  with check (yuema_private.is_focus_group_owner(group_id, (select auth.uid())));
create policy "focus owners manage invites" on public.focus_group_invites for all to authenticated
  using (yuema_private.is_focus_group_owner(group_id, (select auth.uid())))
  with check (invited_by = (select auth.uid()) and yuema_private.is_focus_group_owner(group_id, (select auth.uid())));
create policy "focus invitees read invites" on public.focus_group_invites for select to authenticated
  using (lower(invited_email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));

create or replace function public.accept_calendar_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare invitation public.calendar_invites; caller_email text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select * into invitation from public.calendar_invites where token = p_token for update;
  if not found or invitation.accepted_at is not null or invitation.expires_at <= now() then raise exception 'INVITE_INVALID'; end if;
  if lower(invitation.invited_email) <> caller_email then raise exception 'INVITE_FOR_OTHER_USER'; end if;
  insert into public.calendar_members(calendar_id, user_id, role) values (invitation.calendar_id, auth.uid(), invitation.role)
  on conflict (calendar_id, user_id) do update set role = excluded.role;
  update public.calendar_invites set accepted_at = now() where id = invitation.id;
  return invitation.calendar_id;
end; $$;

create or replace function public.accept_goal_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare invitation public.goal_invites; caller_email text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select * into invitation from public.goal_invites where token = p_token for update;
  if not found or invitation.accepted_at is not null or invitation.expires_at <= now() then raise exception 'INVITE_INVALID'; end if;
  if lower(invitation.invited_email) <> caller_email then raise exception 'INVITE_FOR_OTHER_USER'; end if;
  insert into public.goal_members(goal_id, user_id, role) values (invitation.goal_id, auth.uid(), invitation.role)
  on conflict (goal_id, user_id) do update set role = excluded.role, left_at = null;
  update public.goal_invites set accepted_at = now() where id = invitation.id;
  return invitation.goal_id;
end; $$;

create or replace function public.accept_focus_group_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare invitation public.focus_group_invites; caller_email text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select * into invitation from public.focus_group_invites where token = p_token for update;
  if not found or invitation.accepted_at is not null or invitation.expires_at <= now() then raise exception 'INVITE_INVALID'; end if;
  if lower(invitation.invited_email) <> caller_email then raise exception 'INVITE_FOR_OTHER_USER'; end if;
  insert into public.focus_group_members(group_id, user_id, role) values (invitation.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do update set left_at = null;
  update public.focus_group_invites set accepted_at = now() where id = invitation.id;
  return invitation.group_id;
end; $$;

revoke all on function public.accept_calendar_invite(text), public.accept_goal_invite(text), public.accept_focus_group_invite(text) from public, anon;
grant execute on function public.accept_calendar_invite(text), public.accept_goal_invite(text), public.accept_focus_group_invite(text) to authenticated;

create or replace function public.leave_calendar(p_calendar_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if exists (select 1 from public.calendar_members where calendar_id = p_calendar_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'OWNER_CANNOT_LEAVE';
  end if;
  delete from public.calendar_members where calendar_id = p_calendar_id and user_id = auth.uid();
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
end; $$;

create or replace function public.leave_goal(p_goal_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if exists (select 1 from public.goal_members where goal_id = p_goal_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'OWNER_CANNOT_LEAVE';
  end if;
  update public.goal_members set left_at = now() where goal_id = p_goal_id and user_id = auth.uid() and left_at is null;
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
end; $$;

create or replace function public.leave_focus_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if exists (select 1 from public.focus_group_members where group_id = p_group_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'OWNER_CANNOT_LEAVE';
  end if;
  update public.focus_group_members set left_at = now() where group_id = p_group_id and user_id = auth.uid() and left_at is null;
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
end; $$;

revoke all on function public.leave_calendar(uuid), public.leave_goal(uuid), public.leave_focus_group(uuid) from public, anon;
grant execute on function public.leave_calendar(uuid), public.leave_goal(uuid), public.leave_focus_group(uuid) to authenticated;

create or replace function public.focus_group_ranking(p_group_id uuid, p_start timestamptz, p_end timestamptz)
returns table(user_id uuid, display_name text, seconds bigint, is_focusing boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name,
    coalesce(sum(case when s.source = 'timer' and not s.conflicted and fs.deleted_at is null and fs.original_end_at is not null and fs.end_at is not null
      then greatest(0, extract(epoch from least(fs.end_at, fs.original_end_at, p_end) - greatest(fs.start_at, fs.original_start_at, p_start, m.joined_at)))::bigint else 0 end), 0)::bigint,
    exists (select 1 from public.focus_sessions active where active.user_id = m.user_id and active.status = 'running')
  from public.focus_group_members m
  join public.profiles p on p.id = m.user_id
  left join public.focus_sessions s on s.user_id = m.user_id and s.status = 'completed' and s.started_at < p_end and s.ended_at > p_start
  left join public.focus_segments fs on fs.session_id = s.id
  where m.group_id = p_group_id and m.left_at is null
    and yuema_private.is_focus_group_member(p_group_id, auth.uid()) and p_end > p_start
  group by m.user_id, p.display_name
  order by 3 desc, p.display_name;
$$;
revoke all on function public.focus_group_ranking(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.focus_group_ranking(uuid,timestamptz,timestamptz) to authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'invite','availability','finalized','sync_error','friend_share','calendar_invite','calendar_comment','goal_invite','focus_invite'
));

create trigger shared_calendars_updated_at before update on public.shared_calendars for each row execute procedure public.touch_updated_at();
create trigger calendar_event_comments_updated_at before update on public.calendar_event_comments for each row execute procedure public.touch_updated_at();
create trigger goals_updated_at before update on public.goals for each row execute procedure public.touch_updated_at();
create trigger goal_checkins_updated_at before update on public.goal_checkins for each row execute procedure public.touch_updated_at();
create trigger subjects_updated_at before update on public.subjects for each row execute procedure public.touch_updated_at();
create trigger focus_sessions_updated_at before update on public.focus_sessions for each row execute procedure public.touch_updated_at();
create trigger focus_groups_updated_at before update on public.focus_groups for each row execute procedure public.touch_updated_at();

create or replace function public.create_personal_calendar_for_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare calendar_uuid uuid;
begin
  insert into public.shared_calendars(owner_id, name, color, kind)
  values (new.id, '我的行事曆', 'sage', 'personal') returning id into calendar_uuid;
  insert into public.calendar_members(calendar_id, user_id, role) values (calendar_uuid, new.id, 'owner');
  return new;
end; $$;
drop trigger if exists on_profile_created_calendar on public.profiles;
create trigger on_profile_created_calendar after insert on public.profiles for each row execute procedure public.create_personal_calendar_for_user();

-- The finalized gathering RPC predates shared calendars. Keep its idempotent
-- behavior while assigning the event to the caller's private calendar.
create or replace function public.add_finalized_calendar_event(p_gathering_id uuid,p_snapshot_id uuid,p_candidate_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gatherings; e public.calendar_events; source_id uuid; personal_calendar_id uuid; c jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id=p_gathering_id for update;
  if not found or not exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined') then raise exception 'NOT_MEMBER'; end if;
  if g.status <> 'finalized' or not exists(select 1 from public.finalizations where gathering_id=g.id and snapshot_id=p_snapshot_id and candidate_id=p_candidate_id) then raise exception 'GATHERING_NOT_FINALIZED'; end if;
  select * into e from public.calendar_events where user_id=auth.uid() and (gathering_id=g.id or idempotency_key='gathering-'||g.id::text);
  if found then return to_jsonb(e) || jsonb_build_object('replayed',true); end if;
  select item into c from public.result_snapshots s, jsonb_array_elements(s.candidates) item where s.id=p_snapshot_id and s.gathering_id=g.id and item->>'id'=p_candidate_id;
  if c is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  insert into public.calendar_sources(user_id,provider,external_account_id,calendar_id,display_name,can_write,sync_status)
    values(auth.uid(),'manual','local','primary','我的行事曆',true,'ready') on conflict do nothing;
  select id into source_id from public.calendar_sources where user_id=auth.uid() and provider='manual' and external_account_id='local' and calendar_id='primary';
  select id into personal_calendar_id from public.shared_calendars where owner_id=auth.uid() and kind='personal' and deleted_at is null order by created_at limit 1;
  if personal_calendar_id is null then raise exception 'PERSONAL_CALENDAR_NOT_FOUND'; end if;
  insert into public.calendar_events(user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,time_zone,idempotency_key,gathering_id)
    values(auth.uid(),source_id,personal_calendar_id,g.name,'sage',false,(c->>'startsAt')::timestamptz,(c->>'endsAt')::timestamptz,'Asia/Taipei','gathering-'||g.id::text,g.id) returning * into e;
  return to_jsonb(e);
end;
$$;
revoke all on function public.add_finalized_calendar_event(uuid,uuid,text) from public,anon;
grant execute on function public.add_finalized_calendar_event(uuid,uuid,text) to authenticated;
