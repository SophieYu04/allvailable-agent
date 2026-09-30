import { z } from "zod";
import { coordinationDraftSchema, proposeCoordination, validateProposal } from "./coordination";
import { gatheringInputSchema } from "@/lib/server/gatherings";
import { cellKey, dateList, minutes, timeList } from "@/lib/calendar/slots";
import { candidateSummary } from "@/lib/calendar/candidate-status";
import { scoreCandidates } from "@/lib/scoring";

const participantSchema = z.object({
  id: z.string().min(1).max(80),
  submitted: z.boolean(),
  cells: z.record(z.enum(["unknown", "green", "yellow", "red"]))
    .refine((cells) => Object.keys(cells).length <= 672, "At most 14 days of half-hour cells"),
});
export const planningAgentInputSchema = z.object({
  request: z.string().trim().min(1).max(6000),
  existing: coordinationDraftSchema.nullable().optional(),
  participants: z.array(participantSchema).max(10).default([]),
}).superRefine(({ participants }, ctx) => {
  if (new Set(participants.map((person) => person.id)).size !== participants.length) {
    ctx.addIssue({ code: "custom", path: ["participants"], message: "Participant IDs must be unique" });
  }
});

type Parser = typeof proposeCoordination;

/** One bounded model call, followed by local tools. Returns proposals only; no writes or bookings. */
export async function runPlanningAgent(raw: unknown, parse: Parser = proposeCoordination) {
  const input = planningAgentInputSchema.parse(raw);
  // Availability is deliberately excluded from the model request.
  const parsed = await parse(input.request, input.existing ?? null);
  // Re-validate even injected parsers and never trust model-provided questions.
  const proposal = validateProposal(parsed.input);
  const base = { proposal: proposal.input, requiresConfirmation: true as const, timeZone: "Asia/Taipei" as const };
  if (proposal.questions.length) {
    return { ...base, status: "needs_clarification" as const, questions: proposal.questions, candidates: [] };
  }
  const gathering = gatheringInputSchema.parse(proposal.input);
  const missing = input.participants.filter((person) => !person.submitted).length;
  if (!input.participants.length || missing) {
    return { ...base, status: "waiting_for_availability" as const, questions: [], candidates: [],
      expectedParticipants: input.participants.length, missingSubmissions: missing,
      message: input.participants.length ? `還有 ${missing} 人尚未提交空檔。` : "請先加入參與者並收集已確認的空檔。" };
  }
  const cellsByCandidate: Record<string, string[]> = {};
  const candidates = dateList(gathering.dateStart, gathering.dateEnd, 14).flatMap((date) =>
    timeList(gathering.dailyStart, gathering.dailyEnd).flatMap((start) => {
      const endMinute = minutes(start) + gathering.duration;
      if (endMinute > minutes(gathering.dailyEnd)) return [];
      const end = `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
      const id = `${date}-${start}`;
      cellsByCandidate[id] = timeList(start, end).map((time) => cellKey(date, time));
      return [{ id, startsAt: `${date}T${start}:00+08:00`, endsAt: new Date(new Date(`${date}T${start}:00+08:00`).getTime() + gathering.duration * 60000).toISOString() }];
    }));
  const ranked = scoreCandidates(candidates, input.participants.map((person) => ({
    participantId: person.id, active: true, submitted: person.submitted, isPriority: false,
    statuses: person.cells,
    slots: Object.fromEntries(Object.entries(person.cells).map(([key, value]) => [key, value === "green" ? 2 : value === "yellow" ? 1 : 0])),
  })), cellsByCandidate);
  const common = ranked.filter((candidate) => candidateSummary(candidate.participantScores, input.participants.length).common)
    .slice(0, 3).map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt, availableCount: input.participants.length }));
  return { ...base, status: common.length ? "ready_for_review" as const : "no_common_time" as const,
    questions: [], candidates: common,
    message: common.length ? "請確認候選時間後，再建立邀約。" : "目前沒有所有人已確認可出席的完整時段；請調整範圍或重新收集空檔。" };
}
