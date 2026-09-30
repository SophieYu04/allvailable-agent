import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";

describe("parseIcs", () => {
  it("unfolds and preserves timed event boundaries", () => {
    const result = parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:one\r\nSUMMARY:Team\r\nDTSTART:20260915T090000Z\r\nDTEND:20260915T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR");
    expect(result.questions).toHaveLength(0);
    expect(result.events[0]).toMatchObject({ uid: "one", title: "Team", startAt: "2026-09-15T09:00:00.000Z", endAt: "2026-09-15T10:00:00.000Z" });
  });

  it("keeps all-day dates exclusive and asks before importing recurrence", () => {
    const result = parseIcs("BEGIN:VEVENT\nUID:two\nSUMMARY:Trip\nDTSTART;VALUE=DATE:20260915\nDTEND;VALUE=DATE:20260917\nRRULE:FREQ=WEEKLY;COUNT=4\nEND:VEVENT");
    expect(result.events[0]).toMatchObject({ allDay: true, startDate: "2026-09-15", endDateExclusive: "2026-09-17" });
    expect(result.questions[0]?.uid).toBe("two");
  });
});
