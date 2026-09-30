import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { instant } from "@/lib/server/productivity";
import { decimalVersion, jsonError, nextDecimalVersion } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const { data: session } = await supabase.from("focus_sessions").select("id,status,source,version,started_at,ended_at").eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
    if (!session) return jsonError(404, "FOCUS_NOT_FOUND", "找不到專注紀錄");
    const expected = decimalVersion(body.expectedVersion ?? session.version);
    if (String(session.version) !== expected) return jsonError(409, "VERSION_CONFLICT", "專注紀錄已更新", true);
    const requestedAt = instant(body.occurredAt);
    const nowDate = requestedAt && requestedAt.getTime() <= Date.now() + 60_000
      ? requestedAt
      : new Date();
    const now = nowDate.toISOString();
    if (action === "pause" || action === "stop") {
      const { data: open } = await supabase.from("focus_segments").select("id").eq("session_id", id).is("end_at", null).is("deleted_at", null).order("start_at", { ascending: false }).limit(1).maybeSingle();
      if (open) await supabase.from("focus_segments").update({ end_at: now, original_end_at: now }).eq("id", open.id).eq("user_id", user.id);
      const { data, error } = await supabase.from("focus_sessions").update({ status: action === "pause" ? "paused" : "completed", ended_at: action === "stop" ? now : null, version: nextDecimalVersion(expected) }).eq("id", id).eq("user_id", user.id).eq("version", expected).select("id,subject_id,source,status,started_at,ended_at,version,conflicted").single();
      if (error || !data) return jsonError(409, "VERSION_CONFLICT", "專注紀錄已更新", true);
      return NextResponse.json({ session: response(data) });
    }
    if (action === "resume") {
      if (session.status !== "paused") return jsonError(409, "FOCUS_NOT_PAUSED", "此計時不在暫停狀態");
      const { data, error } = await supabase.from("focus_sessions").update({ status: "running", version: nextDecimalVersion(expected) }).eq("id", id).eq("user_id", user.id).eq("version", expected).select("id,subject_id,source,status,started_at,ended_at,version,conflicted").single();
      if (error || !data) return jsonError(409, "VERSION_CONFLICT", "專注紀錄已更新", true);
      await supabase.from("focus_segments").insert({ session_id: id, user_id: user.id, original_start_at: now, start_at: now });
      return NextResponse.json({ session: response(data) });
    }
    if (action === "edit") {
      if (session.status !== "completed") return jsonError(409, "FOCUS_ACTIVE", "請先停止計時");
      const start = instant(body.startAt); const end = instant(body.endAt);
      if (!start || !end || end <= start) return jsonError(400, "FOCUS_TIME_INVALID", "專注時間無效");
      const { data: segments } = await supabase.from("focus_segments").select("id,original_start_at,original_end_at,start_at,end_at").eq("session_id", id).is("deleted_at", null).order("start_at");
      if (!segments?.length) return jsonError(409, "FOCUS_SEGMENTS_MISSING", "找不到計時區段");
      const first = segments[0]; const last = segments[segments.length - 1];
      await supabase.from("focus_segments").update({ start_at: start.toISOString() }).eq("id", first.id).eq("user_id", user.id);
      await supabase.from("focus_segments").update({ end_at: end.toISOString() }).eq("id", last.id).eq("user_id", user.id);
      const { data, error } = await supabase.from("focus_sessions").update({ started_at: start.toISOString(), ended_at: end.toISOString(), version: nextDecimalVersion(expected) }).eq("id", id).eq("user_id", user.id).eq("version", expected).select("id,subject_id,source,status,started_at,ended_at,version,conflicted").single();
      if (error || !data) return jsonError(409, "VERSION_CONFLICT", "專注紀錄已更新", true);
      return NextResponse.json({ session: response(data) });
    }
    return jsonError(400, "FOCUS_ACTION_INVALID", "不支援的計時操作");
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "FOCUS_UPDATE_FAILED", auth ? "請先登入" : "無法更新專注紀錄");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { error } = await supabase.from("focus_sessions").update({ deleted_at: new Date().toISOString(), status: "completed" }).eq("id", id).eq("user_id", user.id);
    if (error) return jsonError(409, "FOCUS_DELETE_FAILED", "無法刪除專注紀錄", true);
    await supabase.from("focus_segments").update({ deleted_at: new Date().toISOString() }).eq("session_id", id).eq("user_id", user.id);
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "FOCUS_DELETE_FAILED", auth ? "請先登入" : "無法刪除專注紀錄");
  }
}

function response(item: Record<string, unknown>) {
  return { id: item.id, subjectId: item.subject_id, source: item.source, status: item.status, startedAt: item.started_at, endedAt: item.ended_at, version: String(item.version), conflicted: item.conflicted };
}
