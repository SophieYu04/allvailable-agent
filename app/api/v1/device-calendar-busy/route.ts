import { NextResponse } from "next/server";

import { requireUser } from "@/lib/server/auth";
import { instant } from "@/lib/server/event-validation";
import { jsonError } from "@/lib/server/http";

type BusyInput = { sourceId?: unknown; calendarId?: unknown; rangeStart?: unknown; rangeEnd?: unknown; intervals?: unknown };

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const url = new URL(request.url);
    const start = instant(url.searchParams.get("start"));
    const end = instant(url.searchParams.get("end"));
    if (!start || !end || end <= start || end.getTime() - start.getTime() > 366 * 86_400_000) return jsonError(400, "BUSY_RANGE_INVALID", "日期範圍無效");
    const { data, error } = await supabase.from("device_calendar_busy").select("source_id,calendar_id,external_event_id,occurrence_key,start_at,end_at,availability,synced_at").eq("user_id", user.id).lt("start_at", end.toISOString()).gt("end_at", start.toISOString());
    if (error) return jsonError(500, "BUSY_READ_FAILED", "無法讀取裝置日曆忙碌資料", true);
    return NextResponse.json({ intervals: (data ?? []).map((item) => ({ sourceId: item.source_id, calendarId: item.calendar_id, externalEventId: item.external_event_id, occurrenceKey: item.occurrence_key, startAt: item.start_at, endAt: item.end_at, availability: item.availability, syncedAt: item.synced_at })) });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(unauthenticated ? 401 : 500, unauthenticated ? "UNAUTHENTICATED" : "BUSY_READ_FAILED", unauthenticated ? "請先登入" : "無法讀取裝置日曆忙碌資料");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as BusyInput;
    const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
    const calendarId = typeof body.calendarId === "string" && body.calendarId.length <= 200 ? body.calendarId : "";
    const rangeStart = instant(body.rangeStart);
    const rangeEnd = instant(body.rangeEnd);
    if (!sourceId || !calendarId || !rangeStart || !rangeEnd || rangeEnd <= rangeStart || rangeEnd.getTime() - rangeStart.getTime() > 366 * 86_400_000) return jsonError(400, "BUSY_INPUT_INVALID", "忙碌資料範圍無效");
    const { data: source } = await supabase.from("calendar_sources").select("id,provider").eq("id", sourceId).eq("user_id", user.id).single();
    if (!source || source.provider !== "apple") return jsonError(403, "BUSY_SOURCE_INVALID", "此來源不能上傳裝置日曆資料");
    if (!Array.isArray(body.intervals) || body.intervals.length > 5000) return jsonError(422, "BUSY_INTERVALS_INVALID", "忙碌資料筆數無效");
    const rows = body.intervals.map((value) => {
      if (!value || typeof value !== "object") throw new Error("BUSY_INTERVAL_INVALID");
      const item = value as Record<string, unknown>;
      const start = instant(item.startAt);
      const end = instant(item.endAt);
      const eventId = typeof item.externalEventId === "string" ? item.externalEventId : "";
      const occurrenceKey = typeof item.occurrenceKey === "string" ? item.occurrenceKey : eventId;
      const availability = item.availability === "tentative" ? "tentative" : item.availability === "busy" ? "busy" : "";
      if (!start || !end || end <= start || !eventId || !occurrenceKey || !availability || end <= rangeStart || start >= rangeEnd) throw new Error("BUSY_INTERVAL_INVALID");
      return { user_id: user.id, source_id: sourceId, calendar_id: calendarId, external_event_id: eventId.slice(0, 300), occurrence_key: occurrenceKey.slice(0, 500), start_at: start.toISOString(), end_at: end.toISOString(), availability, synced_at: new Date().toISOString() };
    });
    const { data: previous, error: previousError } = await supabase.from("device_calendar_busy").select("id,occurrence_key").eq("user_id", user.id).eq("source_id", sourceId).eq("calendar_id", calendarId).lt("start_at", rangeEnd.toISOString()).gt("end_at", rangeStart.toISOString());
    if (previousError) return jsonError(500, "BUSY_SYNC_FAILED", "無法更新裝置日曆資料", true);
    if (rows.length) {
      const { error } = await supabase.from("device_calendar_busy").upsert(rows, { onConflict: "user_id,source_id,calendar_id,occurrence_key" });
      if (error) return jsonError(500, "BUSY_SYNC_FAILED", "無法更新裝置日曆資料", true);
    }
    const incomingKeys = new Set(rows.map((row) => row.occurrence_key));
    const staleIds = (previous ?? []).filter((row) => !incomingKeys.has(row.occurrence_key)).map((row) => row.id);
    if (staleIds.length) {
      const { error: deleteError } = await supabase.from("device_calendar_busy").delete().eq("user_id", user.id).in("id", staleIds);
      if (deleteError) return jsonError(500, "BUSY_SYNC_PARTIAL", "資料已更新，但清理舊資料失敗", true);
    }
    return NextResponse.json({ synced: rows.length, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BUSY_INPUT_INVALID";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : 422, code, code === "UNAUTHENTICATED" ? "請先登入" : "忙碌資料格式無效");
  }
}
