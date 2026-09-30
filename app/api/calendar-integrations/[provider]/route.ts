import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ provider: string }> };

export async function DELETE(request: Request, context: Context) {
  const { provider } = await context.params;
  if (provider !== "google" && provider !== "microsoft") return jsonError(404, "CALENDAR_PROVIDER_NOT_FOUND", "不支援的行事曆");
  try {
    const { user } = await requireUser(request);
    const admin = getSupabaseAdminClient();
    if (!admin) return jsonError(503, "CALENDAR_STORAGE_NOT_CONFIGURED", "行事曆儲存尚未設定");
    const { error } = await admin.rpc("disconnect_calendar", { p_user_id: user.id, p_provider: provider });
    if (error) return jsonError(500, "CALENDAR_DISCONNECT_FAILED", "無法中斷行事曆連線", true);
    return NextResponse.json({ disconnected: true });
  } catch {
    return jsonError(401, "UNAUTHENTICATED", "請先登入");
  }
}
