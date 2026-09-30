-- Deadlines are date-only planning items. They deliberately do not participate
-- in the busy-time model used for calendar availability and coordination.
create table public.calendar_deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  due_on date not null,
  completed_at timestamptz,
  version bigint not null default 1,
  idempotency_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index calendar_deadlines_user_due_idx
  on public.calendar_deadlines(user_id, due_on)
  where deleted_at is null;

alter table public.calendar_deadlines enable row level security;
revoke all on public.calendar_deadlines from anon, authenticated;
grant select, insert, update, delete on public.calendar_deadlines to authenticated;

create policy "deadline owners can read"
  on public.calendar_deadlines for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "deadline owners can create"
  on public.calendar_deadlines for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "deadline owners can update"
  on public.calendar_deadlines for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "deadline owners can delete"
  on public.calendar_deadlines for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger calendar_deadlines_updated_at
  before update on public.calendar_deadlines
  for each row execute procedure public.touch_updated_at();
