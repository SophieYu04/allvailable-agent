/** Shared contract for future web-server and native calendar adapters. No live connectors yet. */
export type CalendarProvider = "google" | "microsoft" | "apple" | "manual";
export type CalendarTime =
  | { allDay: false; start: string; end: string; timeZone: string }
  | { allDay: true; startDate: string; endDateExclusive: string };
export type UnifiedCalendarEvent = {
  id: string;
  provider: CalendarProvider;
  calendarId: string;
  externalId: string | null;
  title: string;
  time: CalendarTime;
  availability: "busy" | "tentative" | "free";
  version: string;
  updatedAt: string;
};
export type CalendarSyncPage = {
  events: UnifiedCalendarEvent[];
  deletedIds: string[];
  nextPageToken?: string;
  nextSyncToken?: string;
};
export interface CalendarProviderAdapter {
  readonly provider: CalendarProvider;
  listEvents(input: { calendarId: string; start: string; end: string; pageToken?: string; syncToken?: string; signal?: AbortSignal }): Promise<CalendarSyncPage>;
  getBusy(input: { calendarIds: string[]; start: string; end: string; timeZone: string; signal?: AbortSignal }): Promise<Array<{ start: string; end: string; availability: "busy" | "tentative" }>>;
}
