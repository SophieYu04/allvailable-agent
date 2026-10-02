import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { jsonError } from "@/lib/server/http";
import { proposeCoordination } from "@/lib/ai/coordination";
import { transcribeAudio } from "@/lib/ai/openai";

const inputSchema = z.object({ text: z.string().max(6000), requestKey: z.string().uuid(), gatheringId: z.string().uuid().optional() });
export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    const { supabase, user } = await requireUser(request);
    const acquire = async () => {
      const requestId = crypto.randomUUID();
      const { data, error } = await supabase.rpc("acquire_ai_request", { p_request_id: requestId });
      if (error || data !== true) return false;
      release = async () => { await supabase.rpc("release_ai_request", { p_request_id: requestId }); };
      return true;
    };
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      const audio = form.get('audio');
      if (process.env.AI_IMPORT_ENABLED !== 'true') return jsonError(503, 'AI_DISABLED', 'AI 尚未開放');
      if (!(audio instanceof File) || audio.size === 0 || audio.size > 10 * 1024 * 1024 || !["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/x-m4a"].includes(audio.type)) return jsonError(400, 'AUDIO_INVALID', '錄音格式或大小無效');
      const key = z.string().uuid().parse(form.get('requestKey'));
      const admin = getSupabaseAdminClient();
      if (!admin) return jsonError(503, 'AI_STORAGE_UNAVAILABLE', 'AI 暫存尚未設定');
      const replayTranscript = () => supabase.from('coordination_transcripts').select('transcript,expires_at').eq('user_id',user.id).eq('request_key',key).maybeSingle();
      const { data: saved } = await replayTranscript();
      if (saved && new Date(saved.expires_at).getTime() > Date.now()) return NextResponse.json({ transcript: saved.transcript });
      const { data: quota, error } = await supabase.rpc('consume_ai_quota', { p_idempotency_key: key, p_user_limit: Number(process.env.AI_DAILY_USER_LIMIT ?? 3), p_global_limit: Number(process.env.AI_DAILY_GLOBAL_LIMIT ?? 120) });
      if (error || !quota?.allowed) return jsonError(429, 'AI_QUOTA_EXCEEDED', 'AI 額度已用完，請用文字輸入');
      if (!await acquire()) return jsonError(409, "AI_REQUEST_IN_PROGRESS", "已有 AI 請求處理中，請稍候重試", true);
      const { data: completed } = await replayTranscript();
      if (completed && new Date(completed.expires_at).getTime() > Date.now()) return NextResponse.json({ transcript: completed.transcript });
      const transcript = await transcribeAudio(audio);
      const { error: saveError } = await admin.from('coordination_transcripts').upsert({user_id:user.id,request_key:key,transcript,expires_at:new Date(Date.now()+86400000).toISOString()});
      if (saveError) return jsonError(503, 'TRANSCRIPT_SAVE_FAILED', '辨識結果保存失敗，請重試', true);
      return NextResponse.json({ transcript });
    }
    const body = await request.json() as { action?: string; proposalId?: string };
    if (body.action === 'apply') {
      const id = z.string().uuid().parse(body.proposalId);
      const { data, error } = await supabase.rpc('apply_coordination_proposal', { p_id: id });
      if (error) return jsonError(409, 'PROPOSAL_APPLY_FAILED', '邀約版本或截止已改變，請重新預覽', true);
      return NextResponse.json({ gathering: data });
    }
    if (process.env.AI_IMPORT_ENABLED !== 'true') return jsonError(503, 'AI_DISABLED', 'AI 尚未開放，請改用手動建立');
    const input = inputSchema.parse(body);
    if (!input.text.trim()) return jsonError(400, 'TEXT_REQUIRED', '請描述邀約需求');
    const admin = getSupabaseAdminClient();
    if (!admin) return jsonError(503, 'AI_STORAGE_UNAVAILABLE', 'AI 暫存尚未設定');
    const { data: replay } = await supabase.from('coordination_proposals').select('*').eq('user_id', user.id).eq('request_key', input.requestKey).maybeSingle();
    if (replay) return NextResponse.json({ before: replay.before_input, affectedSubmissions: replay.affected_submissions, proposal: { ...replay, base_revision: replay.base_revision == null ? null : String(replay.base_revision) } });
    let existing = null; let revision: string | null = null;
    if (input.gatheringId) {
      const { data: g } = await supabase.from('gatherings').select('host_id,name,date_start,date_end,daily_start,daily_end,duration_minutes,deadline_at,status,revision').eq('id', input.gatheringId).single();
      if (!g || g.host_id !== user.id) return jsonError(403, 'HOST_REQUIRED', '只有主揪能調整邀約');
      if (['finalized','cancelled'].includes(g.status) || new Date(g.deadline_at).getTime() <= Date.now()) return jsonError(409, 'GATHERING_LOCKED', '邀約已鎖定');
      revision = String(g.revision);
      existing = { name: g.name, dateStart: g.date_start, dateEnd: g.date_end, dailyStart: String(g.daily_start).slice(0,5), dailyEnd: String(g.daily_end).slice(0,5), duration: g.duration_minutes, deadline: g.deadline_at };
    }
    const { data: quota, error: quotaError } = await supabase.rpc('consume_ai_quota', { p_idempotency_key: input.requestKey, p_user_limit: Number(process.env.AI_DAILY_USER_LIMIT ?? 3), p_global_limit: Number(process.env.AI_DAILY_GLOBAL_LIMIT ?? 120) });
    if (quotaError || !quota?.allowed) return jsonError(429, 'AI_QUOTA_EXCEEDED', 'AI 額度已用完，請改用手動操作');
    if (!await acquire()) return jsonError(409, "AI_REQUEST_IN_PROGRESS", "已有 AI 請求處理中，請稍候重試", true);
    const { data: finished } = await supabase.from("coordination_proposals").select("*").eq("user_id", user.id).eq("request_key", input.requestKey).maybeSingle();
    if (finished) return NextResponse.json({ affectedSubmissions: finished.affected_submissions, proposal: { ...finished, base_revision: finished.base_revision == null ? null : String(finished.base_revision) }, before: finished.before_input });
    const proposal = await proposeCoordination(input.text, existing);
    const geometryChanged = existing && ['dateStart','dateEnd','dailyStart','dailyEnd','duration'].some(key => existing[key as keyof typeof existing] !== proposal.input[key as keyof typeof proposal.input]);
    let affectedSubmissions = 0;
    if (geometryChanged && input.gatheringId) {
      const { count, error } = await supabase.from('availability_submissions').select('user_id', {count:'exact',head:true}).eq('gathering_id',input.gatheringId);
      if (error) return jsonError(503, 'PROPOSAL_CONTEXT_FAILED', '無法確認受影響提交，請重試', true);
      affectedSubmissions = count ?? 0;
    }
    const { data, error } = await admin.from('coordination_proposals').insert({ user_id: user.id, request_key: input.requestKey, gathering_id: input.gatheringId ?? null, base_revision: revision, before_input: existing, affected_submissions: affectedSubmissions, ...proposal }).select('*').single();
    if (error) {
      const { data: concurrent } = await supabase.from('coordination_proposals').select('*').eq('request_key', input.requestKey).eq('user_id', user.id).maybeSingle();
      if (concurrent) return NextResponse.json({ affectedSubmissions: concurrent.affected_submissions, proposal: { ...concurrent, base_revision: concurrent.base_revision == null ? null : String(concurrent.base_revision) }, before: concurrent.before_input });
      return jsonError(500, 'PROPOSAL_SAVE_FAILED', '預覽保存失敗，請重試', true);
    }
    return NextResponse.json({ affectedSubmissions, proposal: { ...data, base_revision: data.base_revision == null ? null : String(data.base_revision) }, before: existing });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === 'UNAUTHENTICATED';
    return jsonError(unauthenticated ? 401 : error instanceof z.ZodError ? 422 : 502, unauthenticated ? 'UNAUTHENTICATED' : 'PROPOSAL_FAILED', unauthenticated ? '請先登入' : '無法完成解析，輸入已保留；請補充條件或改用手動操作', true);
  } finally {
    await release?.();
  }
}
