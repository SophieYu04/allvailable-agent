import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase.from("notifications").select("id,kind,payload,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (error) return jsonError(500, "NOTIFICATIONS_READ_FAILED", "無法讀取通知", true);
    return NextResponse.json({ notifications: data ?? [] });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { id?: unknown; read?: unknown };
    if (typeof body.id !== "string" || typeof body.read !== "boolean") return jsonError(400, "NOTIFICATION_INPUT_INVALID", "通知設定無效");
    const { error } = await supabase.from("notifications").update({ read_at: body.read ? new Date().toISOString() : null }).eq("id", body.id).eq("user_id", user.id);
    if (error) return jsonError(500, "NOTIFICATION_UPDATE_FAILED", "無法更新通知", true);
    return NextResponse.json({ updated: true });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
