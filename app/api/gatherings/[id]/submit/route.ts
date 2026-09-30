import { NextResponse } from "next/server";
import { validateCells } from "@/lib/calendar/patch";
import { validateGatheringCells } from "@/lib/server/gatherings";
import { requireUser } from "@/lib/server/auth";
import { decimalVersion, jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { expectedDraftVersion?: string; cells?: unknown; changes?: Array<{ date: string; minute: number; status: string }> };
    if (!body.expectedDraftVersion || !body.cells) return jsonError(400, "SUBMIT_INPUT_REQUIRED", "需要草稿版本與填色資料");
    const cells = validateCells(body.cells);
    const { data: gathering } = await supabase.from("gatherings").select("date_start,date_end,daily_start,daily_end").eq("id", id).maybeSingle();
    if (!gathering) return jsonError(404, "GATHERING_NOT_FOUND", "找不到邀約");
    validateGatheringCells(cells, gathering);
    const changes = (body.changes ?? []).map((change) => {
      if (!change || typeof change.date !== "string" || !Number.isInteger(change.minute) || change.minute < 0 || change.minute > 1410 || change.minute % 30 !== 0 || !["unknown", "green", "yellow", "red"].includes(change.status)) throw new Error("CHANGES_INVALID");
      return { date: change.date, minute: change.minute, status: change.status };
    });
    const changeCells = Object.fromEntries(changes.map((change) => [`${change.date}-${String(Math.floor(change.minute / 60)).padStart(2, "0")}:${String(change.minute % 60).padStart(2, "0")}`, change.status]));
    validateGatheringCells(validateCells(changeCells), gathering);
    const expectedDraftVersion = decimalVersion(body.expectedDraftVersion);
    const { data, error } = await supabase.rpc("submit_availability", { p_gathering_id: id, p_expected_draft_version: expectedDraftVersion, p_cells: cells, p_changes: changes });
    if (error) {
      const code = error.message.includes("VERSION_CONFLICT") ? "VERSION_CONFLICT" : error.message.includes("GATHERING_LOCKED") ? "GATHERING_LOCKED" : error.message.includes("NOT_MEMBER") ? "NOT_MEMBER" : error.message.includes("CELL_OUT_OF_RANGE") ? "CELL_OUT_OF_RANGE" : "SUBMIT_FAILED";
      return jsonError(code === "VERSION_CONFLICT" ? 409 : 400, code, "無法提交這份草稿", code === "VERSION_CONFLICT");
    }
    return NextResponse.json({ ...data, submittedBy: user.id });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUBMIT_INVALID";
    return jsonError(400, code === "CELL_OUT_OF_RANGE" ? code : "SUBMIT_INVALID", code === "CELL_OUT_OF_RANGE" ? "有填色格不在這場邀約的日期或時間範圍內" : "提交資料無效");
  }
}
