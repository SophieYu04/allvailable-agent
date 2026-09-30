import type { SupabaseClient } from "@supabase/supabase-js";

export type EventInput = {
  title?: unknown;
  color?: unknown;
  allDay?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  startDate?: unknown;
  endDateExclusive?: unknown;
  timeZone?: unknown;
  sourceId?: unknown;
  calendarId?: unknown;
  expectedVersion?: unknown;
  idempotencyKey?: unknown;
};

export type ValidatedEvent = {
  title: string;
  color: "sage" | "blue" | "peach" | "lilac";
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date_exclusive: string | null;
  time_zone: string | null;
  source_id: string;
  calendar_id: string;
  idempotency_key: string | null;
};

export async function validateEventInput(
  input: EventInput,
  supabase: SupabaseClient,
  userId: string,
  existing?: { sourceId: string; calendarId: string },
): Promise<ValidatedEvent> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 200) throw new Error("EVENT_TITLE_INVALID");
  const color = input.color === "blue" || input.color === "peach" || input.color === "lilac" ? input.color : "sage";
  const allDay = input.allDay === true;
  const sourceId = typeof input.sourceId === "string" ? input.sourceId : "";
  if (!sourceId) throw new Error("EVENT_SOURCE_REQUIRED");
  if (existing?.sourceId !== sourceId) {
    const { data: source, error: sourceError } = await supabase.from("calendar_sources").select("id").eq("id", sourceId).eq("user_id", userId).single();
    if (sourceError || !source) throw new Error("EVENT_SOURCE_NOT_FOUND");
  }
  let calendarId = typeof input.calendarId === "string" ? input.calendarId : existing?.calendarId ?? "";
  if (existing && calendarId !== existing.calendarId) throw new Error("EVENT_CALENDAR_IMMUTABLE");
  if (!calendarId) {
    const { data: personal } = await supabase.from("shared_calendars").select("id").eq("owner_id", userId).eq("kind", "personal").is("deleted_at", null).maybeSingle();
    calendarId = personal?.id ?? "";
  }
  const { data: membership } = await supabase.from("calendar_members").select("role").eq("calendar_id", calendarId).eq("user_id", userId).in("role", ["owner", "editor"]).maybeSingle();
  if (!membership) throw new Error("EVENT_CALENDAR_READ_ONLY");
  const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.length <= 200 ? input.idempotencyKey : null;
  if (allDay) {
    const startDate = dateOnly(input.startDate);
    const endDate = dateOnly(input.endDateExclusive);
    if (!startDate || !endDate || endDate <= startDate) throw new Error("EVENT_DATE_RANGE_INVALID");
    return { title, color, all_day: true, start_at: null, end_at: null, start_date: startDate, end_date_exclusive: endDate, time_zone: null, source_id: sourceId, calendar_id: calendarId, idempotency_key: idempotencyKey };
  }
  const start = instant(input.startAt);
  const end = instant(input.endAt);
  if (!start || !end || end <= start) throw new Error("EVENT_TIME_RANGE_INVALID");
  const timeZone = validTimeZone(input.timeZone) ? input.timeZone : "UTC";
  return { title, color, all_day: false, start_at: start.toISOString(), end_at: end.toISOString(), start_date: null, end_date_exclusive: null, time_zone: timeZone, source_id: sourceId, calendar_id: calendarId, idempotency_key: idempotencyKey };
}

export function dateOnly(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
export function instant(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}

export function eventResponse(row: Record<string, unknown>) {
  return { id: row.id, idempotencyKey: row.idempotency_key, sourceId: row.source_id, calendarId: row.calendar_id, createdBy: row.user_id, title: row.title, color: row.color, allDay: row.all_day, startAt: row.start_at, endAt: row.end_at, startDate: row.start_date, endDateExclusive: row.end_date_exclusive, timeZone: row.time_zone, version: String(row.version), updatedAt: row.updated_at };
}
