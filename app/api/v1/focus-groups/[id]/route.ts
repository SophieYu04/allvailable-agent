import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const name = text((await request.json() as { name?: unknown }).name, 80);
    if (!name) return jsonError(400, "GROUP_NAME_INVALID", "請輸入群組名稱");
    const { data, error } = await supabase.from("focus_groups").update({ name }).eq("id", id).eq("owner_id", user.id).select("id,owner_id,name").single();
    if (error || !data) return jsonError(403, "GROUP_UPDATE_FORBIDDEN", "只有建立者能修改群組");
    return NextResponse.json({ group: { id: data.id, ownerId: data.owner_id, name: data.name } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "GROUP_UPDATE_FAILED", auth ? "請先登入" : "無法更新群組");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const memberId = new URL(request.url).searchParams.get("memberId");
    if (memberId && memberId !== user.id) {
      const { data: group } = await supabase.from("focus_groups").select("owner_id").eq("id", id).maybeSingle();
      if (group?.owner_id !== user.id) return jsonError(403, "GROUP_OWNER_REQUIRED", "只有建立者能移除成員");
      await supabase.from("focus_group_members").update({ left_at: new Date().toISOString() }).eq("group_id", id).eq("user_id", memberId).neq("role", "owner");
      return NextResponse.json({ removed: true, userId: memberId });
    }
    const { data: membership } = await supabase.from("focus_group_members").select("role").eq("group_id", id).eq("user_id", user.id).maybeSingle();
    if (membership?.role === "owner") return jsonError(409, "OWNER_CANNOT_LEAVE", "請先刪除群組或移轉擁有權");
    const { error: leaveError } = await supabase.rpc("leave_focus_group", { p_group_id: id });
    if (leaveError) return jsonError(409, "GROUP_LEAVE_FAILED", "無法退出群組");
    return NextResponse.json({ left: true });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "GROUP_LEAVE_FAILED", auth ? "請先登入" : "無法退出群組");
  }
}
