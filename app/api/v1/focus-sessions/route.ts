import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { instant, text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

const sessionFields = "id,user_id,subject_id,source,status,started_at,ended_at,idempotency_key,version,conflicted,deleted_at,created_at,updated_at";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const url = new URL(request.url);
    const start = instant(url.searchParams.get("start"));
    const end = instant(url.searchParams.get("end"));
    if (!start || !end || end <= start || end.getTime() - start.getTime() > 366 * 86_400_000) return jsonError(400, "FOCUS_RANGE_INVALID", "日期範圍無效");
    const { data: sessions, error } = await supabase.from("focus_sessions").select(sessionFields).eq("user_id", user.id).is("deleted_at", null).lt("started_at", end.toISOString()).or(`ended_at.is.null,ended_at.gt.${start.toISOString()}`).order("started_at");
    if (error) return jsonError(500, "FOCUS_READ_FAILED", "無法讀取專注紀錄", true);
    const ids = (sessions ?? []).map((item) => item.id);
    const { data: segments } = ids.length ? await supabase.from("focus_segments").select("id,session_id,original_start_at,original_end_at,start_at,end_at,deleted_at").in("session_id", ids).is("deleted_at", null).order("start_at") : { data: [] };
    return NextResponse.json({ sessions: (sessions ?? []).map((item) => ({ id: item.id, subjectId: item.subject_id, source: item.source, status: item.status, startedAt: item.started_at, endedAt: item.ended_at, version: String(item.version), conflicted: item.conflicted, segments: (segments ?? []).filter((segment) => segment.session_id === item.id).map((segment) => ({ id: segment.id, startAt: segment.start_at, endAt: segment.end_at, originalStartAt: segment.original_start_at, originalEndAt: segment.original_end_at })) })) });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "FOCUS_READ_FAILED", auth ? "請先登入" : "無法讀取專注紀錄");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const subjectId = text(body.subjectId, 100);
    const key = text(body.idempotencyKey, 200);
    const action = body.action === "manual" || body.action === "import" ? body.action : "start";
    if (!subjectId) return jsonError(400, "SUBJECT_REQUIRED", "請選擇科目");
    const { data: subject } = await supabase.from("subjects").select("id").eq("id", subjectId).eq("user_id", user.id).is("archived_at", null).maybeSingle();
    if (!subject) return jsonError(404, "SUBJECT_NOT_FOUND", "找不到科目");
    if (key) {
      const { data: replay } = await supabase.from("focus_sessions").select(sessionFields).eq("user_id", user.id).eq("idempotency_key", key).maybeSingle();
      if (replay) return NextResponse.json({ session: sessionResponse(replay), replayed: true });
    }
    const now = new Date();
    const start = action === "start" ? now : instant(body.startAt);
    const end = action === "start" ? null : instant(body.endAt);
    if (!start || (action !== "start" && (!end || end <= start || end.getTime() > now.getTime() + 60_000))) return jsonError(400, "FOCUS_TIME_INVALID", "專注時間無效");
    const source = action === "manual" ? "manual" : "timer";
    const status = action === "start" ? "running" : "completed";
    let conflicted = false;
    if (end) {
      const { data: overlaps } = await supabase.from("focus_sessions").select("id").eq("user_id", user.id).is("deleted_at", null).lt("started_at", end.toISOString()).gt("ended_at", start.toISOString()).limit(1);
      conflicted = (overlaps?.length ?? 0) > 0;
    }
    const { data, error } = await supabase.from("focus_sessions").insert({ user_id: user.id, subject_id: subjectId, source, status, started_at: start.toISOString(), ended_at: end?.toISOString() ?? null, idempotency_key: key, conflicted }).select(sessionFields).single();
    if (error || !data) return jsonError(409, "FOCUS_ALREADY_ACTIVE", "已有進行中的計時，請先停止", true);
    const { data: segment, error: segmentError } = await supabase.from("focus_segments").insert({ session_id: data.id, user_id: user.id, original_start_at: start.toISOString(), original_end_at: end?.toISOString() ?? null, start_at: start.toISOString(), end_at: end?.toISOString() ?? null }).select("id,start_at,end_at,original_start_at,original_end_at").single();
    if (segmentError || !segment) return jsonError(500, "FOCUS_SEGMENT_CREATE_FAILED", "計時已建立但無法保存區段", true);
    return NextResponse.json({ session: { ...sessionResponse(data), segments: [segmentResponse(segment)] } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "FOCUS_CREATE_FAILED", auth ? "請先登入" : "無法建立專注紀錄");
  }
}

function sessionResponse(item: Record<string, unknown>) {
  return { id: item.id, subjectId: item.subject_id, source: item.source, status: item.status, startedAt: item.started_at, endedAt: item.ended_at, version: String(item.version), conflicted: item.conflicted };
}
function segmentResponse(item: Record<string, unknown>) {
  return { id: item.id, startAt: item.start_at, endAt: item.end_at, originalStartAt: item.original_start_at, originalEndAt: item.original_end_at };
}
