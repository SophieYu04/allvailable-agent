import { NextResponse } from "next/server";

import { parseIcs, type IcsPreviewEvent } from "@/lib/server/ics";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { action?: unknown; sourceId?: unknown; ics?: unknown; previewId?: unknown };
    if (body.action === "preview") {
      if (typeof body.sourceId !== "string" || typeof body.ics !== "string") return jsonError(400, "ICS_INPUT_REQUIRED", "需要 ICS 檔案與來源");
      const { data: source } = await supabase.from("calendar_sources").select("id,provider").eq("id", body.sourceId).eq("user_id", user.id).single();
      if (!source || (source.provider !== "ics" && source.provider !== "manual")) return jsonError(403, "ICS_SOURCE_INVALID", "此來源不能匯入 ICS");
      const parsed = parseIcs(body.ics);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      const { data, error } = await supabase.from("ics_import_previews").insert({ user_id: user.id, source_id: body.sourceId, events: parsed.events, questions: parsed.questions, expires_at: expiresAt }).select("id,events,questions,expires_at").single();
      if (error || !data) return jsonError(500, "ICS_PREVIEW_FAILED", "無法建立 ICS 預覽", true);
      return NextResponse.json({ previewId: data.id, events: data.events, questions: data.questions, expiresAt: data.expires_at });
    }
    if (body.action === "apply") {
      if (typeof body.previewId !== "string") return jsonError(400, "ICS_PREVIEW_REQUIRED", "請先建立 ICS 預覽");
      const { data: preview, error } = await supabase.from("ics_import_previews").select("id,source_id,events,questions,expires_at").eq("id", body.previewId).eq("user_id", user.id).single();
      if (error || !preview) return jsonError(404, "ICS_PREVIEW_NOT_FOUND", "找不到 ICS 預覽");
      if (new Date(preview.expires_at).getTime() <= Date.now()) return jsonError(410, "ICS_PREVIEW_EXPIRED", "ICS 預覽已過期，請重新匯入");
      const questions = Array.isArray(preview.questions) ? preview.questions : [];
      if (questions.length) return jsonError(409, "ICS_NEEDS_CLARIFICATION", "請先完成 ICS 釐清問題");
      const events = (Array.isArray(preview.events) ? preview.events : []) as IcsPreviewEvent[];
      const rows = events.map((event) => ({ user_id: user.id, source_id: preview.source_id, title: event.title.slice(0, 200), color: "sage", all_day: event.allDay, start_at: event.allDay ? null : event.startAt, end_at: event.allDay ? null : event.endAt, start_date: event.allDay ? event.startDate : null, end_date_exclusive: event.allDay ? event.endDateExclusive : null, time_zone: event.timeZone, idempotency_key: `ics:${preview.id}:${event.uid}` }));
      if (rows.length) {
        const { error: insertError } = await supabase.from("calendar_events").upsert(rows, { onConflict: "user_id,idempotency_key" });
        if (insertError) return jsonError(500, "ICS_APPLY_FAILED", "無法套用 ICS 事件", true);
      }
      await supabase.from("ics_import_previews").delete().eq("id", preview.id).eq("user_id", user.id);
      return NextResponse.json({ applied: true, count: rows.length });
    }
    return jsonError(400, "ICS_ACTION_REQUIRED", "不支援的 ICS 操作");
  } catch (error) {
    const code = error instanceof Error ? error.message : "ICS_INVALID";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : 422, code, code === "UNAUTHENTICATED" ? "請先登入" : "ICS 檔案無法解析");
  }
}
