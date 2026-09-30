import { describe, expect, it } from "vitest";
import { eventToCells, patchFromEvents } from "./slots";

const range = { startDate: "2026-09-18", endDate: "2026-09-19" };

describe("calendar slot conversion", () => {
  it("rounds a partial busy slot down and includes every intersecting cell", () => {
    const cells = eventToCells({ id: "e", sourceIds: [], label: null, intent: "busy", startDate: "2026-09-18", startTime: "18:15", endDate: "2026-09-18", endTime: "19:15", sourceTimezone: "Asia/Taipei", allDay: false, recurrence: null, unresolved: [] }, range);
    expect(cells).toEqual(["2026-09-18-18:00", "2026-09-18-18:30", "2026-09-18-19:00"]);
  });

  it("splits an explicit overnight event by local date", () => {
    const cells = eventToCells({ id: "e", sourceIds: [], label: null, intent: "busy", startDate: "2026-09-18", startTime: "23:00", endDate: "2026-09-19", endTime: "01:00", sourceTimezone: "Asia/Taipei", allDay: false, recurrence: null, unresolved: [] }, range);
    expect(cells).toEqual(["2026-09-18-23:00", "2026-09-18-23:30", "2026-09-19-00:00", "2026-09-19-00:30"]);
  });

  it("does not infer green when an event has no date", () => {
    const next = patchFromEvents([{ id: "e", sourceIds: [], label: null, intent: "busy", startDate: null, startTime: "18:00", endDate: null, endTime: "19:00", sourceTimezone: "Asia/Taipei", allDay: false, recurrence: null, unresolved: ["date"] }], range, {}, false);
    expect(next).toEqual({});
  });

  it("expands a bounded weekly recurrence", () => {
    const next = patchFromEvents([{ id: "e", sourceIds: [], label: null, intent: "busy", startDate: "2026-09-18", startTime: "18:00", endDate: "2026-09-18", endTime: "19:00", sourceTimezone: "Asia/Taipei", allDay: false, recurrence: { frequency: "weekly", interval: 1, weekdays: [5], until: "2026-10-02" }, unresolved: [] }], { startDate: "2026-09-18", endDate: "2026-10-02" }, {});
    expect(Object.keys(next)).toEqual(expect.arrayContaining(["2026-09-18-18:00", "2026-09-25-18:00", "2026-10-02-18:00"]));
  });

  it("maps a confirmed all-day busy event to that local date", () => {
    const next = patchFromEvents([{ id: "e", sourceIds: [], label: null, intent: "busy", startDate: "2026-09-18", startTime: null, endDate: "2026-09-18", endTime: null, sourceTimezone: "Asia/Taipei", allDay: true, recurrence: null, unresolved: [] }], { startDate: "2026-09-18", endDate: "2026-09-18" }, {});
    expect(next["2026-09-18-00:00"]).toBe("red");
    expect(next["2026-09-18-23:30"]).toBe("red");
  });

  it("converts a clearly identified source timezone to Taipei", () => {
    const cells = eventToCells({ id: "e", sourceIds: [], label: null, intent: "busy", startDate: "2026-09-18", startTime: "18:00", endDate: "2026-09-18", endTime: "20:00", sourceTimezone: "America/New_York", allDay: false, recurrence: null, unresolved: [] }, { startDate: "2026-09-19", endDate: "2026-09-19" });
    expect(cells).toEqual(["2026-09-19-06:00", "2026-09-19-06:30", "2026-09-19-07:00", "2026-09-19-07:30"]);
  });
});

it("only counts fully available half-hour cells", () => {
  expect(eventToCells({ id: "e", sourceIds: [], label: null, intent: "available", startDate: "2026-09-18", startTime: "18:15", endDate: "2026-09-18", endTime: "19:15", sourceTimezone: "Asia/Taipei", allDay: false, recurrence: null, unresolved: [] }, range)).toEqual(["2026-09-18-18:30"]);
});
