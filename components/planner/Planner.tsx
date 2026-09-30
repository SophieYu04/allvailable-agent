"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Grid3X3,
  Leaf,
  Link2,
  LocateFixed,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Unplug,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import ImportPanel from "@/components/calendar-import/ImportPanel";
import type { Cells } from "@/lib/calendar/types";
import "./planner.css";

type Color = "sage" | "blue" | "peach" | "lilac";
type EventItem = {
  id: string;
  title: string;
  calendarId: string;
  color: Color;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  startDate: string | null;
  endDateExclusive: string | null;
  version: string;
  external?: boolean;
  url?: string | null;
};
type LegacyEvent = { id: string; title: string; date: string; start: string; end: string; color: Color };
type SharedCalendar = { id: string; name: string; color: Color; role: "owner" | "editor" | "viewer"; canManage: boolean };
type Deadline = { id: string; title: string; dueOn: string; completed: boolean; pinned: boolean; pinOrder: number; version: string };
type Source = { id: string; includeInDisplay: boolean };
type ProviderId = "google" | "microsoft";
type Integration = { provider: ProviderId; configured: boolean; connection: null | { account_email: string | null; last_synced_at: string | null; last_error: string | null } };
type ExternalEvent = { provider: ProviderId; externalId: string; title: string; startAt: string | null; endAt: string | null; allDay: boolean; startDate: string | null; endDate?: string | null; url: string | null };
type View = "week" | "month" | "year";
type DialogName = "event" | "deadline" | "calendars" | "legacy" | "import" | "ai" | null;

const legacyKey = "yuema-local-calendar-v1";
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const colors: Color[] = ["sage", "blue", "peach", "lilac"];
const colorNames = ["鼠尾草綠", "霧藍", "杏桃", "丁香紫"];
const blankEvent = (): EventItem => ({
  id: "",
  title: "",
  calendarId: "",
  color: "sage",
  allDay: false,
  startAt: `${format(new Date(), "yyyy-MM-dd")}T09:00`,
  endAt: `${format(new Date(), "yyyy-MM-dd")}T10:00`,
  startDate: null,
  endDateExclusive: null,
  version: "0",
});
const blankDeadline = (): Deadline => ({ id: "", title: "", dueOn: format(new Date(), "yyyy-MM-dd"), completed: false, pinned: true, pinOrder: 0, version: "0" });

function Icon({ label, children, onClick, active = false }: { label: string; children: ReactNode; onClick: () => void; active?: boolean }) {
  return <button type="button" className={`p-icon ${active ? "selected" : ""}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function localDateTime(value: string | null) {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}

function occursOn(event: EventItem, day: Date) {
  const key = format(day, "yyyy-MM-dd");
  if (event.allDay) return Boolean(event.startDate && event.endDateExclusive && event.startDate <= key && key < event.endDateExclusive);
  return event.startAt ? format(new Date(event.startAt), "yyyy-MM-dd") === key : false;
}

function eventTimes(event: EventItem) {
  if (event.allDay || !event.startAt || !event.endAt) return { start: "08:00", end: "09:00" };
  return { start: format(new Date(event.startAt), "HH:mm"), end: format(new Date(event.endAt), "HH:mm") };
}

function minutes(value: string) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "操作失敗");
  return body;
}

export default function Planner() {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>("week");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [externalEvents, setExternalEvents] = useState<EventItem[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [calendars, setCalendars] = useState<SharedCalendar[]>([]);
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Source[]>([]);
  const [legacyEvents, setLegacyEvents] = useState<LegacyEvent[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [draft, setDraft] = useState<EventItem>(blankEvent);
  const [deadlineDraft, setDeadlineDraft] = useState<Deadline>(blankDeadline);
  const [message, setMessage] = useState("");
  const [cells, setCells] = useState<Cells>({});
  const [personalVersion, setPersonalVersion] = useState("1");
  const [duration, setDuration] = useState(60);
  const [provider, setProvider] = useState("Google");
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);

  const week = useMemo(() => startOfWeek(date, { weekStartsOn: 1 }), [date]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week]);
  const range = useMemo(() => {
    const start = view === "year" ? new Date(date.getFullYear(), 0, 1) : view === "month" ? startOfWeek(startOfMonth(date), { weekStartsOn: 1 }) : week;
    const end = view === "year" ? addYears(start, 1) : view === "month" ? addDays(start, 42) : addDays(start, 7);
    return { start, end };
  }, [date, view, week]);

  const refreshIntegrations = useCallback(async (sync: boolean) => {
    try {
      const body = await apiJson<{ providers: Integration[] }>("/api/calendar-integrations");
      setIntegrations(body.providers);
      if (!sync) return;
      const connected = body.providers.filter((item) => item.connection);
      if (!connected.length) return setExternalEvents([]);
      setSyncing(true);
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const results = await Promise.all(connected.map(async (item) => {
        const payload = await apiJson<{ events: ExternalEvent[] }>(`/api/calendar-integrations/${item.provider}/sync`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: range.start.toISOString(), end: range.end.toISOString(), timeZone }),
        });
        return payload.events.map(toExternalEvent);
      }));
      setExternalEvents(results.flat());
    } catch {
      setMessage("外部行事曆暫時無法同步");
    } finally {
      setSyncing(false);
    }
  }, [range.start, range.end]);

  const loadPlanner = useCallback(async () => {
    try {
      const [calendarBody, sourceBody, eventBody, deadlineBody] = await Promise.all([
        apiJson<{ calendars: SharedCalendar[] }>("/api/v1/calendars"),
        apiJson<{ sources: Source[] }>("/api/v1/calendar-sources"),
        apiJson<{ events: EventItem[] }>(`/api/v1/events?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`),
        apiJson<{ deadlines: Deadline[] }>(`/api/v1/deadlines?startDate=${format(range.start, "yyyy-MM-dd")}&endDateExclusive=${format(range.end, "yyyy-MM-dd")}`),
      ]);
      setCalendars(calendarBody.calendars);
      setVisibleCalendars((current) => current.size ? current : new Set(calendarBody.calendars.map((item) => item.id)));
      setSources(sourceBody.sources);
      setEvents(eventBody.events);
      setDeadlines(deadlineBody.deadlines);
      if (legacyEvents.length) setDialog("legacy");
    } catch (error) {
      setMessage(error instanceof Error && error.message === "請先登入" ? "登入後才能同步個人與共享 Planner" : "Planner 暫時無法載入");
    }
  }, [range.start, range.end, legacyEvents.length]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has("invite") || query.has("gathering")) {
      window.location.replace(`/coordinate?${query.toString()}`);
      return;
    }
    if (query.has("calendar_connected")) { setMessage("行事曆已連接"); setDialog("import"); }
    if (query.has("calendar_error")) { setMessage("行事曆連線未完成，請再試一次"); setDialog("import"); }
    if (query.has("calendar_connected") || query.has("calendar_error")) window.history.replaceState({}, "", window.location.pathname);
    const calendarInvite = query.get("calendarInvite");
    if (calendarInvite) {
      void apiJson("/api/v1/calendars/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: calendarInvite }),
      }).then(() => {
        setMessage("已加入共享日曆");
        window.history.replaceState({}, "", window.location.pathname);
        void loadPlanner();
      }).catch((error) => setMessage(error instanceof Error ? error.message : "邀請無法接受"));
    }
    try {
      const stored = JSON.parse(localStorage.getItem(legacyKey) || "[]") as LegacyEvent[];
      if (Array.isArray(stored)) setLegacyEvents(stored.filter(validLegacyEvent));
    } catch { setMessage("無法讀取此裝置的舊行程"); }
    fetch("/api/personal-calendar").then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { version: string; cells: Array<{ local_date: string; minute_of_day: number; status: "red" | "yellow" }> };
      setPersonalVersion(body.version);
      setCells(Object.fromEntries(body.cells.map((cell) => [`${cell.local_date}-${String(Math.floor(cell.minute_of_day / 60)).padStart(2, "0")}:${String(cell.minute_of_day % 60).padStart(2, "0")}`, cell.status])));
    }).catch(() => undefined);
  }, []);

  useEffect(() => { void loadPlanner(); void refreshIntegrations(true); }, [loadPlanner, refreshIntegrations]);

  const busyEvents = useMemo(() => Object.entries(cells).filter(([, status]) => status === "red" || status === "yellow").map(([key, status]) => {
    const datePart = key.slice(0, 10);
    const start = key.slice(11);
    const endMinutes = minutes(start) + 30;
    return {
      id: `busy-${key}`, title: status === "red" ? "忙碌" : "待確認", calendarId: "availability",
      color: status === "red" ? "blue" as const : "peach" as const, allDay: false,
      startAt: new Date(`${datePart}T${start}:00`).toISOString(),
      endAt: new Date(`${datePart}T${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}:00`).toISOString(),
      startDate: null, endDateExclusive: null, version: "0",
    };
  }), [cells]);
  const visibleEvents = [...events.filter((event) => visibleCalendars.has(event.calendarId)), ...busyEvents, ...externalEvents];
  const pinnedDeadlines = deadlines.filter((item) => item.pinned).sort((a, b) => a.pinOrder - b.pinOrder || a.dueOn.localeCompare(b.dueOn));

  function openEvent(day = date, hour = 9) {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setDraft({ ...blankEvent(), calendarId: calendars.find((item) => item.role !== "viewer")?.id ?? "", startAt: format(start, "yyyy-MM-dd'T'HH:mm"), endAt: format(end, "yyyy-MM-dd'T'HH:mm") });
    setDialog("event"); setMessage("");
  }

  function editEvent(event: EventItem) {
    if (event.external) { if (event.url) window.open(event.url, "_blank", "noopener,noreferrer"); else setDialog("import"); return; }
    if (!events.some((item) => item.id === event.id)) return;
    setDraft({ ...event, startAt: localDateTime(event.startAt), endAt: localDateTime(event.endAt) });
    setDialog("event");
  }

  async function saveEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const sourceId = sources.find((item) => item.includeInDisplay)?.id ?? sources[0]?.id;
      if (!sourceId || !draft.calendarId) throw new Error("請先建立可編輯的日曆");
      const payload = {
        sourceId, calendarId: draft.calendarId, title: draft.title.trim(), color: draft.color, allDay: draft.allDay,
        startAt: draft.allDay ? null : new Date(draft.startAt!).toISOString(),
        endAt: draft.allDay ? null : new Date(draft.endAt!).toISOString(),
        startDate: draft.allDay ? draft.startDate : null,
        endDateExclusive: draft.allDay ? draft.endDateExclusive : null,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        expectedVersion: draft.version,
        idempotencyKey: draft.id ? undefined : `web-${crypto.randomUUID()}`,
      };
      const body = await apiJson<{ event: EventItem }>(draft.id ? `/api/v1/events/${draft.id}` : "/api/v1/events", {
        method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setEvents((current) => [...current.filter((item) => item.id !== body.event.id), body.event]);
      setDialog(null); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "事件儲存失敗"); }
  }

  async function deleteEvent() {
    try {
      await apiJson(`/api/v1/events/${draft.id}?version=${encodeURIComponent(draft.version)}`, { method: "DELETE" });
      setEvents((current) => current.filter((item) => item.id !== draft.id)); setDialog(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "事件刪除失敗"); }
  }

  async function saveDeadline(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload = { ...deadlineDraft, expectedVersion: deadlineDraft.version, idempotencyKey: deadlineDraft.id ? undefined : `web-${crypto.randomUUID()}` };
      const body = await apiJson<{ deadline: Deadline }>(deadlineDraft.id ? `/api/v1/deadlines/${deadlineDraft.id}` : "/api/v1/deadlines", {
        method: deadlineDraft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setDeadlines((current) => [...current.filter((item) => item.id !== body.deadline.id), body.deadline]); setDialog(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Deadline 儲存失敗"); }
  }

  async function deleteDeadline() {
    try {
      await apiJson(`/api/v1/deadlines/${deadlineDraft.id}?version=${encodeURIComponent(deadlineDraft.version)}`, { method: "DELETE" });
      setDeadlines((current) => current.filter((item) => item.id !== deadlineDraft.id)); setDialog(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Deadline 刪除失敗"); }
  }

  async function createCalendar(form: FormData) {
    try {
      const body = await apiJson<{ calendar: SharedCalendar }>("/api/v1/calendars", { method: "POST", body: JSON.stringify({ name: form.get("name"), color: form.get("color") }), headers: { "Content-Type": "application/json" } });
      setCalendars((current) => [...current, body.calendar]); setVisibleCalendars((current) => new Set(current).add(body.calendar.id));
    } catch (error) { setMessage(error instanceof Error ? error.message : "無法建立日曆"); }
  }

  async function invite(calendarId: string, email: string, role: "editor" | "viewer") {
    try {
      const body = await apiJson<{ invite: { token: string } }>(`/api/v1/calendars/${calendarId}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
      await navigator.clipboard?.writeText(`${window.location.origin}/planner?calendarInvite=${body.invite.token}`);
      setMessage("邀請連結已複製");
    } catch (error) { setMessage(error instanceof Error ? error.message : "無法建立邀請"); }
  }

  async function importLegacy() {
    try {
      for (const item of legacyEvents) {
        const sourceId = sources[0]?.id;
        const calendarId = calendars.find((calendar) => calendar.role !== "viewer")?.id;
        if (!sourceId || !calendarId) throw new Error("找不到可匯入的日曆");
        await apiJson("/api/v1/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, calendarId, title: item.title, color: item.color, allDay: false, startAt: new Date(`${item.date}T${item.start}:00`).toISOString(), endAt: new Date(`${item.date}T${item.end}:00`).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, idempotencyKey: `legacy-${item.id}` }) });
      }
      localStorage.removeItem(legacyKey); setLegacyEvents([]); setDialog(null); setMessage("舊行程已匯入目前帳號"); await loadPlanner();
    } catch (error) { setMessage(error instanceof Error ? error.message : "舊行程匯入失敗"); }
  }

  function move(amount: number) { setDate(view === "week" ? addDays(date, amount * 7) : view === "month" ? addMonths(date, amount) : addYears(date, amount)); }

  function deadlineRows() {
    const rows = showAllDeadlines ? pinnedDeadlines : pinnedDeadlines.slice(0, 3);
    if (!rows.length) return null;
    return <div className="p-deadline-bars">{rows.map((item) => <div className={`p-deadline-row ${item.completed ? "completed" : ""}`} key={item.id}>
      <button onClick={() => { setDeadlineDraft(item); setDialog("deadline"); }} title={item.title}>{item.title}</button>
      {days.map((day) => { const left = differenceInCalendarDays(new Date(`${item.dueOn}T12:00:00`), day); return <span key={day.toISOString()} className={left === 0 ? "due" : ""}>{left < 0 ? "" : left === 0 ? "今天" : `${left}天`}</span>; })}
    </div>)}{pinnedDeadlines.length > 3 && <button className="p-deadline-more" onClick={() => setShowAllDeadlines((value) => !value)}><ChevronDown size={14}/>{showAllDeadlines ? "收合" : `其餘 ${pinnedDeadlines.length - 3} 項`}</button>}</div>;
  }

  function monthGrid(month: Date, mini = false) {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    return <div className={`p-month-grid ${mini ? "mini" : ""}`}>{weekdays.map((day) => <span className="p-weekday" key={day}>{day}</span>)}{Array.from({ length: 42 }, (_, index) => {
      const day = addDays(first, index); const items = visibleEvents.filter((event) => occursOn(event, day)); const deadlineItems = deadlines.filter((item) => item.dueOn === format(day, "yyyy-MM-dd"));
      return <button key={index} className={`${!isSameMonth(day, month) ? "outside" : ""} ${isSameDay(day, new Date()) ? "today" : ""}`} onClick={() => { setDate(day); setView("week"); }} aria-label={format(day, "yyyy-MM-dd")}><span>{format(day, "d")}</span>{!mini && deadlineItems.slice(0, 1).map((item) => <small className="p-month-event deadline" key={item.id}>⏳ {item.title}</small>)}{!mini && items.slice(0, 3 - Math.min(deadlineItems.length, 1)).map((event) => <small className={`p-month-event ${event.color}`} key={event.id}>{event.title}</small>)}{mini && (items.length > 0 || deadlineItems.length > 0) && <i/>}{!mini && items.length + deadlineItems.length > 3 && <small>+{items.length + deadlineItems.length - 3}</small>}</button>;
    })}</div>;
  }

  const suggestions = days.flatMap((day) => Array.from({ length: 10 }, (_, index) => ({ date: format(day, "yyyy-MM-dd"), start: (index + 9) * 60 }))).filter((slot) => slot.start + duration <= 19 * 60 && new Date(`${slot.date}T${String(slot.start / 60).padStart(2, "0")}:00`) > new Date() && !visibleEvents.some((event) => occursOn(event, new Date(`${slot.date}T12:00:00`)) && minutes(eventTimes(event).start) < slot.start + duration && minutes(eventTimes(event).end) > slot.start)).slice(0, 3);

  return <main className="planner"><div className="p-shell"><aside className="p-rail"><Link href="/" className="p-brand" aria-label="約嗎"><Leaf size={25}/></Link><div className="p-rail-main"><Icon label="週計劃" active={view === "week"} onClick={() => setView("week")}><CalendarRange/></Icon><Icon label="共享日曆" onClick={() => setDialog("calendars")}><Users/></Icon><Icon label="匯入行事曆" onClick={() => setDialog("import")}><ArrowDownToLine/></Icon><Icon label="協調時間" onClick={() => setDialog("ai")}><Sparkles/></Icon></div><a className="p-icon" href="/coordinate" title="多人協調" aria-label="多人協調"><Users/></a><a className="p-profile" href="/login" aria-label="登入帳號"><span/></a></aside><section className="p-workspace"><header className="p-header"><div className="p-heading"><Icon label={view === "week" ? "切換月計劃" : "返回週計劃"} onClick={() => setView(view === "week" ? "month" : "week")}><CalendarDays/></Icon><div><span className="p-year">{format(date, "yyyy")}</span><h1>{view === "year" ? format(date, "yyyy") : format(date, "MMMM")}<span>{view === "week" ? `${format(week, "d")} — ${format(addDays(week, 6), "d")}` : view === "month" ? "月計劃" : "年曆"}</span></h1></div></div><div className="p-header-actions"><div className="p-navigation"><Icon label="上一頁" onClick={() => move(-1)}><ChevronLeft/></Icon><Icon label="回到今天" onClick={() => setDate(new Date())}><LocateFixed/></Icon><Icon label="下一頁" onClick={() => move(1)}><ChevronRight/></Icon></div>{view !== "week" && <Icon label={view === "month" ? "切換年曆" : "切換月計劃"} onClick={() => setView(view === "month" ? "year" : "month")}><Grid3X3/></Icon>}<button className="p-secondary-add" title="新增 Deadline" onClick={() => { setDeadlineDraft({ ...blankDeadline(), dueOn: format(date, "yyyy-MM-dd") }); setDialog("deadline"); }}>D+</button><button className="p-add" title="新增事件" aria-label="新增事件" onClick={() => openEvent()}><Plus/></button></div></header>
  <div className="p-calendar">{view === "week" ? <div className="p-week-scroll"><div className="p-week">{deadlineRows()}<div className="p-days"><div className="p-zone" title={Intl.DateTimeFormat().resolvedOptions().timeZone}><Clock3 size={14}/></div>{days.map((day, index) => <button key={index} className={isSameDay(day, new Date()) ? "today" : ""} onClick={() => openEvent(day)}><span>{weekdays[index]}</span><strong>{format(day, "dd")}</strong></button>)}</div><div className="p-timebody"><div className="p-hours">{Array.from({ length: 16 }, (_, index) => <div key={index}>{String(index + 8).padStart(2, "0")}<span>:00</span></div>)}</div>{days.map((day, index) => { const items = visibleEvents.filter((event) => occursOn(event, day) && !event.allDay); return <div className={`p-day-column ${index > 4 ? "weekend" : ""}`} key={index}>{Array.from({ length: 16 }, (_, hour) => <button className="p-hour-cell" key={hour} onClick={() => openEvent(day, hour + 8)} aria-label={`${format(day, "M/d")} ${hour + 8}:00 新增事件`}/>)}{items.map((event) => { const time = eventTimes(event); return <button key={event.id} className={`p-event ${event.color}`} style={{ top: (Math.max(480, minutes(time.start)) - 480) / 60 * 72 + 3, height: Math.max(24, (Math.min(1440, minutes(time.end)) - Math.max(480, minutes(time.start))) / 60 * 72 - 6) }} onClick={() => editEvent(event)}><span className="p-event-time">{time.start} — {time.end}</span><strong>{event.title}</strong></button>; })}</div>; })}</div></div></div> : view === "month" ? monthGrid(date) : <div className="p-year-grid">{Array.from({ length: 12 }, (_, month) => { const monthDate = new Date(date.getFullYear(), month, 1); return <section key={month}><button className="p-month-title" onClick={() => { setDate(monthDate); setView("month"); }}>{format(monthDate, "MMMM")}<ArrowUpRight size={14}/></button>{monthGrid(monthDate, true)}</section>; })}</div>}</div>
  <footer className="p-footer"><span><i/> {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><span>{syncing ? "同步中" : `${calendars.length} 本日曆 · ${events.length} 個共用事件`}</span><button onClick={() => setDialog("ai")} aria-label="協調時間"><Sparkles size={17}/><span className="p-ai-dot"/></button></footer></section></div>

  <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent className="p-dialog"><DialogTitle>{dialog === "event" ? "事件" : dialog === "deadline" ? "Deadline" : dialog === "calendars" ? "私人與共享日曆" : dialog === "legacy" ? "匯入此瀏覽器的舊行程" : dialog === "import" ? "匯入行事曆" : "協調時間"}</DialogTitle><DialogDescription>{dialog === "legacy" ? "確認下列資料屬於目前登入帳號後再匯入。" : dialog === "calendars" ? "可疊加查看多本日曆；只有擁有者能邀請成員。" : dialog === "deadline" ? "釘選後會在週曆上方顯示每日倒數。" : ""}</DialogDescription>
  {dialog === "event" && <form className="p-form" onSubmit={saveEvent}><input aria-label="事件名稱" placeholder="事件名稱" required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/><select aria-label="所屬日曆" required value={draft.calendarId} disabled={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, calendarId: event.target.value })}>{calendars.map((calendar) => <option key={calendar.id} value={calendar.id} disabled={calendar.role === "viewer"}>{calendar.name}{calendar.role === "viewer" ? "（唯讀）" : ""}</option>)}</select><label className="p-check"><input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft({ ...draft, allDay: event.target.checked, startDate: event.target.checked ? format(new Date(draft.startAt!), "yyyy-MM-dd") : null, endDateExclusive: event.target.checked ? format(addDays(new Date(draft.endAt!), 1), "yyyy-MM-dd") : null })}/>全天</label>{draft.allDay ? <div className="p-times"><input aria-label="開始日期" type="date" required value={draft.startDate ?? ""} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}/><span>—</span><input aria-label="結束日期（不含）" type="date" required value={draft.endDateExclusive ?? ""} onChange={(event) => setDraft({ ...draft, endDateExclusive: event.target.value })}/></div> : <div className="p-times"><input aria-label="開始時間" type="datetime-local" required value={draft.startAt ?? ""} onChange={(event) => setDraft({ ...draft, startAt: event.target.value })}/><span>—</span><input aria-label="結束時間" type="datetime-local" required value={draft.endAt ?? ""} onChange={(event) => setDraft({ ...draft, endAt: event.target.value })}/></div>}<div className="p-form-bottom"><div className="p-swatches">{colors.map((color, index) => <button type="button" key={color} aria-label={colorNames[index]} aria-pressed={draft.color === color} className={color} onClick={() => setDraft({ ...draft, color })}>{draft.color === color && <Check size={15}/>}</button>)}</div>{draft.id && <Icon label="刪除事件" onClick={() => void deleteEvent()}><Trash2/></Icon>}<button className="p-save" type="submit" aria-label="儲存事件"><Check/></button></div></form>}
  {dialog === "deadline" && <form className="p-form" onSubmit={saveDeadline}><input placeholder="Deadline 名稱" required maxLength={200} value={deadlineDraft.title} onChange={(event) => setDeadlineDraft({ ...deadlineDraft, title: event.target.value })}/><input type="date" required value={deadlineDraft.dueOn} onChange={(event) => setDeadlineDraft({ ...deadlineDraft, dueOn: event.target.value })}/><label className="p-check"><input type="checkbox" checked={deadlineDraft.pinned} onChange={(event) => setDeadlineDraft({ ...deadlineDraft, pinned: event.target.checked })}/>釘選到週曆上方</label><label className="p-check"><input type="checkbox" checked={deadlineDraft.completed} onChange={(event) => setDeadlineDraft({ ...deadlineDraft, completed: event.target.checked })}/>已完成（保留並淡化）</label><div className="p-form-bottom">{deadlineDraft.id && <Icon label="刪除 Deadline" onClick={() => void deleteDeadline()}><Trash2/></Icon>}<span className="p-grow"/><button className="p-save" type="submit"><Check/></button></div></form>}
  {dialog === "calendars" && <CalendarManager calendars={calendars} visible={visibleCalendars} onToggle={(id) => setVisibleCalendars((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onCreate={createCalendar} onInvite={invite}/>}
  {dialog === "legacy" && <div className="p-legacy-list">{legacyEvents.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.date}　{item.start}–{item.end}</span></article>)}<div className="p-form-bottom"><button className="p-coordinate-link" onClick={() => { localStorage.removeItem(legacyKey); setLegacyEvents([]); setDialog(null); }}>不要匯入</button><span className="p-grow"/><button className="p-save p-wide-save" onClick={() => void importLegacy()}>確認匯入</button></div></div>}
  {dialog === "import" && <><div className="p-providers">{["Google", "Teams", "TimeTree", "Apple"].map((name) => <button key={name} className={name === provider ? "selected" : ""} onClick={() => setProvider(name)}>{name}</button>)}</div>{provider === "Google" || provider === "Teams" ? <ProviderConnection provider={provider === "Google" ? "google" : "microsoft"} integration={integrations.find((item) => item.provider === (provider === "Google" ? "google" : "microsoft"))} syncing={syncing} onSync={() => void refreshIntegrations(true)} onDisconnect={async (providerId) => { await fetch(`/api/calendar-integrations/${providerId}`, { method: "DELETE" }); await refreshIntegrations(false); }}/> : <p className="p-note">{provider === "TimeTree" ? "TimeTree 已停止公開 API；可匯入行事曆截圖。" : "Web 可匯入截圖；iOS App 會透過 EventKit 讀取已授權的行事曆。"}</p>}<ImportPanel personalVersion={personalVersion} currentCells={cells} onApplied={(next, version) => { setCells(next); if (version) setPersonalVersion(version); }}/></>}
  {dialog === "ai" && <><div className="p-durations">{[30, 60, 90, 120].map((value) => <button key={value} onClick={() => setDuration(value)} className={duration === value ? "selected" : ""}>{value} min</button>)}</div><p className="p-note">依目前可見的私人、共享與外部日曆比對空檔。</p>{suggestions.length ? suggestions.map((slot) => <button className="p-suggestion" key={`${slot.date}-${slot.start}`} onClick={() => { const start = new Date(`${slot.date}T${String(Math.floor(slot.start / 60)).padStart(2, "0")}:00`); openEvent(start, start.getHours()); }}><CalendarDays size={19}/><span>{slot.date.slice(5).replace("-", " / ")}</span><strong>{slot.start / 60}:00</strong><Plus size={18}/></button>) : <p>本週沒有符合的空檔，請切換下一週。</p>}<a className="p-coordinate-link" href="/coordinate"><Users size={18}/>多人協調<ArrowUpRight size={17}/></a></>}
  {message && <p role="status" className="p-note">{message}</p>}</DialogContent></Dialog>{message && !dialog && <div role="status" className="p-status">{message}</div>}</main>;
}

function CalendarManager({ calendars, visible, onToggle, onCreate, onInvite }: { calendars: SharedCalendar[]; visible: Set<string>; onToggle: (id: string) => void; onCreate: (form: FormData) => Promise<void>; onInvite: (calendarId: string, email: string, role: "editor" | "viewer") => Promise<void> }) {
  const [inviteCalendar, setInviteCalendar] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<"editor" | "viewer">("editor");
  return <div className="p-calendar-list">{calendars.map((calendar) => <article key={calendar.id}><label className="p-check"><input type="checkbox" checked={visible.has(calendar.id)} onChange={() => onToggle(calendar.id)}/><i className={calendar.color}/><strong>{calendar.name}</strong></label><span>{calendar.role === "owner" ? "擁有者" : calendar.role === "editor" ? "可編輯" : "僅檢視"}</span></article>)}<form action={(form) => void onCreate(form)} className="p-form p-inline-form"><input name="name" required maxLength={80} placeholder="新共享日曆名稱"/><select name="color" defaultValue="sage">{colors.map((color, index) => <option value={color} key={color}>{colorNames[index]}</option>)}</select><button className="p-save p-wide-save" type="submit">建立</button></form>{calendars.some((calendar) => calendar.canManage) && <div className="p-form p-invite"><select value={inviteCalendar} onChange={(event) => setInviteCalendar(event.target.value)}><option value="">選擇要邀請的日曆</option>{calendars.filter((calendar) => calendar.canManage).map((calendar) => <option value={calendar.id} key={calendar.id}>{calendar.name}</option>)}</select><input type="email" placeholder="朋友 Email" value={email} onChange={(event) => setEmail(event.target.value)}/><select value={role} onChange={(event) => setRole(event.target.value as "editor" | "viewer")}><option value="editor">編輯者</option><option value="viewer">檢視者</option></select><button className="p-coordinate-link" onClick={() => void onInvite(inviteCalendar, email, role)} disabled={!inviteCalendar || !email}>建立邀請連結</button></div>}</div>;
}

function validLegacyEvent(value: LegacyEvent) {
  return value && typeof value.id === "string" && typeof value.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && /^\d{2}:\d{2}$/.test(value.start) && /^\d{2}:\d{2}$/.test(value.end);
}

function toExternalEvent(event: ExternalEvent): EventItem {
  return { id: `${event.provider}:${event.externalId}`, title: event.title, calendarId: event.provider, color: event.provider === "google" ? "sage" : "blue", allDay: event.allDay, startAt: event.startAt, endAt: event.endAt, startDate: event.startDate, endDateExclusive: event.allDay ? event.endDate || (event.startDate ? format(addDays(new Date(`${event.startDate}T12:00:00`), 1), "yyyy-MM-dd") : null) : null, version: "0", external: true, url: event.url };
}

function ProviderConnection({ provider, integration, syncing, onSync, onDisconnect }: { provider: ProviderId; integration?: Integration; syncing: boolean; onSync: () => void; onDisconnect: (provider: ProviderId) => void }) {
  if (!integration?.configured) return <p className="p-note">此連線已實作，加入伺服器 OAuth 金鑰後即可啟用。</p>;
  if (!integration.connection) return <a className="p-connect" href={`/api/calendar-integrations/${provider}/authorize`}><Link2 size={18}/>連接帳號<ArrowUpRight size={17}/></a>;
  return <div className="p-connection"><span><Check size={17}/><span>{integration.connection.account_email || "已連接"}</span></span><div><button onClick={onSync} disabled={syncing} aria-label="立即同步"><RefreshCw size={18}/></button><button onClick={() => onDisconnect(provider)} aria-label="中斷連線"><Unplug size={18}/></button></div></div>;
}
