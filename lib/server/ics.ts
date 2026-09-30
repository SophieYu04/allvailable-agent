export type IcsPreviewEvent = {
  uid: string;
  title: string;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  startDate: string | null;
  endDateExclusive: string | null;
  timeZone: string | null;
  recurrence: string | null;
};

export type IcsParseResult = { events: IcsPreviewEvent[]; questions: Array<{ uid: string; prompt: string }> };

export function parseIcs(input: string): IcsParseResult {
  if (input.length > 5 * 1024 * 1024) throw new Error("ICS_TOO_LARGE");
  const lines = input.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const events: IcsPreviewEvent[] = [];
  const questions: Array<{ uid: string; prompt: string }> = [];
  let current: Record<string, { value: string; tzid: string | null }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT") {
      if (!current) continue;
      const uid = current.UID?.value || crypto.randomUUID();
      const title = current.SUMMARY?.value?.trim() || "未命名事件";
      const start = parseDateValue(current.DTSTART);
      const end = parseDateValue(current.DTEND);
      const recurrence = current.RRULE?.value || null;
      if (!start || !end || !isAfter(start, end)) {
        questions.push({ uid, prompt: "請確認此事件的開始與結束時間或時區" });
      } else if ((!start.allDay && start.timeZone && start.timeZone !== "UTC") || (!end.allDay && end.timeZone && end.timeZone !== "UTC")) {
        questions.push({ uid, prompt: "請確認 ICS 的 IANA 時區後再匯入" });
      } else if (recurrence) {
        questions.push({ uid, prompt: "請確認此重複事件的發生次數與例外，再匯入" });
      }
      events.push({ uid, title, allDay: Boolean(start?.allDay), startAt: start?.startAt ?? null, endAt: end?.startAt ?? null, startDate: start?.startDate ?? null, endDateExclusive: end?.startDate ?? null, timeZone: start?.timeZone ?? null, recurrence });
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const property = line.slice(0, colon);
    const value = line.slice(colon + 1).replace(/\\([\\;,])/g, "$1").replace(/\\n/gi, "\n");
    const [name, ...params] = property.split(";");
    const tzid = params.find((param) => param.toUpperCase().startsWith("TZID="))?.slice(5) || null;
    current[name.toUpperCase()] = { value, tzid };
  }
  if (events.length === 0) throw new Error("ICS_NO_EVENTS");
  return { events, questions };
}

type ParsedDate = { allDay: boolean; startAt?: string; endAt?: string; startDate?: string; endDateExclusive?: string; timeZone: string | null };
function parseDateValue(property?: { value: string; tzid: string | null }): ParsedDate | null {
  if (!property) return null;
  const value = property.value.trim();
  if (/^\d{8}$/.test(value)) return { allDay: true, startDate: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, timeZone: property.tzid };
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;
  const date = utc ? new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`) : new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  if (Number.isNaN(date.getTime())) return null;
  return { allDay: false, startAt: date.toISOString(), timeZone: utc ? "UTC" : property.tzid || "UTC" };
}

function isAfter(start: ParsedDate, end: ParsedDate) {
  if (start.allDay && end.allDay) return String(start.startDate) < String(end.startDate);
  if (!start.allDay && !end.allDay) return new Date(start.startAt!).getTime() < new Date(end.startAt!).getTime();
  return false;
}
