import { extractionSchema } from "@/lib/calendar/schemas";
import { dateList, patchFromEvents, timeList } from "@/lib/calendar/slots";
import { validateCells } from "@/lib/calendar/patch";

export function buildPreview(extraction: unknown, input: { startDate: string; endDate: string; currentCells: unknown; slotStart?: string; slotEnd?: string }) {
  const parsed = extractionSchema.parse(extraction);
  const current = validateCells(input.currentCells);
  const acceptedSourceIds = new Set(parsed.sources.filter((source) => source.kind === "calendar" || source.kind === "schedule_voice").map((source) => source.id));
  // Unrelated or uncertain content cannot be used to change availability.
  const hasUntrustedSource = parsed.sources.length === 0 || parsed.sources.some((source) => source.kind !== "calendar" && source.kind !== "schedule_voice");
  const blocksBlankFill = parsed.events.some((event) => {
    if (event.intent === "reminder" || event.intent === "uncertain" || event.unresolved.length > 0) return true;
    return !event.startDate || !event.endDate || (!event.allDay && (!event.startTime || !event.endTime));
  });
  const blockedReview = parsed.events.length === 0 || parsed.questions.length > 0 || parsed.events.some((event) => event.userConfirmed !== true);
  const hasOutOfRangeEvent = parsed.events.some((event) => {
    return event.sourceIds.length === 0 || event.sourceIds.some((sourceId) => !acceptedSourceIds.has(sourceId));
  });
  const blocked = hasUntrustedSource || hasOutOfRangeEvent;
  // Missing events are not evidence of availability. Preserve blank cells.
  const next = blocked || blockedReview ? current : patchFromEvents(parsed.events.filter((event) => event.unresolved.length === 0 && event.userConfirmed === true && event.intent !== "uncertain" && event.intent !== "reminder"), { startDate: input.startDate, endDate: input.endDate }, current, false, input.slotStart, input.slotEnd);
  const allowed = input.slotStart && input.slotEnd ? new Set(dateList(input.startDate, input.endDate).flatMap((date) => timeList(input.slotStart!, input.slotEnd!).map((time) => `${date}-${time}`))) : null;
  const changes = Object.keys(next).filter((key) => (!allowed || allowed.has(key)) && (current[key] ?? "unknown") !== (next[key] ?? "unknown")).map((key) => ({ key, before: current[key] ?? "unknown", after: next[key] ?? "unknown" }));
  return { changes, blockedBlankFill: blocksBlankFill, blockedReview, blockedImport: blocked, extraction: parsed };
}
