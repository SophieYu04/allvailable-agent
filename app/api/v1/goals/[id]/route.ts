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
    const title = text(body.title, 100);
    if (!title) return jsonError(400, "GOAL_TITLE_INVALID", "請輸入 Goal 名稱");
    const reminder = body.reminderTime == null ? null : typeof body.reminderTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.reminderTime) ? `${body.reminderTime}:00` : undefined;
    if (reminder === undefined) return jsonError(400, "REMINDER_TIME_INVALID", "提醒時間無效");
    const { data, error } = await supabase.from("goals").update({ title, color: color(body.color), icon: text(body.icon, 40) ?? "star", reminder_time: reminder, archived_at: body.archived === true ? new Date().toISOString() : null, version: nextDecimalVersion(expected) }).eq("id", id).eq("owner_id", user.id).eq("version", expected).select("id,owner_id,title,color,icon,mode,reminder_time,archived_at,version").single();
    if (error || !data) return jsonError(409, "VERSION_CONFLICT", "Goal 已更新，請重新載入", true);
    return NextResponse.json({ goal: { id: data.id, ownerId: data.owner_id, title: data.title, color: data.color, icon: data.icon, mode: data.mode, reminderTime: data.reminder_time, archivedAt: data.archived_at, version: String(data.version) } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "GOAL_UPDATE_FAILED", auth ? "請先登入" : "無法更新 Goal");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { data: owned } = await supabase.from("goals").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (!owned) {
      const { error: leaveError } = await supabase.rpc("leave_goal", { p_goal_id: id });
      if (leaveError) return jsonError(403, "GOAL_LEAVE_FORBIDDEN", "無法退出 Goal");
      return NextResponse.json({ left: true, id });
    }
    const { error } = await supabase.from("goals").delete().eq("id", id).eq("owner_id", user.id);
    if (error) return jsonError(403, "GOAL_DELETE_FORBIDDEN", "只有建立者能刪除 Goal");
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "GOAL_DELETE_FAILED", auth ? "請先登入" : "無法刪除 Goal");
  }
}
