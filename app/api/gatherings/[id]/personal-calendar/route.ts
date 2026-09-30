import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/server/auth";
import { decimalVersion, jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { data: gathering, error: gatheringError } = await supabase.from("gatherings").select("date_start,date_end,daily_start,daily_end").eq("id", id).single();
    if (gatheringError || !gathering) return jsonError(404, "GATHERING_NOT_FOUND", "找不到飯局");
    const [{ data: draft }, shared] = await Promise.all([
      supabase.from("availability_drafts").select("cells,version").eq("gathering_id", id).eq("user_id", user.id).maybeSingle(),
      loadSharedBusy(supabase, user.id, gathering.date_start, gathering.date_end, gathering.daily_start, gathering.daily_end),
    ]);
    const current = (draft?.cells ?? {}) as Record<string, "unknown" | "green" | "yellow" | "red">;
    const changes = Object.keys(shared).filter((key) => current[key] !== shared[key]).map((key) => ({ key, before: current[key] ?? "unknown", after: shared[key] }));
    return NextResponse.json({ cells: cellRows(shared), changes, draftVersion: String(draft?.version ?? 1) });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { expectedDraftVersion?: string; selectedKeys?: string[]; expectedStatuses?: Record<string,string> };
    if (!body.expectedDraftVersion) return jsonError(400, "DRAFT_VERSION_REQUIRED", "需要草稿版本");
    const expectedVersion = decimalVersion(body.expectedDraftVersion);
    const { data: gathering } = await supabase.from("gatherings").select("date_start,date_end,daily_start,daily_end").eq("id", id).single();
    if (!gathering) return jsonError(404, "GATHERING_NOT_FOUND", "找不到飯局");
    const shared = await loadSharedBusy(supabase, user.id, gathering.date_start, gathering.date_end, gathering.daily_start, gathering.daily_end);
    const { data: draft } = await supabase.from("availability_drafts").select("cells,version").eq("gathering_id", id).eq("user_id", user.id).eq("version", expectedVersion).single();
    if (!draft) return jsonError(409, "VERSION_CONFLICT", "草稿已被更新，請重新載入", true);
    const cells = { ...((draft.cells ?? {}) as Record<string, string>) };
    const selectedKeys = body.selectedKeys ?? Object.keys(shared);
    if (!selectedKeys.length) return jsonError(400, "SELECTION_REQUIRED", "請至少選擇一個忙碌時段");
    if (selectedKeys.some((key) => !(key in shared))) return jsonError(400, "BUSY_SELECTION_INVALID", "選取的忙碌格子已不存在");
    if (body.expectedStatuses && selectedKeys.some(key => body.expectedStatuses?.[key] !== shared[key])) return jsonError(409, "CALENDAR_CHANGED", "日曆已變更，請重新取得差異預覽", true);
    selectedKeys.forEach((key) => { cells[key] = shared[key]; });
    const { data: updated, error } = await supabase.rpc("save_availability_draft", { p_gathering_id: id, p_version: expectedVersion, p_cells: cells });
    if (error || !updated) return jsonError(409, "VERSION_CONFLICT", "草稿已被更新，請重新載入", true);
    return NextResponse.json({ cells: updated.cells, version: String(updated.version) });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

type BusyMap = Record<string, "yellow" | "red">;

async function loadSharedBusy(supabase: SupabaseClient, userId: string, startDate: string, endDate: string, dailyStart: string, dailyEnd: string): Promise<BusyMap> {
  const [{ data: cells, error: cellsError }, { data: appEvents, error: appError }, { data: externalEvents, error: externalError }] = await Promise.all([
    supabase.from("personal_busy_cells").select("local_date,minute_of_day,status").eq("user_id", userId).gte("local_date", startDate).lte("local_date", endDate),
    supabase.from("calendar_events").select("start_at,end_at,all_day,start_date,end_date_exclusive").eq("user_id", userId).is("deleted_at", null),
    supabase.from("external_calendar_events").select("start_at,end_at,all_day,start_date,end_date_exclusive,availability").eq("user_id", userId),
  ]);
  if (cellsError || appError || externalError) throw new Error("PERSONAL_CALENDAR_READ_FAILED");
  const shared: BusyMap = {};
  for (const cell of cells ?? []) {
    const key = `${cell.local_date}-${String(Math.floor(Number(cell.minute_of_day) / 60)).padStart(2, "0")}:${String(Number(cell.minute_of_day) % 60).padStart(2, "0")}`;
    mergeStatus(shared, key, cell.status === "yellow" ? "yellow" : "red");
  }
  for (const event of appEvents ?? []) addEventCells(shared, event, "red", startDate, endDate);
  for (const event of externalEvents ?? []) {
    if (event.availability !== "free") addEventCells(shared, event, event.availability === "tentative" ? "yellow" : "red", startDate, endDate);
  }
  const startMinute = clockMinutes(dailyStart);
  const endMinute = clockMinutes(dailyEnd);
  for (const key of Object.keys(shared)) {
    const minute = Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16));
    if (minute < startMinute || minute >= endMinute) delete shared[key];
  }
  return shared;
}

function clockMinutes(value: string) {
  const [hour, minute] = String(value).slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function addEventCells(shared: BusyMap, event: { start_at?: string | null; end_at?: string | null; all_day?: boolean; start_date?: string | null; end_date_exclusive?: string | null }, status: "yellow" | "red", startDate: string, endDate: string) {
  if (event.all_day && event.start_date && event.end_date_exclusive) {
    const cursor = new Date(`${event.start_date}T00:00:00+08:00`);
    const end = new Date(`${event.end_date_exclusive}T00:00:00+08:00`);
    const rangeStart = new Date(`${startDate}T00:00:00+08:00`);
    const rangeEnd = new Date(new Date(`${endDate}T00:00:00+08:00`).getTime() + 86_400_000);
    if (cursor < rangeStart) cursor.setTime(rangeStart.getTime());
    if (end > rangeEnd) end.setTime(rangeEnd.getTime());
    while (cursor < end) {
      addTimedCells(shared, cursor, new Date(cursor.getTime() + 86_400_000), status, startDate, endDate);
      cursor.setTime(cursor.getTime() + 86_400_000);
    }
    return;
  }
  if (event.start_at && event.end_at) addTimedCells(shared, new Date(event.start_at), new Date(event.end_at), status, startDate, endDate);
}

function addTimedCells(shared: BusyMap, start: Date, end: Date, status: "yellow" | "red", startDate: string, endDate: string) {
  const rangeStart = new Date(`${startDate}T00:00:00+08:00`);
  const rangeEnd = new Date(`${endDate}T23:59:59+08:00`);
  if (start < rangeStart) start = rangeStart;
  if (end > rangeEnd) end = rangeEnd;
  let cursor = new Date(Math.floor(start.getTime() / 1_800_000) * 1_800_000);
  while (cursor < end) {
    const key = taipeiCellKey(cursor);
    const date = key.slice(0, 10);
    if (date >= startDate && date <= endDate) mergeStatus(shared, key, status);
    cursor = new Date(cursor.getTime() + 1_800_000);
  }
}

function taipeiCellKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}-${part("hour")}:${part("minute")}`;
}

function mergeStatus(shared: BusyMap, key: string, status: "yellow" | "red") {
  if (status === "red" || !shared[key]) shared[key] = status;
}

function cellRows(shared: BusyMap) {
  return Object.entries(shared).map(([key, status]) => ({ local_date: key.slice(0, 10), minute_of_day: Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16)), status }));
}
