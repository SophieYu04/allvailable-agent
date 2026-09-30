import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { providerConfigured } from "@/lib/server/calendar-providers";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase
      .from("calendar_connections")
      .select("provider,account_email,scopes,connected_at,last_synced_at,last_error")
      .eq("user_id", user.id);
    if (error) return jsonError(500, "CALENDAR_CONNECTIONS_READ_FAILED", "無法讀取行事曆連線", true);
    return NextResponse.json({
      providers: (["google", "microsoft"] as const).map((provider) => ({
        provider,
        configured: providerConfigured(provider),
        connection: data?.find((connection) => connection.provider === provider) ?? null,
      })),
    });
  } catch {
    return jsonError(401, "UNAUTHENTICATED", "請先登入");
  }
}
