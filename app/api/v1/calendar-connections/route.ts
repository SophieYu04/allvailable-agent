import { NextResponse } from "next/server";

import { requireUser } from "@/lib/server/auth";
import { providerConfigured, authorizationUrl, type OAuthProvider } from "@/lib/server/calendar-providers";
import { calendarCallbackUrl } from "@/lib/server/calendar-origin";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { pkceChallenge, randomOAuthValue } from "@/lib/server/calendar-crypto";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase.from("calendar_connections").select("provider,account_email,scopes,connected_at,last_synced_at,last_error").eq("user_id", user.id);
    if (error) return jsonError(500, "CALENDAR_CONNECTIONS_READ_FAILED", "無法讀取行事曆連線", true);
    return NextResponse.json({ connections: (['google', 'microsoft'] as const).map((provider) => ({ provider, configured: providerConfigured(provider), connection: data?.find((item) => item.provider === provider) ?? null })) });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(unauthenticated ? 401 : 500, unauthenticated ? "UNAUTHENTICATED" : "CALENDAR_CONNECTIONS_READ_FAILED", unauthenticated ? "請先登入" : "無法讀取行事曆連線");
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    const body = await request.json().catch(() => ({})) as { provider?: unknown; returnTo?: unknown };
    if (body.provider !== "google" && body.provider !== "microsoft") return jsonError(400, "CALENDAR_PROVIDER_INVALID", "不支援的行事曆");
    const provider: OAuthProvider = body.provider;
    const returnTo = safeReturnTo(body.returnTo);
    const admin = getSupabaseAdminClient();
    if (!admin) return jsonError(503, "CALENDAR_STORAGE_NOT_CONFIGURED", "行事曆儲存尚未設定");
    const state = randomOAuthValue();
    const verifier = randomOAuthValue(48);
    const { data: transaction, error } = await admin.from("calendar_link_transactions").insert({ user_id: user.id, provider, state, verifier, return_to: returnTo, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }).select("id").single();
    if (error || !transaction) return jsonError(500, "CALENDAR_LINK_START_FAILED", "無法開始行事曆連線", true);
    const callback = calendarCallbackUrl(request, provider);
    return NextResponse.json({ transactionId: transaction.id, authorizationUrl: authorizationUrl(provider, { redirectUri: callback, state, challenge: await pkceChallenge(verifier) }) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CALENDAR_LINK_START_FAILED";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : 422, code, code === "UNAUTHENTICATED" ? "請先登入" : "無法開始行事曆連線");
  }
}

function safeReturnTo(value: unknown) {
  const fallback = "com.yuema.mobile://calendar-callback/";
  if (typeof value !== "string" || value.length > 300) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === "com.yuema.mobile:") return url.toString();
    if ((url.protocol === "https:" || url.protocol === "http:") && (url.hostname === "localhost" || url.hostname.endsWith("yuema.app"))) return url.toString();
  } catch { /* use the fixed mobile callback */ }
  return fallback;
}
