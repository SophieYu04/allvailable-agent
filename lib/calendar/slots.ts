import type { ExtractedEvent, SlotStatus } from "./types";

export const TAIPEI_TIMEZONE = "Asia/Taipei";
const DAY_MS = 86_400_000;

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function dateList(start: string, end: string, limit = 366) {
  const values: string[] = [];
  for (let cursor = parseDate(start), last = parseDate(end); cursor <= last && values.length < limit; cursor += DAY_MS) {
    const date = new Date(cursor);
    values.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`);
  }
  return values;
}

export function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function timeList(start: string, end: string) {
  const output: string[] = [];
  for (let value = minutes(start), last = minutes(end); value < last; value += 30) {
    output.push(`${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`);
  }
  return output;
}

export function cellKey(date: string, time: string) { return `${date}-${time}`; }

export function eventToCells(event: ExtractedEvent, range: { startDate: string; endDate: string }): string[] {
  if ((event.intent !== "busy" && event.intent !== "available" && event.intent !== "tentative") || !event.startDate || !event.endDate) return [];
  const normalized = toTaipeiEvent(event);
  if (!normalized.startDate || !normalized.endDate) return [];
  const startDate = normalized.startDate;
  const endDate = normalized.endDate;
  if (normalized.allDay && (normalized.intent === "busy" || normalized.intent === "tentative")) {
    const result: string[] = [];
    dateList(startDate, endDate).forEach((date) => { for (let value = 0; value < 24 * 60; value += 30) result.push(cellKey(date, `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`)); });
    return result.filter((key) => key.slice(0, 10) >= range.startDate && key.slice(0, 10) <= range.endDate);
  }
  if (!normalized.startTime || !normalized.endTime) return [];
  const startMinute = minutes(normalized.startTime);
  const endMinute = minutes(normalized.endTime);
  const endDay = endDate === startDate && endMinute <= startMinute ? dateList(startDate, endDate).length + 1 : 0;
  const effectiveEndDate = endDay ? addDays(endDate, 1) : endDate;
  const dates = dateList(startDate, effectiveEndDate);
  const result: string[] = [];
  dates.forEach((date) => {
    if (date < range.startDate || date > range.endDate) return;
    const first = date === startDate ? startMinute : 0;
    const last = date === effectiveEndDate ? endMinute : 24 * 60;
    for (let value = (normalized.intent === "available" ? Math.ceil(first / 30) : Math.floor(first / 30)) * 30; normalized.intent === "available" ? value + 30 <= last : value < last; value += 30) {
      if (value >= 24 * 60) continue;
      result.push(cellKey(date, `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`));
    }
  });
  return result;
}

function toTaipeiEvent(event: ExtractedEvent): ExtractedEvent {
  if (!event.sourceTimezone || event.sourceTimezone === TAIPEI_TIMEZONE || event.allDay || !event.startTime || !event.endTime) return event;
  try {
    const start = zonedInstant(event.startDate!, event.startTime, event.sourceTimezone);
    const end = zonedInstant(event.endDate!, event.endTime, event.sourceTimezone);
    const endInstant = end <= start && event.startDate === event.endDate ? new Date(end.getTime() + DAY_MS) : end;
    const startParts = taipeiParts(start);
    const endParts = taipeiParts(endInstant);
    return { ...event, startDate: startParts.date, startTime: startParts.time, endDate: endParts.date, endTime: endParts.time, sourceTimezone: TAIPEI_TIMEZONE };
  } catch {
    return event;
  }
}

function zonedInstant(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localMs = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = localMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(candidate));
    const represented = Date.UTC(Number(parts.find((part) => part.type === "year")?.value), Number(parts.find((part) => part.type === "month")?.value) - 1, Number(parts.find((part) => part.type === "day")?.value), Number(parts.find((part) => part.type === "hour")?.value), Number(parts.find((part) => part.type === "minute")?.value));
    candidate += localMs - represented;
  }
  return new Date(candidate);
}

function taipeiParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TAIPEI_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(value);
  return { date: `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`, time: `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}` };
}

function addDays(value: string, count: number) {
  const date = new Date(parseDate(value) + count * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function patchFromEvents(events: ExtractedEvent[], range: { startDate: string; endDate: string }, current: Record<string, SlotStatus>, completeBlank = false, blankStart = "00:00", blankEnd = "24:00") {
  const proposed: Record<string, SlotStatus> = {};
  events.flatMap((event) => expandEvent(event, range)).forEach((event) => eventToCells(event, range).forEach((key) => { const status = event.intent === "available" ? "green" : event.intent === "tentative" ? "yellow" : "red"; if (proposed[key] !== "red" && (proposed[key] !== "yellow" || status !== "green")) proposed[key] = status; }));
  const next = { ...current, ...proposed };
  if (completeBlank) dateList(range.startDate, range.endDate).forEach((date) => timeList(blankStart, blankEnd).forEach((time) => { const key = cellKey(date, time); if (!(key in next)) next[key] = "green"; }));
  return next;
}

function expandEvent(event: ExtractedEvent, range: { startDate: string; endDate: string }) {
  if (!event.recurrence || !event.startDate || !event.endDate || !event.recurrence.until) return [event];
  const start = parseDate(event.startDate); const until = Math.min(parseDate(event.recurrence.until), parseDate(range.endDate)); const output: ExtractedEvent[] = [];
  for (let cursor = start; cursor <= until; cursor += DAY_MS) {
    const date = new Date(cursor); const origin = new Date(start); const diffDays = Math.round((cursor - start) / DAY_MS); const monthDelta = (date.getUTCFullYear() - origin.getUTCFullYear()) * 12 + date.getUTCMonth() - origin.getUTCMonth(); const weekNumber = Math.floor(diffDays / 7); const matches = event.recurrence.frequency === "daily" ? diffDays % event.recurrence.interval === 0 : event.recurrence.frequency === "weekly" ? weekNumber % event.recurrence.interval === 0 && (event.recurrence.weekdays.length ? event.recurrence.weekdays.includes(date.getUTCDay()) : date.getUTCDay() === origin.getUTCDay()) : date.getUTCDate() === origin.getUTCDate() && monthDelta % event.recurrence.interval === 0;
    if (!matches) continue;
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    output.push({ ...event, id: `${event.id}-${value}`, startDate: value, endDate: new Date(cursor + parseDate(event.endDate) - start).toISOString().slice(0,10), recurrence: null });
  }
  return output.length ? output : [event];
}
