-- Members may see who has submitted and the revision number. The API only
-- selects these metadata columns for progress indicators.
drop policy if exists "members own submissions" on public.availability_submissions;
create policy "members can read submission progress" on public.availability_submissions for select to authenticated
  using (exists (select 1 from public.memberships m where m.gathering_id = availability_submissions.gathering_id and m.user_id = (select auth.uid()) and m.status = 'joined'));

-- Progress is intentionally column-scoped. Members can see who submitted and
-- the revision for the progress indicator, while submitted availability cells
-- remain owner-only and are never exposed through the relation API.
revoke select on public.availability_submissions from authenticated;
grant select (gathering_id, user_id, version, submitted_at) on public.availability_submissions to authenticated;
