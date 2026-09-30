import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id, userId } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    if (userId === user.id) return jsonError(409, "OWNER_ROLE_IMMUTABLE", "不能修改擁有者權限");
    const body = await request.json() as { role?: unknown };
    const role = body.role === "viewer" ? "viewer" : body.role === "editor" ? "editor" : null;
    if (!role) return jsonError(400, "MEMBER_ROLE_INVALID", "成員權限無效");
    const { data, error } = await supabase.from("calendar_members").update({ role }).eq("calendar_id", id).eq("user_id", userId).neq("role", "owner").select("user_id,role").single();
    if (error || !data) return jsonError(403, "MEMBER_MANAGE_FORBIDDEN", "只有擁有者能管理成員");
    return NextResponse.json({ member: { userId: data.user_id, role: data.role } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "MEMBER_UPDATE_FAILED", auth ? "請先登入" : "無法更新成員");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id, userId } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    if (userId === user.id) return jsonError(409, "OWNER_CANNOT_REMOVE_SELF", "擁有者不能移除自己");
    const { data: calendar } = await supabase.from("shared_calendars").select("owner_id").eq("id", id).maybeSingle();
    if (calendar?.owner_id !== user.id) return jsonError(403, "MEMBER_MANAGE_FORBIDDEN", "只有擁有者能移除成員");
    const { error } = await supabase.from("calendar_members").delete().eq("calendar_id", id).eq("user_id", userId).neq("role", "owner");
    if (error) return jsonError(403, "MEMBER_MANAGE_FORBIDDEN", "只有擁有者能移除成員");
    return NextResponse.json({ removed: true, userId });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "MEMBER_REMOVE_FAILED", auth ? "請先登入" : "無法移除成員");
  }
}
