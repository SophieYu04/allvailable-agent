import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { eventResponse, validateEventInput, type EventInput } from "@/lib/server/event-validation";
import { jsonError, decimalVersion, nextDecimalVersion } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const input = await request.json() as EventInput;
    const expected = decimalVersion(input.expectedVersion);
    const { data: existing } = await supabase.from("calendar_events").select("source_id,calendar_id").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!existing) return jsonError(404, "NOT_FOUND", "資料已不存在");
    const validated = await validateEventInput(input, supabase, user.id, { sourceId: existing.source_id, calendarId: existing.calendar_id });
    const { idempotency_key: _createKey, calendar_id: _calendarId, ...event } = validated;
    void _createKey;
    void _calendarId;
    const { data, error } = await supabase.from("calendar_events").update({ ...event, version: nextDecimalVersion(expected), updated_at: new Date().toISOString() }).eq("id", id).eq("version", expected).is("deleted_at", null).select("id,user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,start_date,end_date_exclusive,time_zone,version,updated_at,idempotency_key").single();
    if (error || !data) return jsonError(409, "VERSION_CONFLICT", "事件已被更新，請重新載入", true);
    return NextResponse.json({ event: eventResponse(data) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EVENT_INVALID";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : code === "VERSION_INVALID" ? 409 : 422, code, code === "UNAUTHENTICATED" ? "請先登入" : "事件資料無效");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase } = await requireUser(request);
    const expected = decimalVersion(new URL(request.url).searchParams.get("version"));
    const { data: existing } = await supabase.from("calendar_events")
      .select("id,version,deleted_at").eq("id", id).maybeSingle();
    if (existing?.deleted_at) return NextResponse.json({ deleted: true, id, version: String(existing.version) });
    const { data, error } = await supabase.from("calendar_events").update({ deleted_at: new Date().toISOString(), version: nextDecimalVersion(expected), updated_at: new Date().toISOString() }).eq("id", id).eq("version", expected).is("deleted_at", null).select("id,version").single();
    if (error || !data) return jsonError(409, "VERSION_CONFLICT", "事件已被更新，請重新載入", true);
    return NextResponse.json({ deleted: true, id, version: String(data.version) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EVENT_DELETE_FAILED";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : 409, code, code === "UNAUTHENTICATED" ? "請先登入" : "事件已被更新，請重新載入", true);
  }
}

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    let query = supabase.from("calendar_events")
      .select("id,user_id,source_id,calendar_id,title,color,all_day,start_at,end_at,start_date,end_date_exclusive,time_zone,version,updated_at,idempotency_key");
    query = id.startsWith("mobile-") ? query.eq("user_id", user.id).eq("idempotency_key", id) : query.eq("id", id);
    const { data, error } = await query
      .is("deleted_at", null).maybeSingle();
    if (error) return jsonError(500, "READ_FAILED", "無法重新載入", true);
    if (!data) return jsonError(404, "NOT_FOUND", "資料已不存在");
    return NextResponse.json({ event: eventResponse(data) });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(unauthenticated ? 401 : 500, unauthenticated ? "UNAUTHENTICATED" : "READ_FAILED", unauthenticated ? "請先登入" : "無法重新載入");
  }
}
