import type { CalendarPatch, Cells, SlotStatus } from "./types";
import { statusSchema } from "./schemas";

export function diffCells(before: Cells, after: Cells): CalendarPatch {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = [...keys].filter((key) => (before[key] ?? "unknown") !== (after[key] ?? "unknown")).map((key) => ({ key, before: before[key] ?? "unknown", after: after[key] ?? "unknown" }));
  return { changes };
}

export function applyPatch(cells: Cells, patch: CalendarPatch): Cells {
  const result = { ...cells };
  patch.changes.forEach(({ key, after }) => {
    const status: SlotStatus = statusSchema.parse(after);
    if (status === "unknown") delete result[key]; else result[key] = status;
  });
  return result;
}

export function validateCells(cells: unknown): Cells {
  const parsed = cells as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("CELLS_INVALID");
  const result: Cells = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^\d{4}-\d{2}-\d{2}-(?:[01]\d|2[0-3]):[0-5]\d$/.test(key)) throw new Error("CELL_KEY_INVALID");
    result[key] = statusSchema.parse(value);
  }
  return result;
}

