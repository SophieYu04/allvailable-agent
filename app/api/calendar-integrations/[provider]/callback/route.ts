import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { calendarCallbackUrl, calendarReturnUrl } from "@/lib/server/calendar-origin";
import { encryptedCredential, exchangeAuthorizationCode, fetchProviderCalendars, type OAuthProvider } from "@/lib/server/calendar-providers";

type Context = { params: Promise<{ provider: string }> };

export async function GET(request: Request, context: Context) {
  const { provider: rawProvider } = await context.params;
  if (rawProvider !== "google" && rawProvider !== "microsoft") return NextResponse.redirect(calendarReturnUrl(request, { calendar_error: "provider" }));
  const provider: OAuthProvider = rawProvider;
  const url = new URL(request.url);
  const transactionId = url.searchParams.get("transaction");
  if (transactionId) return mobileCallback(request, provider, transactionId);
  const mobileTransaction = url.searchParams.get("state") ? await transactionForState(provider, url.searchParams.get("state")!) : null;
  if (mobileTransaction) return mobileCallback(request, provider, mobileTransaction);
  const store = await cookies();
  const state = store.get(`calendar_oauth_state_${provider}`)?.value;
  const verifier = store.get(`calendar_oauth_verifier_${provider}`)?.value;
  store.delete(`calendar_oauth_state_${provider}`);
  store.delete(`calendar_oauth_verifier_${provider}`);
  if (url.searchParams.get("error")) return NextResponse.redirect(calendarReturnUrl(request, { calendar_error: "denied" }));
  if (!state || !verifier || state !== url.searchParams.get("state") || !url.searchParams.get("code")) {
    return NextResponse.redirect(calendarReturnUrl(request, { calendar_error: "state" }));
  }
  try {
    const { user } = await requireUser();
    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("CALENDAR_STORAGE_NOT_CONFIGURED");
    const tokens = await exchangeAuthorizationCode(provider, {
      code: url.searchParams.get("code")!,
      redirectUri: calendarCallbackUrl(request, provider),
      verifier,
    });
    const [{ data: previous }, identity] = await Promise.all([
      admin.from("calendar_credentials").select("refresh_token_ciphertext").eq("user_id", user.id).eq("provider", provider).maybeSingle(),
      providerIdentity(provider, tokens.access_token),
    ]);
    const scopes = (tokens.scope || "").split(/\s+/).filter(Boolean);
    const { error: connectionError } = await admin.from("calendar_connections").upsert({
      user_id: user.id,
      provider,
      account_email: identity,
      scopes,
      connected_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: "user_id,provider" });
    if (connectionError) throw connectionError;
    await saveCalendarSources(admin, user.id, provider, tokens.access_token, identity);
    const { error: credentialError } = await admin.from("calendar_credentials").upsert({
      user_id: user.id,
      provider,
      ...await encryptedCredential(tokens, previous?.refresh_token_ciphertext),
    }, { onConflict: "user_id,provider" });
    if (credentialError) {
      await admin.from("calendar_connections").delete().eq("user_id", user.id).eq("provider", provider);
      throw credentialError;
    }
    return NextResponse.redirect(calendarReturnUrl(request, { calendar_connected: provider }));
  } catch {
    return NextResponse.redirect(calendarReturnUrl(request, { calendar_error: "exchange" }));
  }
}

async function transactionForState(provider: OAuthProvider, state: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("calendar_link_transactions").select("id").eq("provider", provider).eq("state", state).maybeSingle();
  return data?.id ?? null;
}

async function mobileCallback(request: Request, provider: OAuthProvider, transactionId: string) {
  const fallback = calendarReturnUrl(request, { calendar_error: "state" });
  try {
    const admin = getSupabaseAdminClient();
    if (!admin) return NextResponse.redirect(fallback);
    const url = new URL(request.url);
    const { data: transaction } = await admin.from("calendar_link_transactions").select("id,user_id,provider,state,verifier,return_to,expires_at,consumed_at").eq("id", transactionId).eq("provider", provider).maybeSingle();
    if (!transaction || transaction.consumed_at || new Date(transaction.expires_at).getTime() <= Date.now() || transaction.state !== url.searchParams.get("state")) return NextResponse.redirect(fallback);
    const returnTo = new URL(transaction.return_to);
    if (url.searchParams.get("error") || !url.searchParams.get("code")) {
      returnTo.searchParams.set("status", "denied");
      returnTo.searchParams.set("transaction", transaction.id);
      return NextResponse.redirect(returnTo);
    }
    const tokens = await exchangeAuthorizationCode(provider, { code: url.searchParams.get("code")!, redirectUri: calendarCallbackUrl(request, provider), verifier: transaction.verifier });
    const [{ data: previous }, identity] = await Promise.all([
      admin.from("calendar_credentials").select("refresh_token_ciphertext").eq("user_id", transaction.user_id).eq("provider", provider).maybeSingle(),
      providerIdentity(provider, tokens.access_token),
    ]);
    const scopes = (tokens.scope || "").split(/\s+/).filter(Boolean);
    const { error: connectionError } = await admin.from("calendar_connections").upsert({ user_id: transaction.user_id, provider, account_email: identity, scopes, connected_at: new Date().toISOString(), last_error: null }, { onConflict: "user_id,provider" });
    if (connectionError) throw connectionError;
    await saveCalendarSources(admin, transaction.user_id, provider, tokens.access_token, identity);
    const { error: credentialError } = await admin.from("calendar_credentials").upsert({ user_id: transaction.user_id, provider, ...await encryptedCredential(tokens, previous?.refresh_token_ciphertext) }, { onConflict: "user_id,provider" });
    if (credentialError) throw credentialError;
    await admin.from("calendar_link_transactions").update({ consumed_at: new Date().toISOString() }).eq("id", transaction.id).is("consumed_at", null);
    returnTo.searchParams.set("status", "connected");
    returnTo.searchParams.set("transaction", transaction.id);
    return NextResponse.redirect(returnTo);
  } catch {
    return NextResponse.redirect(fallback);
  }
}

async function providerIdentity(provider: OAuthProvider, accessToken: string) {
  const endpoint = provider === "google"
    ? "https://openidconnect.googleapis.com/v1/userinfo"
    : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const body = await response.json() as { email?: string; mail?: string; userPrincipalName?: string };
  return body.email ?? body.mail ?? body.userPrincipalName ?? null;
}

async function saveCalendarSources(admin: ReturnType<typeof getSupabaseAdminClient>, userId: string, provider: OAuthProvider, accessToken: string, identity: string | null) {
  if (!admin) return;
  let calendars: Array<{ id: string; name: string; canWrite: boolean }> = [];
  try { calendars = await fetchProviderCalendars(provider, accessToken); } catch { /* keep a primary source when listing is temporarily unavailable */ }
  if (!calendars.length) calendars = [{ id: "primary", name: provider === "google" ? "Google Calendar" : "Microsoft Calendar", canWrite: false }];
  await admin.from("calendar_sources").upsert(calendars.map((calendar) => ({ user_id: userId, provider, external_account_id: identity || "default", calendar_id: calendar.id, display_name: calendar.name, can_write: false, sync_status: "idle" })), { onConflict: "user_id,provider,external_account_id,calendar_id" });
}
