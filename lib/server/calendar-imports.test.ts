import { describe, expect, it } from "vitest";
import { buildPreview } from "./calendar-imports";

const extraction = {
  sources: [{ id: "img-1", kind: "calendar", reason: null }],
  events: [{ id: "event-1", sourceIds: ["img-1"], label: "會議", intent: "busy", startDate: "2026-09-18", startTime: "18:15", endDate: "2026-09-18", endTime: "19:15", sourceTimezone: "Asia/Taipei", allDay: false, recurrence: null, unresolved: [], userConfirmed: true }],
  visibleRanges: [{ startDate: "2026-09-18", endDate: "2026-09-19", complete: false }],
  questions: [],
};

describe("calendar import preview", () => {
  it("returns a patch without mutating the current cells", () => {
    const current = { "2026-09-18-18:30": "yellow" as const };
    const preview = buildPreview(extraction, { startDate: "2026-09-18", endDate: "2026-09-19", currentCells: current });
    expect(preview.changes).toEqual(expect.arrayContaining([
      { key: "2026-09-18-18:00", before: "unknown", after: "red" },
      { key: "2026-09-18-18:30", before: "yellow", after: "red" },
    ]));
    expect(current["2026-09-18-18:30"]).toBe("yellow");
  });

  it("keeps every model suggestion out of the grid until a person confirms it", () => {
    const suggestion = { ...extraction, events: [{ ...extraction.events[0], userConfirmed: false }] };
    const preview = buildPreview(suggestion, { startDate: "2026-09-18", endDate: "2026-09-19", currentCells: {} });
    expect(preview.blockedReview).toBe(true);
    expect(preview.changes).toEqual([]);
  });

  it("blocks open clarification questions even if every extracted row was already confirmed", () => {
    const extractionWithQuestion = { ...extraction, questions: [{ id: "timezone", eventId: null, kind: "timezone", prompt: "Which timezone?" }] };
    const preview = buildPreview(extractionWithQuestion, { startDate: "2026-09-18", endDate: "2026-09-19", currentCells: {} });
    expect(preview.blockedReview).toBe(true);
    expect(preview.changes).toEqual([]);
  });

  it("does not fill visible blanks when a skipped or reminder event prevents an availability inference", () => {
    const preview = buildPreview({
      ...extraction,
      events: [{ ...extraction.events[0], intent: "reminder", allDay: true, startTime: null, endTime: null }],
      visibleRanges: [{ startDate: "2026-09-18", endDate: "2026-09-18", complete: true }],
    }, { startDate: "2026-09-18", endDate: "2026-09-18", currentCells: {} });
    expect(preview.blockedBlankFill).toBe(true);
    expect(preview.changes).toEqual([]);
  });
});

describe('confirmed availability versus uncertainty', () => {
  it('does not fill blanks green even for a complete calendar screenshot', () => {
    const result = buildPreview({...extraction,visibleRanges:[{startDate:'2026-09-18',endDate:'2026-09-19',complete:true}]}, {startDate:'2026-09-18',endDate:'2026-09-19',currentCells:{}});
    expect(result.changes).toHaveLength(3);
    expect(result.changes.every(c=>c.after==='red')).toBe(true);
  });
  it('maps confirmed tentative to yellow and skips unresolved input', () => {
    const result = buildPreview({...extraction,events:[{...extraction.events[0],intent:'tentative'}]}, {startDate:'2026-09-18',endDate:'2026-09-19',currentCells:{}});
    expect(result.changes).toHaveLength(3);
    expect(result.changes.every(c=>c.after==='yellow')).toBe(true);
    const skipped = buildPreview({...extraction,events:[{...extraction.events[0],intent:'uncertain',unresolved:['intent']}]}, {startDate:'2026-09-18',endDate:'2026-09-19',currentCells:{}});
    expect(skipped.changes).toEqual([]);
  });

});

it('accepts explicitly spoken availability without a private event title', () => {
  const result = buildPreview({...extraction, sources:[{id:'img-1',kind:'schedule_voice',reason:null}],events:[{...extraction.events[0],label:null,intent:'available'}]}, {startDate:'2026-09-18',endDate:'2026-09-19',currentCells:{}});
  expect(result.changes).toEqual([{key:'2026-09-18-18:30',before:'unknown',after:'green'}]);
});
