import { describe, expect, it } from "vitest";
import { requiredAttendeesAvailable } from "../supabase/functions/_shared/required-attendance";

describe("required attendance", () => {
  const required = new Set(["host"]);
  it("allows a tentative optional guest when the required guest is available", () => {
    expect(requiredAttendeesAvailable([
      { participantId: "host", submitted: true, status: "green" },
      { participantId: "guest", submitted: true, status: "yellow" },
    ], required)).toBe(true);
  });
  it.each(["yellow", "red", "unknown", "unsubmitted"])("rejects a required guest with %s status", (status) => {
    expect(requiredAttendeesAvailable([{ participantId: "host", submitted: status !== "unsubmitted", status }], required)).toBe(false);
  });
  it("rejects a missing required guest", () => {
    expect(requiredAttendeesAvailable([{ participantId: "guest", submitted: true, status: "green" }], required)).toBe(false);
  });
});
