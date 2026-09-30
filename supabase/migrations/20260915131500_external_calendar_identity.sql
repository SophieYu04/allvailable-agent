-- A provider account can expose more than one calendar. Occurrence IDs are
-- only unique inside that calendar, so the calendar ID is part of the key.
alter table public.external_calendar_events
  drop constraint if exists external_calendar_events_user_id_provider_external_id_key;
alter table public.external_calendar_events
  add constraint external_calendar_events_user_provider_calendar_event_key
  unique (user_id, provider, calendar_id, external_id);
