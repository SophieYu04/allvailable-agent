import { describe, expect, it } from "vitest";
import { dateOnly, deadlineResponse } from "./deadline-validation";

describe("deadline date validation", () => {
  it("accepts real ISO calendar dates", () => {
    expect(dateOnly("2028-02-29")).toBe("2028-02-29");
  });

  it("rejects malformed and impossible calendar dates", () => {
    expect(dateOnly("2027-02-29")).toBeNull();
    expect(dateOnly("2027-2-09")).toBeNull();
    expect(dateOnly("2027-09-31")).toBeNull();
  });

  it("does not expose the storage completion timestamp", () => {
    expect(deadlineResponse({ id: "d1", title: "HW1", due_on: "2026-09-25", completed_at: null, version: 2, updated_at: "now" })).toMatchObject({
      id: "d1", dueOn: "2026-09-25", completed: false, version: "2",
    });
  });
});
