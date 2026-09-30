import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/server/auth";
import { calendarCallbackUrl } from "@/lib/server/calendar-origin";
import { authorizationUrl, type OAuthProvider } from "@/lib/server/calendar-providers";
import { pkceChallenge, randomOAuthValue } from "@/lib/server/calendar-crypto";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ provider: string }> };

export async function GET(request: Request, context: Context) {
  const { provider: rawProvider } = await context.params;
  if (rawProvider !== "google" && rawProvider !== "microsoft") return jsonError(404, "CALENDAR_PROVIDER_NOT_FOUND", "不支援的行事曆");
  const provider: OAuthProvider = rawProvider;
  try {
    await requireUser();
    const state = randomOAuthValue();
    const verifier = randomOAuthValue(48);
    const secure = new URL(request.url).protocol === "https:";
    const store = await cookies();
    const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 10 * 60 };
    store.set(`calendar_oauth_state_${provider}`, state, cookieOptions);
    store.set(`calendar_oauth_verifier_${provider}`, verifier, cookieOptions);
    return NextResponse.redirect(authorizationUrl(provider, {
      redirectUri: calendarCallbackUrl(request, provider),
      state,
      challenge: await pkceChallenge(verifier),
    }));
  } catch (error) {
    const message = error instanceof Error && error.message === "UNAUTHENTICATED" ? "請先登入" : "行事曆連線尚未設定";
    return jsonError(message === "請先登入" ? 401 : 503, message === "請先登入" ? "UNAUTHENTICATED" : "CALENDAR_PROVIDER_NOT_CONFIGURED", message);
  }
}
