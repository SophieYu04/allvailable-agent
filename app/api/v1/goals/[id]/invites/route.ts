import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { email } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const invitedEmail = email(body.email);
    if (!invitedEmail || invitedEmail === user.email?.toLowerCase()) return jsonError(400, "INVITE_EMAIL_INVALID", "請輸入其他使用者的有效 Email");
    const { data: goal } = await supabase.from("goals").select("mode").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (!goal) return jsonError(403, "GOAL_INVITE_FORBIDDEN", "只有建立者能邀請朋友");
    const role = goal.mode === "shared" ? "participant" : "viewer";
    const { data, error } = await supabase.from("goal_invites").insert({ goal_id: id, invited_by: user.id, invited_email: invitedEmail, role }).select("token,expires_at,role").single();
    if (error || !data) return jsonError(409, "GOAL_INVITE_FAILED", "無法建立邀請", true);
    return NextResponse.json({ invite: { token: data.token, expiresAt: data.expires_at, role: data.role } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "GOAL_INVITE_FAILED", auth ? "請先登入" : "無法建立邀請");
  }
}
