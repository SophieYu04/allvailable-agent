import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { decimalVersion, jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const from = start ?? "1970-01-01";
    const to = end ?? "2100-12-31";
    const [{ data: version }, { data: cells, error }] = await Promise.all([
      supabase.from("personal_calendar_versions").select("version,updated_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("personal_busy_cells").select("local_date,minute_of_day,status").eq("user_id", user.id).gte("local_date", from).lte("local_date", to),
    ]);
    if (error) return jsonError(500, "PERSONAL_CALENDAR_READ_FAILED", "無法讀取個人忙碌", true);
    return NextResponse.json({ version: String(version?.version ?? 1), cells: cells ?? [] });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { expectedVersion?: string; changes?: Array<{ date: string; minute: number; status: "unknown" | "green" | "yellow" | "red" }> };
    if (!body.expectedVersion || !Array.isArray(body.changes)) return jsonError(400, "PERSONAL_CALENDAR_INPUT_REQUIRED", "需要版本與變更");
    const expectedVersion = decimalVersion(body.expectedVersion);
    const { data, error } = await supabase.rpc("apply_personal_busy_cells", { p_expected_version: expectedVersion, p_changes: body.changes });
    if (error) return jsonError(error.message.includes("VERSION_CONFLICT") ? 409 : 400, error.message.includes("VERSION_CONFLICT") ? "VERSION_CONFLICT" : "PERSONAL_CALENDAR_UPDATE_FAILED", "個人忙碌已被更新，請重新載入", true);
    return NextResponse.json({ version: String(data), userId: user.id });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
