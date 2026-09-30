import { NextResponse } from "next/server";
import { extractionSchema } from "@/lib/calendar/schemas";
import { analyzeClarificationVoice } from "@/lib/ai/service";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const form = await request.formData();
    const audio = form.get("audio");
    const questionId = String(form.get("questionId") ?? "");
    const version = String(form.get("version") ?? "");
    if (!(audio instanceof File) || !questionId || !/^\d+$/.test(version)) return jsonError(400, "CLARIFICATION_VOICE_INPUT_REQUIRED", "需要錄音、問題與版本");
    if (audio.size > 10 * 1024 * 1024 || !["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/x-m4a"].includes(audio.type)) return jsonError(415, "AUDIO_INVALID", "錄音格式或大小不符合限制");
    const { data: importRow, error } = await supabase.from("calendar_imports").select("version,extraction,clarification_count,expires_at").eq("id", id).eq("user_id", user.id).single();
    if (error || !importRow) return jsonError(404, "IMPORT_NOT_FOUND", "找不到這次匯入");
    if (new Date(importRow.expires_at).getTime() <= Date.now()) return jsonError(410, "IMPORT_EXPIRED", "這次匯入已過期，請重新上傳");
    if (String(importRow.version) !== version) return jsonError(409, "VERSION_CONFLICT", "匯入內容已更新，請重新載入", true);
    const extraction = extractionSchema.parse(importRow.extraction);
    if (Number(importRow.clarification_count ?? 0) >= 10) return jsonError(429, "CLARIFICATION_LIMIT", "這次匯入已達釐清次數上限，請改用表單完成", false);
    const question = extraction.questions.find((item) => item.id === questionId);
    if (!question) return jsonError(400, "QUESTION_NOT_FOUND", "找不到這個釐清問題");
    const activeRequestId = crypto.randomUUID();
    const { data: acquired, error: acquireError } = await supabase.rpc("acquire_ai_request", { p_request_id: activeRequestId });
    if (acquireError) return jsonError(503, "AI_LOCK_UNAVAILABLE", "目前無法開始語音釐清，請稍後重試", true);
    if (acquired !== true) return jsonError(409, "AI_REQUEST_IN_PROGRESS", "已有一個 AI 請求正在處理，請稍候", true);
    try {
      const { data: counted, error: countError } = await supabase.from("calendar_imports").update({ clarification_count: Number(importRow.clarification_count ?? 0) + 1 }).eq("id", id).eq("user_id", user.id).eq("version", importRow.version).select("id").single();
      if (countError || !counted) return jsonError(409, "VERSION_CONFLICT", "匯入內容已更新，請重新載入", true);
      const value = await analyzeClarificationVoice(audio, question);
      return NextResponse.json({ questionId, value, version });
    } finally {
      await supabase.rpc("release_ai_request", { p_request_id: activeRequestId });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "CLARIFICATION_VOICE_FAILED";
    return jsonError(code.startsWith("NEBIUS") ? 502 : 422, code, "無法解析這段釐清語音，請改用文字回答", code.startsWith("NEBIUS"));
  }
}
