import { parseCalendarCorrection } from "@/lib/ai/openai";
import { NextResponse } from "next/server";
import { extractionSchema } from "@/lib/calendar/schemas";
import { analyzeCalendarCorrectionVoice } from "@/lib/ai/service";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    if (process.env.AI_IMPORT_ENABLED !== "true") return jsonError(503, "AI_DISABLED", "AI 匯入目前未開放");
    const form = await request.formData();
    const audio = form.get("audio");
    const transcript = String(form.get("transcript") ?? "").trim();
    const eventId = String(form.get("eventId") ?? "");
    const version = String(form.get("version") ?? "");
    if ((!(audio instanceof File) && !transcript) || transcript.length > 2000 || !eventId || !/^\d+$/.test(version)) return jsonError(400, "CORRECTION_INPUT_REQUIRED", "需要錄音、事件與版本");
    if (audio instanceof File && (audio.size > 10 * 1024 * 1024 || !["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/x-m4a"].includes(audio.type))) return jsonError(415, "AUDIO_INVALID", "錄音格式或大小不符合限制");
    const { data: row, error } = await supabase.from("calendar_imports").select("version,status,source_kind,extraction,expires_at,clarification_count").eq("id", id).eq("user_id", user.id).single();
    if (error || !row) return jsonError(404, "IMPORT_NOT_FOUND", "找不到這次匯入");
    if (new Date(row.expires_at).getTime() <= Date.now()) return jsonError(410, "IMPORT_EXPIRED", "這次匯入已過期");
    if (String(row.version) !== version) return jsonError(409, "VERSION_CONFLICT", "匯入內容已更新，請重新載入", true);
    if (row.status === "rejected") return jsonError(422, "UNRELATED_INPUT", "這批內容沒有可修正的行程");
    if (Number(row.clarification_count ?? 0) >= 10) return jsonError(429, "CORRECTION_LIMIT", "這次匯入已達語音修正次數上限，請改用手動編輯", false);
    const extraction = extractionSchema.parse(row.extraction);
    const event = extraction.events.find((item) => item.id === eventId);
    if (!event || !event.sourceIds.some((sourceId) => extraction.sources.some((source) => source.id === sourceId && (source.kind === "calendar" || source.kind === "schedule_voice")))) return jsonError(404, "EVENT_NOT_FOUND", "找不到可修正的草稿事件");
    const activeRequestId = crypto.randomUUID();
    const { data: acquired, error: acquireError } = await supabase.rpc("acquire_ai_request", { p_request_id: activeRequestId });
    if (acquireError) return jsonError(503, "AI_LOCK_UNAVAILABLE", "目前無法開始語音修正，請稍後重試", true);
    if (acquired !== true) return jsonError(409, "AI_REQUEST_IN_PROGRESS", "已有一個 AI 請求正在處理，請稍候", true);
    try {
      const { data: counted, error: countError } = await supabase.from("calendar_imports").update({ clarification_count: Number(row.clarification_count ?? 0) + 1 }).eq("id", id).eq("user_id", user.id).eq("version", row.version).eq("clarification_count", Number(row.clarification_count ?? 0)).select("id").single();
      if (countError || !counted) return jsonError(409, "VERSION_CONFLICT", "草稿已更新，請重試");
      const context = { title: event.label ?? "", date: event.startDate, startTime: event.startTime, endTime: event.endTime };
      const value = transcript ? { transcript, correction: await parseCalendarCorrection(transcript, context) } : await analyzeCalendarCorrectionVoice(audio as File, context);
      return NextResponse.json({ eventId, version, ...value });
    } finally {
      await supabase.rpc("release_ai_request", { p_request_id: activeRequestId });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "CORRECTION_FAILED";
    if (code === "UNAUTHENTICATED" || code === "AUTH_NOT_CONFIGURED") return jsonError(401, code, "請先登入");
    return jsonError(code.startsWith("NEBIUS") ? 502 : 422, code, "無法解析這段語音修正，請改用手動編輯", code.startsWith("NEBIUS"));
  }
}
