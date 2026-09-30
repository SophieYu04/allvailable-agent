import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { instant } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase } = await requireUser(request);
    const url = new URL(request.url);
    const start = instant(url.searchParams.get("start")); const end = instant(url.searchParams.get("end"));
    if (!start || !end || end <= start || end.getTime() - start.getTime() > 32 * 86_400_000) return jsonError(400, "RANKING_RANGE_INVALID", "排行榜日期範圍無效");
    const { data, error } = await supabase.rpc("focus_group_ranking", { p_group_id: id, p_start: start.toISOString(), p_end: end.toISOString() });
    if (error) return jsonError(403, "RANKING_FORBIDDEN", "你不是此群組的成員");
    return NextResponse.json({ ranking: (data ?? []).map((row: Record<string, unknown>, index: number) => ({ rank: index + 1, userId: row.user_id, displayName: row.display_name, seconds: Number(row.seconds ?? 0), isFocusing: row.is_focusing === true })) });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "RANKING_READ_FAILED", auth ? "請先登入" : "無法讀取排行榜");
  }
}
