import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { email } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const invitedEmail = email((await request.json() as { email?: unknown }).email);
    if (!invitedEmail || invitedEmail === user.email?.toLowerCase()) return jsonError(400, "INVITE_EMAIL_INVALID", "請輸入其他使用者的有效 Email");
    const { data, error } = await supabase.from("focus_group_invites").insert({ group_id: id, invited_by: user.id, invited_email: invitedEmail }).select("token,expires_at").single();
    if (error || !data) return jsonError(403, "GROUP_INVITE_FORBIDDEN", "只有建立者能邀請成員");
    return NextResponse.json({ invite: { token: data.token, expiresAt: data.expires_at } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "GROUP_INVITE_FAILED", auth ? "請先登入" : "無法建立邀請");
  }
}
