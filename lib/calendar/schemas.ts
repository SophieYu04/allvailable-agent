import { z } from "zod";
import { SLOT_STATUSES } from "./types";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD");
export const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "時間格式必須為 HH:mm");
export const statusSchema = z.enum(SLOT_STATUSES);
export const cellKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}-(?:[01]\d|2[0-3]):[0-5]\d$/, "格子 key 格式無效").refine((value) => Number(value.slice(-2)) % 30 === 0, "格子必須是 30 分鐘邊界");
export const cellsSchema = z.record(cellKeySchema, statusSchema);

export const extractedEventSchema = z.object({
  id: z.string().min(1),
  sourceIds: z.array(z.string()),
  label: z.string().nullable(),
  intent: z.enum(["busy", "available", "tentative", "uncertain", "reminder"]),
  startDate: dateSchema.nullable(),
  startTime: timeSchema.nullable(),
  endDate: dateSchema.nullable(),
  endTime: timeSchema.nullable(),
  sourceTimezone: z.string().nullable(),
  allDay: z.boolean().nullable(),
  recurrence: z.object({ frequency: z.enum(["daily", "weekly", "monthly"]), interval: z.number().int().positive(), weekdays: z.array(z.number().int().min(0).max(6)), until: dateSchema.nullable() }).nullable(),
  unresolved: z.array(z.string()),
  // Set only by the user-facing review action, never by model extraction.
  userConfirmed: z.boolean().optional(),
});

export const extractionSchema = z.object({
  screenshotValidation: z.object({ category: z.enum(["calendar", "possible", "non_calendar"]), confidence: z.number().min(0).max(1), layout: z.string(), reason: z.string() }).optional(),
  sources: z.array(z.object({ id: z.string(), kind: z.enum(["calendar", "schedule_voice", "unrelated", "uncertain"]), reason: z.string().nullable() })),
  events: z.array(extractedEventSchema),
  visibleRanges: z.array(z.object({ startDate: dateSchema, endDate: dateSchema, complete: z.boolean() })),
  questions: z.array(z.object({ id: z.string(), eventId: z.string().nullable(), kind: z.enum(["title", "date", "time", "all_day", "timezone", "intent", "range"]), prompt: z.string(), options: z.array(z.string()).optional() })),
});

export const clarificationAnswerSchema = z.object({ questionId: z.string().min(1), value: z.unknown() });
export const importPreviewSchema = z.object({
  importId: z.string().uuid(),
  version: z.string().regex(/^\d+$/),
  targetVersion: z.string().regex(/^\d+$/),
  range: z.object({ startDate: dateSchema, endDate: dateSchema }),
  selectedKeys: z.array(z.string()),
});

export type Extraction = z.infer<typeof extractionSchema>;
