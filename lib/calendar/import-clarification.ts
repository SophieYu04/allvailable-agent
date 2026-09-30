import type { Extraction } from './schemas';
import { ensureImportQuestions } from './import-questions';

export class ImportClarificationError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

// Shared by the authenticated API and the development-only synthetic workflow.
export function clarifyExtraction(extraction: Extraction, questionId: string, answerValue: unknown): Extraction {
  const question = extraction.questions.find((item) => item.id === questionId);
  if (!question) throw new ImportClarificationError(400, "QUESTION_NOT_FOUND", "找不到這個釐清問題");

  if (question.kind === "title" && (typeof answerValue !== "string" || !answerValue.trim() || answerValue.trim().length > 200)) throw new ImportClarificationError(422, "ANSWER_INVALID", "請提供最多 200 字的事項名稱");
  if (question.kind === "date" && (typeof answerValue !== "string" || !validDate(answerValue))) throw new ImportClarificationError(422, "ANSWER_INVALID", "請輸入有效日期 YYYY-MM-DD");
  if (question.kind === "time") {
    const match = typeof answerValue === "string" ? answerValue.match(/^(\d{1,2}:\d{2})\s*(?:-|到|至)\s*(\d{1,2}:\d{2})$/) : null;
    const value = answerValue && typeof answerValue === "object" ? answerValue as Record<string, unknown> : null;
    const start = match?.[1].padStart(5,"0") ?? value?.startTime;
    const end = match?.[2].padStart(5,"0") ?? value?.endTime;
    if (typeof start !== "string" || typeof end !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start === end) throw new ImportClarificationError(422, "ANSWER_INVALID", "請提供有效且不同的開始及結束時間");
    if (value && [value.startDate, value.endDate].some(d => d !== undefined && (typeof d !== "string" || !validDate(d)))) throw new ImportClarificationError(422, "ANSWER_INVALID", "日期無效");
  }
  const events = extraction.events.map((event) => {
    if (event.id !== question.eventId) return event;
    const value = answerValue;
    if (question.kind === "title" && typeof value === "string") return { ...event, label: value.trim(), unresolved: event.unresolved.filter((item) => item !== "title") };
    if (question.kind === "date" && typeof value === "string") return { ...event, startDate: value, endDate: value, unresolved: event.unresolved.filter((item) => item !== "date") };
    if (question.kind === "time" && typeof value === "string") { const match = value.match(/(\d{1,2}:\d{2})\s*(?:-|到|至)\s*(\d{1,2}:\d{2})/); if (!match) return event; return { ...event, startTime: match[1].padStart(5, "0"), endTime: match[2].padStart(5, "0"), unresolved: event.unresolved.filter((item) => item !== "time") }; }
    if (question.kind === "time" && value && typeof value === "object") { const answer = value as { startTime?: string; endTime?: string; startDate?: string; endDate?: string }; return { ...event, startTime: answer.startTime ?? event.startTime, endTime: answer.endTime ?? event.endTime, startDate: answer.startDate ?? event.startDate, endDate: answer.endDate ?? event.endDate, unresolved: event.unresolved.filter((item) => item !== "time") }; }
    if (question.kind === "all_day" && typeof value === "string") {
      if ((value === "提醒不占時間" || value === "只是提醒不占時間")) return { ...event, intent: "reminder" as const, allDay: true, unresolved: [] };
      if (value === "真的全天不能") return { ...event, intent: "busy" as const, allDay: true, unresolved: [] };
      if (value === "指定起訖") return { ...event, allDay: false, unresolved: [...new Set([...event.unresolved.filter(item => item !== 'all_day'), "time"])] };
      return { ...event, allDay: true, unresolved: ["all_day"] };
    }
    if (question.kind === "intent" && typeof value === "string") return { ...event, intent: value.includes("可能") ? "tentative" as const : value.includes("可以") ? "available" as const : "busy" as const, unresolved: event.unresolved.filter((item) => item !== "intent") };
    if (question.kind === "timezone" && typeof value === "string") {
      const timezone = /^(是|台灣|台北|Taiwan|Taipei)/i.test(value.trim()) ? "Asia/Taipei" : value.trim();
      if (!isValidTimezone(timezone)) return { ...event, sourceTimezone: null, unresolved: [...new Set([...event.unresolved, "timezone"])] };
      return { ...event, sourceTimezone: timezone, unresolved: event.unresolved.filter((item) => item !== "timezone") };
    }
    return event;
  });
  const questions = extraction.questions.filter((item) => item.id !== question.id);
  if (question.kind === "timezone" && events.some((event) => event.id === question.eventId && event.sourceTimezone === null)) questions.push({ id: `${question.eventId}-timezone`, eventId: question.eventId, kind: "timezone", prompt: "請輸入有效的時區，例如 Asia/Taipei 或 America/New_York" });
  if (question.kind === "all_day" && answerValue === "指定起訖" && question.eventId) questions.push({ id: `${question.eventId}-time`, eventId: question.eventId, kind: "time", prompt: "請指定開始與結束時間（例如 18:00-20:00）" });
  return ensureImportQuestions({ ...extraction, events, questions });
}

function validDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}

function isValidTimezone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}
