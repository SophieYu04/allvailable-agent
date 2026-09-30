-- Google event titles are private to their owner. They are never returned by
-- coordination endpoints; those endpoints use only busy/tentative intervals.
alter table public.external_calendar_events
  add column if not exists title text;

alter table public.external_calendar_events
  add constraint external_calendar_events_title_length
  check (title is null or char_length(title) <= 200);
