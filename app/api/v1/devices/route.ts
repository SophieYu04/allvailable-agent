import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { platform?: unknown; pushToken?: unknown; appVersion?: unknown; timeZone?: unknown };
    if ((body.platform !== "ios" && body.platform !== "android") || typeof body.pushToken !== "string" || body.pushToken.length < 10 || body.pushToken.length > 4096) return jsonError(400, "DEVICE_INPUT_INVALID", "裝置資料無效");
    const { data, error } = await supabase.from("mobile_devices").upsert({ user_id: user.id, platform: body.platform, push_token: body.pushToken, app_version: typeof body.appVersion === "string" ? body.appVersion.slice(0, 40) : null, time_zone: typeof body.timeZone === "string" ? body.timeZone.slice(0, 100) : null, last_seen_at: new Date().toISOString() }, { onConflict: "user_id,push_token" }).select("id,platform,last_seen_at").single();
    if (error || !data) return jsonError(500, "DEVICE_REGISTER_FAILED", "無法註冊推播裝置", true);
    return NextResponse.json({ device: data });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(unauthenticated ? 401 : 422, unauthenticated ? "UNAUTHENTICATED" : "DEVICE_REGISTER_FAILED", unauthenticated ? "請先登入" : "裝置資料無效");
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json().catch(() => ({})) as { pushToken?: unknown };
    if (typeof body.pushToken !== "string") return jsonError(400, "DEVICE_TOKEN_REQUIRED", "缺少推播裝置");
    await supabase.from("mobile_devices").delete().eq("user_id", user.id).eq("push_token", body.pushToken);
    return NextResponse.json({ deleted: true });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
