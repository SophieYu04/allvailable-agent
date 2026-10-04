import { z } from "zod";
import type { Cells } from "@/lib/calendar/types";

export const gatheringInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  dailyEnd: z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/),
  duration: z.number().int().min(30).max(240).multipleOf(30).default(30),
  deadline: z.string().datetime({ offset: true }),
  saveAsDraft: z.boolean().default(false),
  hostParticipates: z.boolean().default(true),
  conditionsPublic: z.boolean().default(false),
  priorityIds: z.array(z.string().uuid()).max(10).default([]),
  recommendationCount: z.number().int().min(1).max(3).default(3),
}).superRefine((value, ctx) => {
  if (value.dateEnd < value.dateStart) ctx.addIssue({ code: "custom", path: ["dateEnd"], message: "結束日期不能早於開始日期" });
  const start = new Date(`${value.dateStart}T00:00:00Z`);
  const end = new Date(`${value.dateEnd}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== value.dateStart) {
    ctx.addIssue({ code: "custom", path: ["dateStart"], message: "開始日期無效" });
  }
  if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== value.dateEnd) {
    ctx.addIssue({ code: "custom", path: ["dateEnd"], message: "結束日期無效" });
  }
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end.getTime() - start.getTime() > 13 * 86_400_000) {
    ctx.addIssue({ code: "custom", path: ["dateEnd"], message: "日期範圍最多 14 天" });
  }
  if (value.dailyEnd <= value.dailyStart) ctx.addIssue({ code: "custom", path: ["dailyEnd"], message: "每天結束時間必須晚於開始時間" });
  if (Number(value.dailyStart.slice(3)) % 30 !== 0) ctx.addIssue({ code: "custom", path: ["dailyStart"], message: "開始時間必須以 30 分鐘為單位" });
  if (Number(value.dailyEnd.slice(3)) % 30 !== 0 && value.dailyEnd !== "24:00") ctx.addIssue({ code: "custom", path: ["dailyEnd"], message: "結束時間必須以 30 分鐘為單位" });
  if (clockMinutes(value.dailyEnd) - clockMinutes(value.dailyStart) < value.duration) ctx.addIssue({ code: "custom", path: ["duration"], message: "活動長度超過每天可約時段" });
  const deadline = new Date(value.deadline);
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
    ctx.addIssue({ code: "custom", path: ["deadline"], message: "提交截止必須在未來" });
  }
  const earliest = new Date(`${value.dateStart}T${value.dailyStart}:00+08:00`);
  if (!Number.isNaN(deadline.getTime()) && !Number.isNaN(earliest.getTime()) && deadline >= earliest) {
    ctx.addIssue({ code: "custom", path: ["deadline"], message: "提交截止必須早於最早候選時間" });
  }
});

export function toGatheringRow(input: z.infer<typeof gatheringInputSchema>, userId: string) {
  return { host_id: userId, name: input.name, date_start: input.dateStart, date_end: input.dateEnd, daily_start: input.dailyStart, daily_end: input.dailyEnd, duration_minutes: input.duration, deadline_at: input.deadline, recommendation_count: input.recommendationCount, status: "open" as const };
}

/** All 24 hours may be marked within the invitation dates. */
export function validateGatheringCells(cells: Cells, gathering: { date_start: string; date_end: string; daily_start: string; daily_end: string }) {
  for (const key of Object.keys(cells)) {
    const date = key.slice(0, 10);
    const minute = Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16));
    if (date < gathering.date_start || date > gathering.date_end || minute < 0 || minute >= 1440) {
      throw new Error("CELL_OUT_OF_RANGE");
    }
  }
}

function clockMinutes(value: string) {
  const [hour, minute] = String(value).slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}
