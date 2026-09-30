import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { color, text } from "@/lib/server/productivity";
import { decimalVersion, jsonError, nextDecimalVersion } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const expected = decimalVersion(body.expectedVersion);
    const name = text(body.name, 80);
    if (!name) return jsonError(400, "CALENDAR_NAME_INVALID", "請輸入日曆名稱");
    const { data, error } = await supabase.from("shared_calendars").update({ name, color: color(body.color), version: nextDecimalVersion(expected) }).eq("id", id).eq("owner_id", user.id).eq("version", expected).is("deleted_at", null).select("id,owner_id,name,color,kind,version").single();
    if (error || !data) return jsonError(409, "VERSION_CONFLICT", "日曆已更新，請重新載入", true);
    return NextResponse.json({ calendar: { id: data.id, ownerId: data.owner_id, name: data.name, color: data.color, kind: data.kind, version: String(data.version) } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "CALENDAR_UPDATE_FAILED", auth ? "請先登入" : "無法更新日曆");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { data: calendar } = await supabase.from("shared_calendars").select("kind").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (!calendar) {
      const { error: leaveError } = await supabase.rpc("leave_calendar", { p_calendar_id: id });
      if (leaveError) return jsonError(404, "CALENDAR_NOT_FOUND", "找不到日曆或無法退出");
      return NextResponse.json({ left: true, id });
    }
    if (calendar.kind === "personal") return jsonError(409, "PERSONAL_CALENDAR_REQUIRED", "主要個人日曆不能刪除");
    const { error } = await supabase.from("shared_calendars").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("owner_id", user.id);
    if (error) return jsonError(409, "CALENDAR_DELETE_FAILED", "無法刪除日曆", true);
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "CALENDAR_DELETE_FAILED", auth ? "請先登入" : "無法刪除日曆");
  }
}
