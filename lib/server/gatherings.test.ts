import { describe, expect, it } from "vitest";
import { gatheringInputSchema, validateGatheringCells } from "./gatherings";

const base = {
  name: "週末聚餐",
  dateStart: "2099-09-20",
  dateEnd: "2099-10-03",
  dailyStart: "08:00",
  dailyEnd: "24:00",
  duration: 120,
  deadline: "2099-09-19T08:00:00+08:00",
  recommendationCount: 3,
};

describe("gatheringInputSchema", () => {
  it("accepts a 14-day inclusive range and 24:00 end", () => {
    expect(gatheringInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a range longer than 14 calendar days", () => {
    expect(gatheringInputSchema.safeParse({ ...base, dateEnd: "2099-10-04" }).success).toBe(false);
  });

  it("rejects a past response deadline", () => {
    expect(gatheringInputSchema.safeParse({ ...base, deadline: "2020-01-01T00:00:00.000Z" }).success).toBe(false);
  });

  it("requires the deadline before the first candidate", () => {
    expect(gatheringInputSchema.safeParse({ ...base, deadline: "2099-09-20T08:30:00+08:00" }).success).toBe(false);
  });

  it("rejects non-half-hour duration", () => {
    expect(gatheringInputSchema.safeParse({ ...base, duration: 75 }).success).toBe(false);
  });

  it("rejects availability cells outside the configured window", () => {
    const gathering = { date_start: "2026-09-21", date_end: "2026-09-21", daily_start: "08:00:00", daily_end: "24:00:00" };
    expect(() => validateGatheringCells({ "2026-09-21-07:30": "green" }, gathering)).toThrow("CELL_OUT_OF_RANGE");
    expect(() => validateGatheringCells({ "2026-09-22-08:00": "green" }, gathering)).toThrow("CELL_OUT_OF_RANGE");
  });
});
