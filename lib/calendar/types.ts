export const SLOT_STATUSES = ["unknown", "green", "yellow", "red"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];
export type BusyStatus = "yellow" | "red";
export type CellKey = `${string}-${string}`;
export type Cells = Record<string, SlotStatus>;

export type CalendarPatch = {
  changes: Array<{ key: string; before: SlotStatus; after: SlotStatus }>;
};

export type ImportStatus = "processing" | "rejected" | "needs_clarification" | "ready" | "failed";

export type ExtractedEvent = {
  id: string;
  sourceIds: string[];
  label: string | null;
  intent: "busy" | "available" | "tentative" | "uncertain" | "reminder";
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  sourceTimezone: string | null;
  allDay: boolean | null;
  recurrence: {
    frequency: "daily" | "weekly" | "monthly";
    interval: number;
    weekdays: number[];
    until: string | null;
  } | null;
  unresolved: string[];
  userConfirmed?: boolean;
};

export type ImportQuestion = {
  id: string;
  eventId: string | null;
  kind: "date" | "time" | "all_day" | "timezone" | "intent" | "range";
  prompt: string;
  options?: string[];
};
