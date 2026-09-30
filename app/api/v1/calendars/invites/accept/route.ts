import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const token = text((await request.json() as { token?: unknown }).token, 100);
    if (!token) return jsonError(400, "INVITE_TOKEN_REQUIRED", "缺少邀請碼");
    const { data, error } = await supabase.rpc("accept_calendar_invite", { p_token: token });
    if (error || !data) return jsonError(409, "INVITE_INVALID", "邀請已失效或不屬於此帳號");
    return NextResponse.json({ calendarId: data });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "INVITE_ACCEPT_FAILED", auth ? "請先登入" : "無法接受邀請");
  }
}
