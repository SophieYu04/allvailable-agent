import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const url = new URL(request.url);
    const start = new Date(url.searchParams.get("start") || "invalid");
    const end = new Date(url.searchParams.get("end") || "invalid");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || end.getTime() - start.getTime() > 366 * 86_400_000) return jsonError(400, "CALENDAR_RANGE_INVALID", "日期範圍無效");
    const { data, error } = await supabase.from("external_calendar_events").select("provider,external_id,title,start_at,end_at,all_day,start_date,end_date_exclusive,source_timezone,availability,html_url").eq("user_id", user.id);
    if (error) return jsonError(500, "CALENDAR_EVENTS_READ_FAILED", "無法讀取外部行程", true);
    const events = (data ?? []).filter((event) => event.all_day
      ? String(event.start_date) < end.toISOString().slice(0, 10) && String(event.end_date_exclusive) > start.toISOString().slice(0, 10)
      : new Date(event.start_at).getTime() < end.getTime() && new Date(event.end_at).getTime() > start.getTime());
    return NextResponse.json({ events: events.map((event) => ({ provider: event.provider, externalId: event.external_id, title: event.title || (event.availability === "tentative" ? "待確認" : "忙碌"), startAt: event.start_at, endAt: event.end_at, allDay: event.all_day, startDate: event.start_date, endDateExclusive: event.end_date_exclusive, timeZone: event.source_timezone, availability: event.availability, url: event.html_url })) });
  } catch {
    return jsonError(401, "UNAUTHENTICATED", "請先登入");
  }
}
