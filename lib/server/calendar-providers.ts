import { decryptCalendarToken, encryptCalendarToken } from "@/lib/server/calendar-crypto";
import type { CalendarProvider } from "@/lib/calendar/provider-contract";

export type OAuthProvider = Extract<CalendarProvider, "google" | "microsoft">;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export type StoredCredential = {
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  expires_at: string | null;
  token_type: string;
};

export type ExternalEventRow = {
  provider: OAuthProvider;
  external_id: string;
  calendar_id: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  start_date: string | null;
  end_date_exclusive: string | null;
  source_timezone: string | null;
  availability: "busy" | "tentative" | "free";
  source_updated_at: string | null;
  source_version: string | null;
  html_url: string | null;
};

function setting(provider: OAuthProvider) {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scope: "openid email https://www.googleapis.com/auth/calendar.readonly",
    };
  }
  const tenant = process.env.MICROSOFT_CALENDAR_TENANT_ID || "common";
  return {
    clientId: process.env.MICROSOFT_CALENDAR_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET,
    authorizeUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    scope: "openid email offline_access Calendars.Read",
  };
}

export function providerConfigured(provider: OAuthProvider) {
  const config = setting(provider);
  return Boolean(config.clientId && config.clientSecret && process.env.CALENDAR_TOKEN_ENCRYPTION_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function authorizationUrl(provider: OAuthProvider, input: { redirectUri: string; state: string; challenge: string }) {
  const config = setting(provider);
  if (!config.clientId || !config.clientSecret) throw new Error("CALENDAR_PROVIDER_NOT_CONFIGURED");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: config.scope,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  });
  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("include_granted_scopes", "true");
    params.set("prompt", "consent");
  } else {
    params.set("response_mode", "query");
  }
  return `${config.authorizeUrl}?${params}`;
}

async function tokenRequest(provider: OAuthProvider, parameters: Record<string, string>) {
  const config = setting(provider);
  if (!config.clientId || !config.clientSecret) throw new Error("CALENDAR_PROVIDER_NOT_CONFIGURED");
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }),
  });
  const body = await response.json() as TokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || "CALENDAR_TOKEN_EXCHANGE_FAILED");
  return body;
}

export function exchangeAuthorizationCode(provider: OAuthProvider, input: { code: string; redirectUri: string; verifier: string }) {
  return tokenRequest(provider, {
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
    grant_type: "authorization_code",
  });
}

export async function encryptedCredential(tokens: TokenResponse, previousRefreshToken?: string | null) {
  return {
    access_token_ciphertext: await encryptCalendarToken(tokens.access_token),
    refresh_token_ciphertext: tokens.refresh_token ? await encryptCalendarToken(tokens.refresh_token) : previousRefreshToken ?? null,
    expires_at: tokens.expires_in ? new Date(Date.now() + Math.max(0, tokens.expires_in - 60) * 1000).toISOString() : null,
    token_type: tokens.token_type || "Bearer",
  };
}

export async function usableAccessToken(provider: OAuthProvider, credential: StoredCredential) {
  const expiresSoon = !credential.expires_at || new Date(credential.expires_at).getTime() <= Date.now() + 60_000;
  if (!expiresSoon) return { accessToken: await decryptCalendarToken(credential.access_token_ciphertext), refreshed: null };
  if (!credential.refresh_token_ciphertext) throw new Error("CALENDAR_RECONNECT_REQUIRED");
  const refreshToken = await decryptCalendarToken(credential.refresh_token_ciphertext);
  const tokens = await tokenRequest(provider, {
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    ...(provider === "microsoft" ? { scope: setting(provider).scope } : {}),
  });
  const refreshed = await encryptedCredential(tokens, credential.refresh_token_ciphertext);
  return { accessToken: tokens.access_token, refreshed };
}

async function fetchAll<T>(url: string, accessToken: string, nextKey: "nextPageToken" | "@odata.nextLink", headers: HeadersInit = {}) {
  const items: T[] = [];
  let next: string | null = url;
  for (let page = 0; next && page < 20; page += 1) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}`, ...headers } });
    const body = await response.json() as { items?: T[]; value?: T[]; nextPageToken?: string; "@odata.nextLink"?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message || "CALENDAR_PROVIDER_READ_FAILED");
    items.push(...(body.items ?? body.value ?? []));
    const cursor = body[nextKey];
    if (!cursor) next = null;
    else if (nextKey === "@odata.nextLink") next = cursor;
    else { const parsed = new URL(url); parsed.searchParams.set("pageToken", cursor); next = parsed.toString(); }
  }
  if (next) throw new Error("CALENDAR_SYNC_INCOMPLETE");
  return items;
}

export async function fetchProviderEvents(provider: OAuthProvider, accessToken: string, input: { start: string; end: string; timeZone: string; calendarId?: string }) {
  if (provider === "google") {
    type GoogleEvent = { id: string; summary?: string; status?: string; transparency?: string; updated?: string; etag?: string; htmlLink?: string; start?: { dateTime?: string; date?: string; timeZone?: string }; end?: { dateTime?: string; date?: string; timeZone?: string }; attendees?: Array<{ self?: boolean; responseStatus?: string }> };
    const calendarId = input.calendarId || "primary";
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.search = new URLSearchParams({ timeMin: input.start, timeMax: input.end, singleEvents: "true", showDeleted: "false", maxResults: "2500", orderBy: "startTime" }).toString();
    const events = await fetchAll<GoogleEvent>(url.toString(), accessToken, "nextPageToken");
    return events.filter((event) => event.status !== "cancelled" && event.start && event.end).map((event): ExternalEventRow => {
      const allDay = Boolean(event.start?.date);
      const declined = event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined");
      return {
        provider,
        external_id: event.id,
        calendar_id: input.calendarId || "primary",
        title: Array.from(event.summary || "Busy").slice(0, 200).join(""),
        start_at: allDay ? null : event.start?.dateTime ?? null,
        end_at: allDay ? null : event.end?.dateTime ?? null,
        all_day: allDay,
        start_date: event.start?.date ?? null,
        end_date_exclusive: event.end?.date ?? null,
        source_timezone: event.start?.timeZone ?? input.timeZone,
        availability: event.transparency === "transparent" || declined ? "free" : event.status === "tentative" || event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "tentative") ? "tentative" : "busy",
        source_updated_at: event.updated ?? null,
        source_version: event.etag ?? null,
        html_url: event.htmlLink ?? null,
      };
    });
  }
  type MicrosoftEvent = { id: string; subject?: string; showAs?: string; isAllDay?: boolean; lastModifiedDateTime?: string; changeKey?: string; webLink?: string; start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string } };
  const calendarId = input.calendarId;
  const url = new URL(calendarId ? `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView` : "https://graph.microsoft.com/v1.0/me/calendarView");
  url.search = new URLSearchParams({ startDateTime: input.start, endDateTime: input.end, "$top": "1000", "$select": "id,subject,showAs,isAllDay,changeKey,webLink,start,end" }).toString();
  const events = await fetchAll<MicrosoftEvent>(url.toString(), accessToken, "@odata.nextLink", { Prefer: "outlook.timezone=\"UTC\"" });
  return events.filter((event) => event.start?.dateTime && event.end?.dateTime).map((event): ExternalEventRow => {
    const start = microsoftDate(event.start!.dateTime!, "UTC");
    const end = microsoftDate(event.end!.dateTime!, "UTC");
    return {
      provider,
      external_id: event.id,
      calendar_id: input.calendarId || "primary",
      title: event.subject || "Busy",
      start_at: event.isAllDay ? null : start,
      end_at: event.isAllDay ? null : end,
      all_day: Boolean(event.isAllDay),
      start_date: event.isAllDay ? event.start!.dateTime!.slice(0, 10) : null,
      end_date_exclusive: event.isAllDay ? event.end!.dateTime!.slice(0, 10) : null,
      source_timezone: event.start!.timeZone || input.timeZone,
      availability: event.showAs === "free" ? "free" : event.showAs === "tentative" ? "tentative" : "busy",
      source_updated_at: event.lastModifiedDateTime ?? null,
      source_version: event.changeKey ?? null,
      html_url: event.webLink ?? null,
    };
  });
}

export async function fetchProviderCalendars(provider: OAuthProvider, accessToken: string) {
  if (provider === "google") {
    type GoogleCalendar = { id: string; summary?: string; summaryOverride?: string; accessRole?: string };
    const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250";
    const calendars = await fetchAll<GoogleCalendar>(url, accessToken, "nextPageToken");
    return calendars.map((calendar) => ({ id: calendar.id, name: calendar.summaryOverride || calendar.summary || "Google Calendar", canWrite: calendar.accessRole === "owner" || calendar.accessRole === "writer" }));
  }
  type MicrosoftCalendar = { id: string; name?: string; canEdit?: boolean };
  const calendars = await fetchAll<MicrosoftCalendar>("https://graph.microsoft.com/v1.0/me/calendars?$top=100", accessToken, "@odata.nextLink");
  return calendars.map((calendar) => ({ id: calendar.id, name: calendar.name || "Microsoft Calendar", canWrite: calendar.canEdit === true }));
}

function microsoftDate(value: string, timeZone: string) {
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return new Date(value).toISOString();
  // Microsoft can return a local wall-clock value. Ask Graph for the user's IANA zone;
  // for the common UTC response this is exact. Other zones are kept explicit at sync UI level.
  if (timeZone === "UTC") return new Date(`${value}Z`).toISOString();
  const candidate = new Date(value);
  if (!Number.isNaN(candidate.getTime())) return candidate.toISOString();
  throw new Error("CALENDAR_TIME_INVALID");
}
