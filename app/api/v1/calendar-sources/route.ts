import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

const sourceFields = "id,provider,external_account_id,calendar_id,display_name,include_in_display,include_in_coordination,can_write,sync_status,last_synced_at,last_error";

async function ensureLocalSource(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { data: existing } = await supabase.from("calendar_sources").select("id").eq("user_id", userId).eq("provider", "manual").eq("external_account_id", "local").eq("calendar_id", "primary").maybeSingle();
  if (existing) return;
  await supabase.from("calendar_sources").insert({
    user_id: userId,
    provider: "manual",
    external_account_id: "local",
    calendar_id: "primary",
    display_name: "我的行事曆",
    include_in_display: true,
    include_in_coordination: true,
    can_write: true,
    sync_status: "ready",
  });
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    await ensureLocalSource(supabase, user.id);
    const { data, error } = await supabase.from("calendar_sources").select(sourceFields).eq("user_id", user.id).order("provider").order("display_name");
    if (error) return jsonError(500, "CALENDAR_SOURCES_READ_FAILED", "無法讀取日曆來源", true);
    return NextResponse.json({ sources: (data ?? []).map((source) => ({
      id: source.id,
      provider: source.provider,
      externalAccountId: source.external_account_id,
      calendarId: source.calendar_id,
      displayName: source.display_name,
      includeInDisplay: source.include_in_display,
      includeInCoordination: source.include_in_coordination,
      canWrite: source.can_write,
      syncStatus: source.sync_status,
      lastSyncedAt: source.last_synced_at,
      lastError: source.last_error,
    })) });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(unauthenticated ? 401 : 500, unauthenticated ? "UNAUTHENTICATED" : "CALENDAR_SOURCES_READ_FAILED", unauthenticated ? "請先登入" : "無法讀取日曆來源");
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { id?: unknown; includeInDisplay?: unknown; includeInCoordination?: unknown };
    if (typeof body.id !== "string") return jsonError(400, "SOURCE_ID_REQUIRED", "缺少日曆來源");
    const changes: Record<string, boolean> = {};
    if (typeof body.includeInDisplay === "boolean") changes.include_in_display = body.includeInDisplay;
    if (typeof body.includeInCoordination === "boolean") changes.include_in_coordination = body.includeInCoordination;
    if (!Object.keys(changes).length) return jsonError(400, "SOURCE_UPDATE_EMPTY", "沒有可更新的設定");
    const { data, error } = await supabase.from("calendar_sources").update(changes).eq("id", body.id).eq("user_id", user.id).select(sourceFields).single();
    if (error || !data) return jsonError(404, "SOURCE_NOT_FOUND", "找不到日曆來源");
    return NextResponse.json({ source: {
      id: data.id,
      provider: data.provider,
      externalAccountId: data.external_account_id,
      calendarId: data.calendar_id,
      displayName: data.display_name,
      includeInDisplay: data.include_in_display,
      includeInCoordination: data.include_in_coordination,
      canWrite: data.can_write,
      syncStatus: data.sync_status,
      lastSyncedAt: data.last_synced_at,
      lastError: data.last_error,
    } });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(unauthenticated ? 401 : 422, unauthenticated ? "UNAUTHENTICATED" : "SOURCE_UPDATE_FAILED", unauthenticated ? "請先登入" : "日曆來源設定無效");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { provider?: unknown; externalAccountId?: unknown; calendarId?: unknown; displayName?: unknown; canWrite?: unknown };
    const provider = body.provider === "apple" || body.provider === "ics" || body.provider === "manual" ? body.provider : null;
    const externalAccountId = typeof body.externalAccountId === "string" && body.externalAccountId.length <= 200 ? body.externalAccountId : "local";
    const calendarId = typeof body.calendarId === "string" && body.calendarId.length <= 200 ? body.calendarId : "primary";
    if (!provider) return jsonError(400, "SOURCE_PROVIDER_INVALID", "不支援的日曆來源");
    const { data, error } = await supabase.from("calendar_sources").upsert({ user_id: user.id, provider, external_account_id: externalAccountId, calendar_id: calendarId, display_name: typeof body.displayName === "string" ? body.displayName.slice(0, 200) : provider === "apple" ? "Apple 裝置日曆" : "匯入日曆", can_write: body.canWrite === true, sync_status: "idle" }, { onConflict: "user_id,provider,external_account_id,calendar_id" }).select(sourceFields).single();
    if (error || !data) return jsonError(500, "SOURCE_CREATE_FAILED", "無法建立日曆來源", true);
    return NextResponse.json({ source: { id: data.id, provider: data.provider, externalAccountId: data.external_account_id, calendarId: data.calendar_id, displayName: data.display_name, includeInDisplay: data.include_in_display, includeInCoordination: data.include_in_coordination, canWrite: data.can_write, syncStatus: data.sync_status, lastSyncedAt: data.last_synced_at, lastError: data.last_error } }, { status: 201 });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(unauthenticated ? 401 : 422, unauthenticated ? "UNAUTHENTICATED" : "SOURCE_CREATE_FAILED", unauthenticated ? "請先登入" : "日曆來源資料無效");
  }
}
