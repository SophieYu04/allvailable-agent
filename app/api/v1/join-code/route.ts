import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const body = await request.json().catch(() => null) as {code?:unknown}|null;
    if (typeof body?.code !== "string" || !/^\d{6}$/.test(body.code)) return jsonError(400,"INVALID_CODE","Enter six digits.");
    const { data, error } = await supabase.rpc("resolve_gathering_code", { p_code: body.code });
    if (error) return jsonError(503,"LOOKUP_UNAVAILABLE","Unable to find gatherings right now.",true);
    if (data?.error) return jsonError(data.error === "RATE_LIMITED" ? 429 : 404,data.error,data.error === "RATE_LIMITED" ? "Try again in 10 minutes." : "No gathering found.",true);
    return NextResponse.json({ token: data.token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error instanceof Error && error.message === "AUTH_NOT_CONFIGURED" ? 503 : 401,"SIGN_IN_REQUIRED","Sign in to join.");
  }
}
