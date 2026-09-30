import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "./auth";
import * as events from "@/app/api/v1/events/route";
import * as event from "@/app/api/v1/events/[id]/route";
import * as deadlines from "@/app/api/v1/deadlines/route";
import * as deadline from "@/app/api/v1/deadlines/[id]/route";

vi.mock("./auth", () => ({ requireUser: vi.fn() }));
function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const builder = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return builder;
}
const input = {
  title: "本人行程", sourceId: "own-source", calendarId: "shared-calendar", color: "sage", allDay: false,
  startAt: "2026-10-01T01:00:00Z", endAt: "2026-10-01T02:00:00Z", timeZone: "Asia/Taipei",
  dueOn: "2026-10-01", completed: false, idempotencyKey: "mobile-stable-key",
};
const row = {
  id: "event-id", user_id: "owner", source_id: "own-source", calendar_id: "shared-calendar", title: "本人行程", color: "sage", all_day: false,
  start_at: input.startAt, end_at: input.endAt, time_zone: input.timeZone,
  due_on: input.dueOn, completed_at: null, version: "2", idempotency_key: input.idempotencyKey,
};
const context = { params: Promise.resolve({ id: "event-id" }) };
const from = vi.fn();
function request(method: string, body?: unknown) {
  return new Request("https://example.test/api/v1/events/event-id?version=1", {
    method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ user: { id: "owner" }, supabase: { from } } as never);
});

describe.each([
  { name: "event", list: events, detail: event },
  { name: "deadline", list: deadlines, detail: deadline },
])("$name retry API", ({ name, list, detail }) => {
  it("replays deleted creates without recreating them", async () => {
    const replay = query({ ...row, deleted_at: "2026-10-01T00:00:00Z" });
    if (name === "event") {
      from.mockReturnValueOnce(query({ id: "own-source" }));
      from.mockReturnValueOnce(query({ role: "owner" }));
    }
    from.mockReturnValueOnce(replay);
    const response = await list.POST(request("POST", input));
    expect(response.status).toBe(200);
    const body = await response.json() as { deleted: boolean; [key: string]: { idempotencyKey: string } | boolean };
    expect(body.deleted).toBe(true);
    expect((body[name] as { idempotencyKey: string }).idempotencyKey).toBe(input.idempotencyKey);
    expect(replay.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(replay.eq).toHaveBeenCalledWith("idempotency_key", input.idempotencyKey);
    expect(replay.is).not.toHaveBeenCalledWith("deleted_at", null);
    expect(replay.insert).not.toHaveBeenCalled();
  });

  it("repeated deletion succeeds without updating an already deleted row", async () => {
    const existing = query({ ...row, deleted_at: "2026-10-01T00:00:00Z" });
    from.mockReturnValueOnce(existing);
    const response = await detail.DELETE(request("DELETE"), context);
    expect(response.status).toBe(200);
    if (name === "deadline") expect(existing.eq).toHaveBeenCalledWith("user_id", "owner");
    else expect(existing.eq).toHaveBeenCalledWith("id", "event-id");
    expect(existing.update).not.toHaveBeenCalled();
    expect(((await response.json()) as { deleted: boolean }).deleted).toBe(true);
  });

  it("reload by local key is owner scoped and excludes deleted data", async () => {
    const existing = query(row);
    from.mockReturnValueOnce(existing);
    const response = await detail.GET(request("GET"), { params: Promise.resolve({ id: input.idempotencyKey }) });
    expect(response.status).toBe(200);
    expect(existing.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(existing.eq).toHaveBeenCalledWith("idempotency_key", input.idempotencyKey);
    expect(existing.is).toHaveBeenCalledWith("deleted_at", null);
    expect(((await response.json()) as Record<string, { version: string }>)[name].version).toBe("2");
  });

  it("reload does not expose another user's missing record", async () => {
    const existing = query(null);
    from.mockReturnValueOnce(existing);
    expect((await detail.GET(request("GET"), context)).status).toBe(404);
    if (name === "deadline") expect(existing.eq).toHaveBeenCalledWith("user_id", "owner");
    else expect(existing.eq).toHaveBeenCalledWith("id", "event-id");
  });

  it("requires authentication for reload", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    expect((await detail.GET(request("GET"), context)).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});

it("editing an event preserves its original create key", async () => {
  from.mockReturnValueOnce(query({ source_id: "own-source", calendar_id: "shared-calendar" }));
  from.mockReturnValueOnce(query({ role: "owner" }));
  const updated = query(row);
  from.mockReturnValueOnce(updated);
  const response = await event.PATCH(request("PATCH", { ...input, expectedVersion: "1" }), context);
  expect(response.status).toBe(200);
  expect(updated.update.mock.calls[0][0]).not.toHaveProperty("idempotency_key");
  expect(updated.eq).toHaveBeenCalledWith("version", "1");
  expect(updated.eq).toHaveBeenCalledWith("id", "event-id");
});
