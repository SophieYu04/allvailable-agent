import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser(request);
    const body = await request.json() as { snapshotId?: string; candidateId?: string };
    if (!body.snapshotId || !body.candidateId) return jsonError(400,"CALENDAR_EVENT_INPUT_REQUIRED","需要已拍板時段");
    const { data, error } = await supabase.rpc("add_finalized_calendar_event", { p_gathering_id:id,p_snapshot_id:body.snapshotId,p_candidate_id:body.candidateId });
    if (error) return jsonError(409,"CALENDAR_EVENT_CREATE_FAILED","邀約尚未拍板或已更新，請重新載入",true);
    return NextResponse.json({event:data,replayed:data?.replayed===true});
  } catch (error) { const auth = error instanceof Error && error.message === "UNAUTHENTICATED"; return jsonError(auth?401:500,auth?"UNAUTHENTICATED":"CALENDAR_EVENT_CREATE_FAILED",auth?"請先登入":"無法加入日曆",true); }
}
