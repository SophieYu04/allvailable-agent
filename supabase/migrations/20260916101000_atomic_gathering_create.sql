-- Keep the host membership and its initial draft in the same transaction as
-- the gathering row. The API calls this function after validating the input.
alter table public.gatherings
  drop constraint if exists gatherings_date_range_check;
alter table public.gatherings
  add constraint gatherings_date_range_check
  check (date_end >= date_start and date_end - date_start <= 13)
  not valid;

create or replace function public.create_gathering(
  p_name text,
  p_date_start date,
  p_date_end date,
  p_daily_start time,
  p_daily_end time,
  p_duration_minutes integer,
  p_deadline_at timestamptz,
  p_recommendation_count integer default 3
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.gatherings;
  display_name text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'GATHERING_INVALID'; end if;
  if p_date_end < p_date_start or p_date_end - p_date_start > 13 then raise exception 'GATHERING_INVALID'; end if;
  if p_daily_end <= p_daily_start then raise exception 'GATHERING_INVALID'; end if;
  if extract(minute from p_daily_start)::integer % 30 <> 0 or extract(minute from p_daily_end)::integer % 30 <> 0 then raise exception 'GATHERING_INVALID'; end if;
  if p_duration_minutes < 30 or p_duration_minutes > 240 or mod(p_duration_minutes, 30) <> 0 then raise exception 'GATHERING_INVALID'; end if;
  if p_recommendation_count < 1 or p_recommendation_count > 3 then raise exception 'GATHERING_INVALID'; end if;
  if (p_daily_end - p_daily_start) < make_interval(mins => p_duration_minutes) then raise exception 'GATHERING_INVALID'; end if;
  if p_deadline_at <= now() then raise exception 'GATHERING_DEADLINE_PAST'; end if;
  if p_deadline_at >= ((p_date_start + p_daily_start) at time zone 'Asia/Taipei') then raise exception 'GATHERING_DEADLINE_INVALID'; end if;

  select p.display_name into display_name from public.profiles p where p.id = auth.uid();
  insert into public.gatherings(host_id, name, date_start, date_end, daily_start, daily_end, duration_minutes, deadline_at, recommendation_count, status)
    values (auth.uid(), btrim(p_name), p_date_start, p_date_end, p_daily_start, p_daily_end, p_duration_minutes, p_deadline_at, p_recommendation_count, 'open')
    returning * into created;
  insert into public.memberships(gathering_id, user_id, display_name, is_priority)
    values (created.id, auth.uid(), coalesce(display_name, '新朋友'), true);
  insert into public.availability_drafts(gathering_id, user_id, cells, version)
    values (created.id, auth.uid(), '{}'::jsonb, 1);
  return to_jsonb(created);
end;
$$;

revoke all on function public.create_gathering(text, date, date, time, time, integer, timestamptz, integer) from public;
grant execute on function public.create_gathering(text, date, date, time, time, integer, timestamptz, integer) to authenticated;
