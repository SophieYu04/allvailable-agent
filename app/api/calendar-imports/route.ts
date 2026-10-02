import {geometrySchema} from '@/lib/calendar/image-geometry';
import {z} from 'zod';
import {prepareScreenshotCards} from '@/lib/calendar/screenshot-cards';
import {extractionSchema} from '@/lib/calendar/schemas';
import {eventFingerprint} from '@/lib/calendar/live-voice';
import { NextResponse } from "next/server";
import { extractTimeTree, ocrSchema } from "@/lib/ai/timetree";
import { workersAudioBinding } from "@/lib/ai/cloudflare-audio";
import { providerConfig } from "@/lib/ai/config";
import { analyzeImport } from "@/lib/ai/service";
import { requireUser } from "@/lib/server/auth";
import { jsonError, requestId } from "@/lib/server/http";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxImageBytes = 5 * 1024 * 1024;
const maxAudioBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const id = requestId(request);
  let auth: Awaited<ReturnType<typeof requireUser>>;
  try { auth = await requireUser(request); } catch (error) { return jsonError(error instanceof Error && error.message === "AUTH_NOT_CONFIGURED" ? 503 : 401, error instanceof Error ? error.message : "UNAUTHENTICATED", "請先登入後再使用匯入功能", false, id); }
  if (process.env.AI_IMPORT_ENABLED !== "true") return jsonError(503, "AI_DISABLED", "AI 匯入目前未開放", false, id);
  const form = await request.formData();
  const images = form.getAll("images").filter((value): value is File => value instanceof File);
  const liveTranscript = form.get('mode') === 'live_voice' ? String(form.get('transcript') ?? '').trim() : '';
  if(form.get('mode')==='live_voice'&&(!liveTranscript||liveTranscript.length>8000||images.length))return jsonError(400,'TRANSCRIPT_INVALID','逐字稿需為 1–8000 字，且不可混合圖片');
  let imageGeometry:Array<import('@/lib/calendar/image-geometry').CalendarGeometry|null>=[];
  try{imageGeometry=z.array(geometrySchema.nullable()).max(5).parse(JSON.parse(String(form.get('imageGeometry')??'[]')));}catch{return jsonError(400,'IMAGE_GEOMETRY_INVALID','圖片版面資料無效，請重新上傳');}
  const audioValue = form.get("audio");
  const audio = audioValue instanceof File ? audioValue : undefined;
  if (images.length > 5) return jsonError(413, "TOO_MANY_IMAGES", "一次最多上傳 5 張圖片", false, id);
  if (!images.length && !audio && !liveTranscript) return jsonError(400, "IMPORT_INPUT_REQUIRED", "請上傳行事曆圖片或錄音", false, id);
  if (images.some((file) => !imageTypes.has(file.type) || file.size > maxImageBytes) || images.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) return jsonError(415, "IMAGE_INVALID", "圖片格式或大小不符合限制", false, id);
  if (audio && (audio.size > maxAudioBytes || !["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/x-m4a"].includes(audio.type.split(";")[0]))) return jsonError(415, "AUDIO_INVALID", "錄音格式或大小不符合限制", false, id);
  const imageBytes = await Promise.all(images.map(async (file) => Buffer.from(await file.arrayBuffer())));
  if (imageBytes.some((bytes, index) => !matchesImageSignature(bytes, images[index].type) || isAnimatedImage(bytes, images[index].type))) return jsonError(415, "IMAGE_INVALID", "圖片內容無法驗證或包含動態影格", false, id);
  const gatheringId = String(form.get("gatheringId") ?? "");
  let imageContext:{timezone:string;dateStart?:string;dateEnd?:string}={timezone:'Asia/Taipei'};
  if (gatheringId) {
    const {data: membership, error: membershipError} = await auth.supabase.from("memberships").select("user_id").eq("gathering_id", gatheringId).eq("user_id", auth.user.id).eq("status", "joined").maybeSingle();
    if (membershipError || !membership) return jsonError(403, "MEMBERSHIP_REQUIRED", "請先加入邀約 / Join this invitation before importing", false, id);
    if(images.length){const {data:gathering}=await auth.supabase.from('gatherings').select('date_start,date_end').eq('id',gatheringId).single();if(gathering)imageContext={timezone:'Asia/Taipei',dateStart:gathering.date_start,dateEnd:gathering.date_end};}
  }
  try {
    if (images.length && form.get("mode") !== "timetree") providerConfig("vision");
    else { providerConfig("text"); if (audio && !(await workersAudioBinding())) providerConfig("audio"); }
  } catch (error) {
    const code = error instanceof Error ? error.message : "NEBIUS_NOT_CONFIGURED";
    return jsonError(503, code.endsWith("NOT_CONFIGURED") ? code : "NEBIUS_INVALID_ENDPOINT", "此輸入的 AI 模型尚未設定 / This AI input is not configured. Please use manual entry.", false, id);
  }
  const quotaKey = request.headers.get("Idempotency-Key") ?? id;
  const { data: quota, error: quotaError } = await auth.supabase.rpc("consume_ai_quota", { p_idempotency_key: quotaKey, p_user_limit: Number(process.env.AI_DAILY_USER_LIMIT ?? 3), p_global_limit: Number(process.env.AI_DAILY_GLOBAL_LIMIT ?? 30) });
  if (quotaError) return jsonError(503, "QUOTA_UNAVAILABLE", "目前無法確認 AI 用量，請稍後重試", true, id);
  if (!(quota as { allowed?: boolean } | null)?.allowed) return jsonError(429, "AI_QUOTA_EXCEEDED", "今日 AI 匯入次數已用完，請改用手動填寫", false, id);
  if ((quota as { replayed?: boolean } | null)?.replayed) {
    const { data: existing } = await auth.supabase.from("calendar_imports").select("id,status,version,extraction,expires_at").eq("user_id", auth.user.id).eq("idempotency_key", quotaKey).single();
    if (existing) return NextResponse.json({ importId: existing.id, status: existing.status, version: String(existing.version), extraction: existing.extraction, expiresAt: existing.expires_at, requestId: id, replayed: true });
  }
  const activeRequestId = crypto.randomUUID();
  const { data: acquired, error: acquireError } = await auth.supabase.rpc("acquire_ai_request", { p_request_id: activeRequestId });
  if (acquireError) return jsonError(503, "AI_LOCK_UNAVAILABLE", "目前無法開始 AI 匯入，請稍後重試", true, id);
  if (acquired !== true) return jsonError(409, "AI_REQUEST_IN_PROGRESS", "已有一個 AI 匯入正在處理，請稍候", true, id);
  try {
    const isTimeTree = form.get("mode") === "timetree";
    if (isTimeTree && images.length !== 1) return jsonError(400, "ONE_SCREENSHOT_REQUIRED", "請一次選擇一張 TimeTree 截圖");
    let extraction = isTimeTree ? await extractTimeTree(ocrSchema.parse(JSON.parse(String(form.get("ocr") ?? "[]"))), crypto.randomUUID()) : await analyzeImport({ sourceId: crypto.randomUUID(), images: images.length ? images.map((file, index) => ({ id: crypto.randomUUID(),geometry:imageGeometry[index], dataUrl: `data:${file.type};base64,${imageBytes[index].toString("base64")}` })) : undefined, audio, imageContext, transcript: liveTranscript || undefined });
    if(liveTranscript)extraction={...extraction,liveVoice:{startedAt:Date.now(),calls:1,closed:false,seen:extraction.events.map(eventFingerprint)}};
    const hasUntrustedImage = images.length > 0 && (extraction.sources.length !== images.length || extraction.sources.some((source) => source.kind !== "calendar"));
    const status = liveTranscript ? (extraction.questions.length?'needs_clarification':'ready') : extraction.screenshotValidation?.category === "possible" ? "needs_clarification" : hasUntrustedImage || extraction.sources.length === 0 || extraction.events.length === 0 || extraction.sources.every((source) => source.kind === "unrelated")
      ? "rejected"
      : extraction.questions.length ? "needs_clarification" : "ready";
    const { data, error } = await auth.supabase.from("calendar_imports").insert({ user_id: auth.user.id, gathering_id: gatheringId || null, source_kind: images.length ? "image" : "voice", status, extraction, version: 1, idempotency_key: quotaKey, expires_at: new Date(Date.now() + Number(process.env.AI_IMPORT_TTL_HOURS ?? 24) * 3600_000).toISOString() }).select("id,status,version,extraction,expires_at").single();
    if (error) return jsonError(500, "IMPORT_SAVE_FAILED", "匯入結果暫存失敗", true, id);
    return NextResponse.json({ importId: data.id, status: data.status, version: String(data.version), extraction: data.extraction, expiresAt: data.expires_at, requestId: id });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_FAILED";
    return jsonError(code.endsWith("NOT_CONFIGURED") ? 503 : (code.startsWith("NEBIUS") || code.startsWith("CLOUDFLARE_AUDIO")) ? 502 : 422, (code.startsWith("NEBIUS") || code.startsWith("CLOUDFLARE_AUDIO") || code === "AUDIO_NO_SPEECH") ? code : "AI_INVALID_RESPONSE", code.endsWith("NOT_CONFIGURED") ? "此輸入的 AI 模型尚未設定，請先手動填寫。 / This AI input is not configured. Please use manual entry." : "辨識失敗，輸入已保留，可重試或手動填寫。 / Recognition failed. Retry or use manual entry.", !code.endsWith("NOT_CONFIGURED"), id);
  } finally {
    await auth.supabase.rpc("release_ai_request", { p_request_id: activeRequestId });
  }
}

function matchesImageSignature(bytes: Buffer, type: string) {
  if (type === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function isAnimatedImage(bytes: Buffer, type: string) {
  if (type === "image/png") return bytes.includes(Buffer.from("acTL"));
  if (type === "image/webp") return bytes.includes(Buffer.from("ANIM"));
  return false;
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase.from("calendar_imports").select("id,gathering_id,status,version,extraction,expires_at,updated_at,idempotency_key,source_kind").eq("user_id", user.id).gt("expires_at", new Date().toISOString()).order("updated_at", { ascending: false });
    if (error) return jsonError(500, "IMPORT_LIST_FAILED", "無法讀取待恢復匯入", true);
    const audio = [process.env.NEBIUS_AUDIO_API_KEY, process.env.NEBIUS_AUDIO_BASE_URL, process.env.NEBIUS_AUDIO_MODEL];
    return NextResponse.json({ imports: (data??[]).map(item=>({...item,extraction:item.source_kind==='image'?prepareScreenshotCards(extractionSchema.parse(item.extraction),'Asia/Taipei',true):item.extraction})), webAudioAvailable: process.env.AI_IMPORT_ENABLED === "true" && (Boolean(await workersAudioBinding()) || audio.every(Boolean)) });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
