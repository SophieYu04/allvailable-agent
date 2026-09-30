export type DeadlineInput = {
  title?: unknown;
  dueOn?: unknown;
  completed?: unknown;
  expectedVersion?: unknown;
  idempotencyKey?: unknown;
  pinned?: unknown;
  pinOrder?: unknown;
};

export type ValidatedDeadline = {
  title: string;
  due_on: string;
  completed: boolean;
  idempotency_key: string | null;
  pinned: boolean;
  pin_order: number;
};

export async function validateDeadlineInput(
  input: DeadlineInput,
): Promise<ValidatedDeadline> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 200) throw new Error("DEADLINE_TITLE_INVALID");
  const dueOn = dateOnly(input.dueOn);
  if (!dueOn) throw new Error("DEADLINE_DATE_INVALID");
  const idempotencyKey =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.length <= 200
      ? input.idempotencyKey
      : null;
  return {
    title,
    due_on: dueOn,
    completed: input.completed === true,
    idempotency_key: idempotencyKey,
    pinned: input.pinned === true,
    pin_order: Number.isSafeInteger(input.pinOrder) && Number(input.pinOrder) >= 0 ? Number(input.pinOrder) : 0,
  };
}

/** Accept only calendar dates that actually exist, never a timezone-adjusted instant. */
export function dateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return value;
}

export function deadlineResponse(row: Record<string, unknown>) {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    title: row.title,
    dueOn: row.due_on,
    completed: row.completed_at != null,
    pinned: row.pinned === true,
    pinOrder: Number(row.pin_order ?? 0),
    version: String(row.version),
    updatedAt: row.updated_at,
  };
}
