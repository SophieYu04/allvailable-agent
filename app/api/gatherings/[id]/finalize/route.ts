import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { decimalVersion, jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { snapshotId?: string; candidateId?: string; expectedRevision?: string };
    if (!body.snapshotId || !body.candidateId || !body.expectedRevision) return jsonError(400, "FINALIZE_INPUT_REQUIRED", "需要結果版本與時段");
    const expectedRevision = decimalVersion(body.expectedRevision);
    const { data: finalization, error } = await supabase.rpc("finalize_gathering", { p_gathering_id: id, p_snapshot_id: body.snapshotId, p_candidate_id: body.candidateId, p_expected_revision: expectedRevision });
    if (error) { const code = error.message.includes("STALE_RESULT") ? "STALE_RESULT" : error.message.includes("HOST_REQUIRED") ? "HOST_REQUIRED" : error.message.includes("CANDIDATE_NOT_FOUND") ? "CANDIDATE_NOT_FOUND" : "FINALIZE_FAILED"; return jsonError(code === "STALE_RESULT" ? 409 : code === "HOST_REQUIRED" ? 403 : 400, code, "無法拍板這個時段", code === "STALE_RESULT"); }
    return NextResponse.json({ finalization, finalizedBy: user.id });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
