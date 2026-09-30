-- External provider titles are useful only while rendering the current sync
-- response. Do not retain them in the cloud snapshot or its indexes.
alter table public.external_calendar_events drop column if exists title;
