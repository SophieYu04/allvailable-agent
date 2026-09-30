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
    const role = body.role === "viewer" ? "viewer" : "editor";
    if (!invitedEmail) return jsonError(400, "INVITE_EMAIL_INVALID", "請輸入有效 Email");
    if (invitedEmail === user.email?.toLowerCase()) return jsonError(400, "INVITE_SELF", "不能邀請自己");
    const { data, error } = await supabase.from("calendar_invites").insert({ calendar_id: id, invited_by: user.id, invited_email: invitedEmail, role }).select("token,expires_at").single();
    if (error || !data) return jsonError(403, "CALENDAR_INVITE_FORBIDDEN", "只有擁有者能邀請成員");
    return NextResponse.json({ invite: { token: data.token, expiresAt: data.expires_at, role } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "CALENDAR_INVITE_FAILED", auth ? "請先登入" : "無法建立邀請");
  }
}
