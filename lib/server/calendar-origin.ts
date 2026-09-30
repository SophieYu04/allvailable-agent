import type { OAuthProvider } from "@/lib/server/calendar-providers";

export function appOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("APP_ORIGIN_INVALID");
    return url.origin;
  }
  return new URL(request.url).origin;
}

export function calendarCallbackUrl(request: Request, provider: OAuthProvider) {
  return new URL(`/api/calendar-integrations/${provider}/callback`, appOrigin(request)).toString();
}

export function calendarReturnUrl(request: Request, parameters: Record<string, string>) {
  const url = new URL("/", appOrigin(request));
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}
