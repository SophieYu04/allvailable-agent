import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  const { token } = await context.params;
  try {
    const admin = getSupabaseAdminClient();
    if (!admin) return jsonError(503, "INVITE_PREVIEW_UNAVAILABLE", "邀請預覽尚未設定", true);
    const { data, error } = await admin.from("gatherings").select("id,host_id,name,date_start,date_end,daily_start,daily_end,duration_minutes,deadline_at,status,invite_token").eq("invite_token", token).maybeSingle();
    if (error || !data || data.status === "draft") return jsonError(404, "INVITE_NOT_FOUND", "找不到這個邀請");
    const { data: host } = await admin.from("profiles").select("display_name").eq("id", data.host_id).maybeSingle();
    return NextResponse.json({ gathering: { ...data, host_name: host?.display_name ?? "Host" } });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase.rpc("join_gathering", { p_invite_token: token });
    if (error) { const code = error.message.includes("GATHERING_FULL") ? "GATHERING_FULL" : error.message.includes("GATHERING_LOCKED") ? "GATHERING_LOCKED" : "INVITE_NOT_FOUND"; return jsonError(code === "GATHERING_FULL" || code === "GATHERING_LOCKED" ? 409 : 404, code, "無法加入這場飯局"); }
    return NextResponse.json({ gathering: data, userId: user.id });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
