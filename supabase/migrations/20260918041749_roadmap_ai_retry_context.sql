alter table public.coordination_proposals add column before_input jsonb;
alter table public.coordination_proposals add column affected_submissions integer not null default 0 check (affected_submissions >= 0);
create table public.coordination_transcripts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_key uuid not null,
  transcript text not null,
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key(user_id, request_key)
);
alter table public.coordination_transcripts enable row level security;
create policy "transcript owner reads" on public.coordination_transcripts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.coordination_transcripts from public, anon, authenticated;
grant select on public.coordination_transcripts to authenticated;
