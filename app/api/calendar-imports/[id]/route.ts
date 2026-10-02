import {prepareScreenshotCards} from '@/lib/calendar/screenshot-cards';
import { editDraft, appleDraftPreview } from "@/lib/calendar/draft-events";
import { NextResponse } from "next/server";
import { extractionSchema } from "@/lib/calendar/schemas";
import { buildPreview } from "@/lib/server/calendar-imports";
import { requireUser } from "@/lib/server/auth";
import { decimalVersion, jsonError, nextDecimalVersion } from "@/lib/server/http";
import { validateCells } from "@/lib/calendar/patch";
import { cellKey } from "@/lib/calendar/slots";
import { clarifyExtraction, ImportClarificationError } from "@/lib/calendar/import-clarification";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase.from("calendar_imports").select("id,gathering_id,status,version,extraction,expires_at,updated_at,source_kind").eq("id", id).eq("user_id", user.id).single();
    if (error || !data) return jsonError(404, "IMPORT_NOT_FOUND", "找不到這次匯入");
    if (new Date(data.expires_at).getTime() <= Date.now()) return jsonError(410, "IMPORT_EXPIRED", "這次匯入已過期，請重新上傳");
    return NextResponse.json({ ...data, extraction:data.source_kind==='image'?prepareScreenshotCards(extractionSchema.parse(data.extraction),'Asia/Taipei',true):data.extraction, version: String(data.version) });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { action?: "clarify" | "edit_event" | "add_event" | "apple_preview" | "preview" | "apply"; version?: string; counted?: boolean; answer?: { questionId: string; value: unknown }; eventId?: string; changes?: { title?: string; date?: string; startTime?: string; endTime?: string; delete?: boolean }; range?: { startDate: string; endDate: string }; previewId?: string; selectedKeys?: string[]; selectedChanges?: Array<{ key: string; status: string }>; targetVersion?: string };
    const { data: importRow, error: importError } = await supabase.from("calendar_imports").select("*").eq("id", id).eq("user_id", user.id).single();
    if (importError || !importRow) return jsonError(404, "IMPORT_NOT_FOUND", "找不到這次匯入");
    if (new Date(importRow.expires_at).getTime() <= Date.now()) return jsonError(410, "IMPORT_EXPIRED", "這次匯入已過期");
    if (String(importRow.version) !== String(body.version)) return jsonError(409, "VERSION_CONFLICT", "匯入內容已更新，請重新載入", true);
    if(importRow.source_kind==='image')importRow.extraction=prepareScreenshotCards(extractionSchema.parse(importRow.extraction),'Asia/Taipei',true);
    if (body.action === "apple_preview") {
      const events = appleDraftPreview(extractionSchema.parse(importRow.extraction));
      return NextResponse.json({ events, version: String(importRow.version) });
    }
    if (body.action === "add_event" || body.action === "edit_event") {
      if (importRow.status === "rejected") return jsonError(422, "UNRELATED_INPUT", "沒有偵測到可匯入的行程。");
      const next = editDraft(extractionSchema.parse(importRow.extraction), body.action, body.eventId, body.changes);
      const status = next.events.some(event => event.unresolved.length) || next.questions.length ? "needs_clarification" : "ready";
      const { data, error } = await supabase.from("calendar_imports").update({ extraction: next, status, version: nextDecimalVersion(importRow.version) }).eq("id", id).eq("user_id", user.id).eq("version", importRow.version).select("id,status,version,extraction,expires_at").single();
      if (error || !data) return jsonError(409, "VERSION_CONFLICT", "匯入內容已更新，請重新載入", true);
      return NextResponse.json({ ...data, version: String(data.version) });
    }
    if (body.action === "clarify") {
      if (!body.answer) return jsonError(400, "ANSWER_REQUIRED", "請回答釐清問題");
      if (Number(importRow.clarification_count ?? 0) >= 10) return jsonError(429, "CLARIFICATION_LIMIT", "這次匯入已達釐清次數上限，請改用表單完成", false);
      const extraction = extractionSchema.parse(importRow.extraction);
      const next = clarifyExtraction(extraction, body.answer.questionId, body.answer.value);
      const { data, error } = await supabase.from("calendar_imports").update({ extraction: next, clarification_count: body.counted ? Number(importRow.clarification_count ?? 0) : Number(importRow.clarification_count ?? 0) + 1, status: next.questions.length ? "needs_clarification" : "ready", version: nextDecimalVersion(importRow.version) }).eq("id", id).eq("version", importRow.version).select("id,status,version,extraction,expires_at").single();
      if (error || !data) return jsonError(409, "VERSION_CONFLICT", "匯入內容已更新，請重新載入", true);
      return NextResponse.json({ ...data, version: String(data.version) });
    }
    if (body.action === "preview") {
      if (importRow.status === "rejected") return jsonError(422, "UNRELATED_INPUT", "這批內容沒有可匯入的行事曆資料");
      if (importRow.source_kind === "image" && (importRow.extraction.sources.length === 0 || importRow.extraction.events.length === 0 || importRow.extraction.sources.some((source: { kind: string }) => source.kind !== "calendar"))) return jsonError(422, "CALENDAR_VALIDATION_FAILED", "沒有偵測到可匯入的行程。");
      if (!body.range) return jsonError(400, "PREVIEW_INPUT_REQUIRED", "需要日期範圍");
      const rangeError = validatePreviewRange(body.range, !importRow.gathering_id);
      if (rangeError) return jsonError(422, "RANGE_OUT_OF_BOUNDS", rangeError);
      const targetVersion = decimalVersion(body.targetVersion ?? "0");
      let serverCells: Record<string, string> = {};
      let slotStart: string | undefined;
      let slotEnd: string | undefined;
      if (importRow.gathering_id) {
        const [{ data: draft, error: draftError }, { data: gathering, error: gatheringError }] = await Promise.all([
          supabase.from("availability_drafts").select("cells,version").eq("gathering_id", importRow.gathering_id).eq("user_id", user.id).single(),
          supabase.from("gatherings").select("daily_start,daily_end,date_start,date_end").eq("id", importRow.gathering_id).single(),
        ]);
        if (draftError || !draft) return jsonError(404, "DRAFT_NOT_FOUND", "找不到本局草稿");
        if (gatheringError || !gathering) return jsonError(404, "GATHERING_NOT_FOUND", "找不到飯局");
        if (String(draft.version) !== targetVersion) return jsonError(409, "VERSION_CONFLICT", "草稿已被更新，請重新載入", true);
        if (body.range.startDate < gathering.date_start || body.range.endDate > gathering.date_end) return jsonError(422, "RANGE_OUT_OF_BOUNDS", "預覽範圍需在邀約日期內 / Preview must stay within invitation dates");
        serverCells = validateCells(draft.cells);
        slotStart = String(gathering.daily_start).slice(0, 5);
        slotEnd = String(gathering.daily_end).slice(0, 5);
      } else {
        const [{ data: version }, { data: busyCells, error: busyError }] = await Promise.all([
          supabase.from("personal_calendar_versions").select("version").eq("user_id", user.id).maybeSingle(),
          supabase.from("personal_busy_cells").select("local_date,minute_of_day,status").eq("user_id", user.id).gte("local_date", body.range.startDate).lte("local_date", body.range.endDate),
        ]);
        if (busyError) return jsonError(500, "PERSONAL_CALENDAR_READ_FAILED", "無法讀取個人忙碌", true);
        if (String(version?.version ?? 1) !== targetVersion) return jsonError(409, "VERSION_CONFLICT", "個人忙碌已被更新，請重新載入", true);
        serverCells = Object.fromEntries((busyCells ?? []).map((cell: { local_date: string; minute_of_day: number; status: string }) => [cellKey(cell.local_date, `${String(Math.floor(cell.minute_of_day / 60)).padStart(2, "0")}:${String(cell.minute_of_day % 60).padStart(2, "0")}`), cell.status]));
      }
      const preview = buildPreview(importRow.extraction, { ...body.range, currentCells: serverCells, slotStart, slotEnd });
      if (preview.blockedImport) return jsonError(422, "CALENDAR_VALIDATION_FAILED", "沒有偵測到可匯入的行程。請選擇日期與行程資訊清楚的行事曆截圖。");
      if (preview.blockedReview) return jsonError(422, "REVIEW_REQUIRED", "請先逐筆確認每個辨識項目，或略過不需要加入的項目。");
      const previewId = crypto.randomUUID();
      const expiresAt = new Date(Math.min(new Date(importRow.expires_at).getTime(), Date.now() + 30 * 60_000)).toISOString();
      const { error: previewError } = await supabase.from("calendar_import_previews").insert({
        id: previewId,
        import_id: id,
        user_id: user.id,
        import_version: decimalVersion(importRow.version),
        target_version: targetVersion,
        range_start: body.range.startDate,
        range_end: body.range.endDate,
        changes: preview.changes,
        expires_at: expiresAt,
      });
      if (previewError) return jsonError(500, "PREVIEW_CREATE_FAILED", "無法建立差異預覽", true);
      return NextResponse.json({ importId: id, previewId, version: String(importRow.version), targetVersion, expiresAt, ...preview });
    }
    if (body.action === "apply") {
      if (!body.previewId || !body.selectedChanges?.length) return jsonError(400, "PREVIEW_REQUIRED", "請先建立差異預覽並選擇時段");
      const { data: savedPreview, error: previewError } = await supabase.from("calendar_import_previews").select("*").eq("id", body.previewId).eq("import_id", id).eq("user_id", user.id).single();
      if (previewError || !savedPreview || new Date(savedPreview.expires_at).getTime() <= Date.now()) return jsonError(410, "PREVIEW_EXPIRED", "差異預覽已過期，請重新預覽", true);
      if (String(savedPreview.import_version) !== String(importRow.version)) return jsonError(409, "VERSION_CONFLICT", "匯入內容已更新，請重新預覽", true);
      if (body.targetVersion !== undefined && String(savedPreview.target_version) !== String(body.targetVersion)) return jsonError(409, "VERSION_CONFLICT", "目標資料已更新，請重新預覽", true);
      const previewChanges = new Map((savedPreview.changes as Array<{ key: string; before: string; after: string }>).map((change) => [change.key, change]));
      const selectedChanges = body.selectedChanges;
      if (new Set(selectedChanges.map((change) => change.key)).size !== selectedChanges.length) return jsonError(400, "PREVIEW_SELECTION_INVALID", "套用內容含有重複格子，請重新預覽");
      if (selectedChanges.some((change) => previewChanges.get(change.key)?.after !== change.status)) return jsonError(400, "PREVIEW_SELECTION_INVALID", "套用內容與預覽不一致，請重新預覽");
      const gatheringId = importRow.gathering_id as string | null;
      if (!gatheringId) {
        const changes = selectedChanges.map(({ key, status }) => {
          const match = key.match(/^(\d{4}-\d{2}-\d{2})-(\d{2}):(\d{2})$/);
          if (!match) throw new Error("預覽含有無效格子");
          return { date: match[1], minute: Number(match[2]) * 60 + Number(match[3]), status };
        });
        const { data: nextVersion, error } = await supabase.rpc("apply_personal_busy_cells", { p_expected_version: decimalVersion(savedPreview.target_version), p_changes: changes });
        if (error) return jsonError(error.message.includes("VERSION_CONFLICT") ? 409 : 400, error.message.includes("VERSION_CONFLICT") ? "VERSION_CONFLICT" : "PERSONAL_CALENDAR_UPDATE_FAILED", "個人忙碌已被更新，請重新預覽", true);
        await supabase.from("calendar_import_previews").delete().eq("id", body.previewId).eq("user_id", user.id);
        await supabase.from("calendar_imports").delete().eq("id", id).eq("user_id", user.id);
        return NextResponse.json({ applied: true, version: String(nextVersion) });
      }
      const { data: draft, error: draftError } = await supabase.from("availability_drafts").select("cells,version").eq("gathering_id", gatheringId).eq("user_id", user.id).single();
      if (draftError || !draft) return jsonError(404, "DRAFT_NOT_FOUND", "找不到本局草稿");
      if (String(draft.version) !== String(savedPreview.target_version)) return jsonError(409, "VERSION_CONFLICT", "草稿已被更新，請重新預覽", true);
      const current = validateCells(draft.cells);
      const next = { ...current };
      selectedChanges.forEach(({ key, status }) => { if (status === "unknown") delete next[key]; else next[key] = status as "green" | "yellow" | "red"; });
      const { data: updatedDraft, error } = await supabase.rpc("save_availability_draft", { p_gathering_id: gatheringId, p_version: String(draft.version), p_cells: next });
      if (error || !updatedDraft) return jsonError(409, "DRAFT_UPDATE_FAILED", "草稿已被更新，請重新預覽", true);
      await supabase.from("calendar_import_previews").delete().eq("id", body.previewId).eq("user_id", user.id);
      await supabase.from("calendar_imports").delete().eq("id", id).eq("user_id", user.id);
      return NextResponse.json({ applied: true, cells: next, version: String(updatedDraft.version) });
    }
    return jsonError(400, "ACTION_REQUIRED", "不支援的匯入操作");
  } catch (error) { if (error instanceof ImportClarificationError) return jsonError(error.status, error.code, error.message); return jsonError(422, "IMPORT_INVALID", error instanceof Error ? error.message : "匯入資料無效"); }
}

function validatePreviewRange(range: { startDate: string; endDate: string }, personal: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(range.endDate)) return "日期格式必須為 YYYY-MM-DD";
  const start = Date.parse(`${range.startDate}T00:00:00Z`);
  const end = Date.parse(`${range.endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "日期範圍無效";
  if ((end - start) / 86_400_000 > 366) return "一次最多確認一年內的日期範圍，請縮小後重試";
  if (personal) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const today = `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
    const maxDate = new Date(`${today}T00:00:00Z`);
    maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 1);
    if (range.startDate < today || range.endDate > maxDate.toISOString().slice(0, 10)) return "個人日曆只能確認今天起一年內的日期，請縮小範圍";
  }
  return null;
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try { const { supabase, user } = await requireUser(request); await supabase.from("calendar_imports").delete().eq("id", id).eq("user_id", user.id); return NextResponse.json({ deleted: true }); } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
