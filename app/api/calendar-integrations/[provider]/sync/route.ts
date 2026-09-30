import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchProviderEvents, usableAccessToken, type OAuthProvider, type StoredCredential } from "@/lib/server/calendar-providers";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ provider: string }> };

export async function POST(request: Request, context: Context) {
  const { provider: rawProvider } = await context.params;
  if (rawProvider !== "google" && rawProvider !== "microsoft") return jsonError(404, "CALENDAR_PROVIDER_NOT_FOUND", "不支援的行事曆");
  const provider: OAuthProvider = rawProvider;
  let authenticatedUserId: string | null = null;
  let generation: string | null = null;
  let revision: string | null = null;
  try {
    const { user } = await requireUser(request);
    authenticatedUserId = user.id;
  } catch {
    return jsonError(401, "UNAUTHENTICATED", "請先登入");
  }
  try {
    const user = { id: authenticatedUserId };
    const admin = getSupabaseAdminClient();
    if (!admin) return jsonError(503, "CALENDAR_STORAGE_NOT_CONFIGURED", "行事曆儲存尚未設定");
    const body = await request.json() as { start?: string; end?: string; timeZone?: string; calendarId?: string };
    const start = parseInstant(body.start);
    const end = parseInstant(body.end);
    const timeZone = validTimeZone(body.timeZone) ? body.timeZone! : "UTC";
    if (!start || !end || end <= start || end.getTime() - start.getTime() > 366 * 86_400_000) {
      return jsonError(400, "CALENDAR_RANGE_INVALID", "同步日期範圍無效");
    }
    const { data: sync, error: syncError } = await admin.rpc("begin_calendar_sync", { p_user_id: user.id, p_provider: provider });
    if (syncError || !sync) throw new Error("CALENDAR_RECONNECT_REQUIRED");
    generation = sync.generation; revision = sync.revision;
    const { data: credential, error: credentialError } = await admin.from("calendar_credentials").select("access_token_ciphertext,refresh_token_ciphertext,expires_at,token_type").eq("user_id", user.id).eq("provider", provider).single();
    if (credentialError || !credential) return jsonError(409, "CALENDAR_RECONNECT_REQUIRED", "請重新連接行事曆");
    const { accessToken, refreshed } = await usableAccessToken(provider, credential as StoredCredential);

    const calendarId = typeof body.calendarId === "string" && body.calendarId.length <= 300 ? body.calendarId : "primary";
    const events = await fetchProviderEvents(provider, accessToken, { start: start.toISOString(), end: end.toISOString(), timeZone, calendarId });
    const { error: commitError } = await admin.rpc("commit_calendar_sync", {
      p_user_id: user.id, p_provider: provider, p_generation: generation, p_revision: revision,
      p_calendar_id: calendarId, p_start: start.toISOString(), p_end: end.toISOString(),
      p_timezone: timeZone, p_events: events, p_credential: refreshed ?? null,
    });
    if (commitError) throw new Error(commitError.message.includes("CALENDAR_SYNC_SUPERSEDED") ? "CALENDAR_SYNC_SUPERSEDED" : "CALENDAR_SYNC_FAILED");
    return NextResponse.json({ provider, synced: events.length, events: events.map(calendarEventResponse) });
  } catch (error) {
    if (error instanceof Error && error.message === "CALENDAR_SYNC_SUPERSEDED") return jsonError(409, "CALENDAR_SYNC_SUPERSEDED", "連線或同步範圍已更新，請重新整理", true);
    const reconnect = error instanceof Error && error.message === "CALENDAR_RECONNECT_REQUIRED";
    const incomplete = error instanceof Error && error.message === "CALENDAR_SYNC_INCOMPLETE";
    if (authenticatedUserId) {
      const admin = getSupabaseAdminClient();
      if (admin && generation && revision) await admin.from("calendar_connections").update({ last_error: incomplete ? "同步資料尚未完整" : reconnect ? "需要重新連接" : "同步失敗" }).eq("user_id", authenticatedUserId).eq("provider", provider).eq("connected_at", generation!).eq("sync_revision", revision!);
    }
    return jsonError(reconnect ? 409 : 502, reconnect ? "CALENDAR_RECONNECT_REQUIRED" : incomplete ? "CALENDAR_SYNC_INCOMPLETE" : "CALENDAR_SYNC_FAILED", reconnect ? "請重新連接行事曆" : incomplete ? "同步資料尚未完整，已保留上次結果" : "同步行事曆失敗", !reconnect);
  }
}

function parseInstant(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}
function calendarEventResponse(event: { provider: string; external_id: string; title?: string; start_at: string | null; end_at: string | null; all_day: boolean; start_date: string | null; end_date_exclusive: string | null; source_timezone: string | null; availability: string; html_url: string | null }) {
  return { provider: event.provider, externalId: event.external_id, title: event.title || (event.availability === "tentative" ? "待確認" : "忙碌"), startAt: event.start_at, endAt: event.end_at, allDay: event.all_day, startDate: event.start_date, endDateExclusive: event.end_date_exclusive, timeZone: event.source_timezone, availability: event.availability, url: event.html_url };
}
