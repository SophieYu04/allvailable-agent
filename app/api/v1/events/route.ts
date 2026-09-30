import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { eventResponse, instant, validateEventInput, type EventInput } from "@/lib/server/event-validation";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const url = new URL(request.url);
    const start = instant(url.searchParams.get("start"));
    const end = instant(url.searchParams.get("end"));
    if (!start || !end || end <= start || end.getTime() - start.getTime() > 366 * 86_400_000) return jsonError(400, "EVENT_RANGE_INVALID", "日期範圍無效");
    const { data, error } = await supabase.from("calendar_events").select("id,user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,start_date,end_date_exclusive,time_zone,version,updated_at,idempotency_key,deleted_at").is("deleted_at", null).order("start_at", { ascending: true });
    if (error) return jsonError(500, "EVENTS_READ_FAILED", "無法讀取事件", true);
    const events = (data ?? []).filter((row) => row.all_day ? String(row.start_date) < end.toISOString().slice(0, 10) && String(row.end_date_exclusive) > start.toISOString().slice(0, 10) : new Date(row.start_at).getTime() < end.getTime() && new Date(row.end_at).getTime() > start.getTime());
    return NextResponse.json({ events: events.map(eventResponse) });
  } catch (error) {
    return jsonError(error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 500, error instanceof Error && error.message === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "EVENTS_READ_FAILED", error instanceof Error && error.message === "UNAUTHENTICATED" ? "請先登入" : "無法讀取事件");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const input = await request.json() as EventInput;
    const event = await validateEventInput(input, supabase, user.id);
    if (event.idempotency_key) {
      const { data: replay } = await supabase.from("calendar_events").select("id,user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,start_date,end_date_exclusive,time_zone,version,updated_at,idempotency_key,deleted_at").eq("user_id", user.id).eq("idempotency_key", event.idempotency_key).maybeSingle();
      if (replay) return NextResponse.json({ event: eventResponse(replay), replayed: true, deleted: replay.deleted_at != null });
    }
    const { data, error } = await supabase.from("calendar_events").insert({ user_id: user.id, ...event }).select("id,user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,start_date,end_date_exclusive,time_zone,version,updated_at,idempotency_key,deleted_at").single();
    if (error || !data) return jsonError(409, "EVENT_CREATE_FAILED", "事件無法建立，請重試", true);
    return NextResponse.json({ event: eventResponse(data) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EVENT_INVALID";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : 422, code, code === "UNAUTHENTICATED" ? "請先登入" : "事件資料無效");
  }
}
