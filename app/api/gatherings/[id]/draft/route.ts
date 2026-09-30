import { NextResponse } from "next/server";
import { validateCells } from "@/lib/calendar/patch";
import { validateGatheringCells } from "@/lib/server/gatherings";
import { requireUser } from "@/lib/server/auth";
import { decimalVersion, jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try { const { supabase, user } = await requireUser(request); const { data, error } = await supabase.from("availability_drafts").select("cells,version,updated_at").eq("gathering_id", id).eq("user_id", user.id).maybeSingle(); if (error) return jsonError(500, "DRAFT_READ_FAILED", "無法讀取草稿", true); return NextResponse.json({ cells: data?.cells ?? {}, version: String(data?.version ?? 1), updatedAt: data?.updated_at ?? null }); } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase } = await requireUser(request); const body = await request.json() as { expectedVersion?: string; cells?: unknown };
    if (!body.expectedVersion || !body.cells) return jsonError(400, "DRAFT_INPUT_REQUIRED", "需要版本與填色");
    const cells = validateCells(body.cells);
    const { data: gathering } = await supabase.from("gatherings").select("status,deadline_at,date_start,date_end,daily_start,daily_end").eq("id", id).maybeSingle();
    if (!gathering || gathering.status === "finalized" || gathering.status === "cancelled" || new Date(gathering.deadline_at).getTime() <= Date.now()) return jsonError(409, "GATHERING_LOCKED", "這場邀約已截止，無法修改");
    validateGatheringCells(cells, gathering);
    const expectedVersion = decimalVersion(body.expectedVersion);
    const { data, error } = await supabase.rpc("save_availability_draft", { p_gathering_id: id, p_version: expectedVersion, p_cells: cells });
    if (error || !data) return jsonError(409, "VERSION_CONFLICT", "草稿已被更新，請重新載入", true);
    return NextResponse.json({ cells: data.cells, version: String(data.version), updatedAt: data.updated_at });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DRAFT_INVALID";
    return jsonError(400, code === "CELL_OUT_OF_RANGE" ? "CELL_OUT_OF_RANGE" : "DRAFT_INVALID", code === "CELL_OUT_OF_RANGE" ? "有填色格不在這場邀約的日期或時間範圍內" : "草稿資料無效");
  }
}
