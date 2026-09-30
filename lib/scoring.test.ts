import { describe, expect, it } from "vitest";
import { scoreCandidates } from "./scoring";

describe("scoreCandidates", () => {
  const candidate = { id: "slot-1", startsAt: "2026-09-18T19:00:00+08:00", endsAt: "2026-09-18T21:00:00+08:00" };
  it("uses the minimum cell score for each person", () => {
    const result = scoreCandidates([candidate], [{ participantId: "a", displayName: "A", isPriority: false, submitted: true, active: true, slots: { a: 2, b: 1, c: 2, d: 2 } }], { "slot-1": ["a", "b", "c", "d"] });
    expect(result[0].participantScores[0].score).toBe(1);
  });
  it("ranks priority score before total score", () => {
    const candidates = [candidate, { ...candidate, id: "slot-2", startsAt: "2026-09-18T20:00:00+08:00" }];
    const result = scoreCandidates(candidates, [
      { participantId: "a", displayName: "A", isPriority: true, submitted: true, active: true, slots: { a: 2, b: 2 } },
      { participantId: "b", displayName: "B", isPriority: false, submitted: true, active: true, slots: { a: 0, b: 0 } },
    ], { "slot-1": ["a", "b"], "slot-2": ["a", "b"] });
    expect(result[0].id).toBe("slot-1");
  });
  it("treats unknown and unsubmitted cells as zero", () => {
    const result = scoreCandidates([candidate], [{ participantId: "a", displayName: "A", isPriority: false, submitted: false, active: true, slots: {} }], { "slot-1": ["a", "b"] });
    expect(result[0].totalScore).toBe(0);
    expect(result[0].participantScores[0].score).toBeNull();
  });
  it("keeps priority flags aligned after inactive participants are removed", () => {
    const candidates = [
      { ...candidate, id: "priority", startsAt: "2026-09-18T19:00:00+08:00" },
      { ...candidate, id: "non-priority", startsAt: "2026-09-18T20:00:00+08:00" },
    ];
    const result = scoreCandidates(candidates, [
      { participantId: "left", displayName: "Left", isPriority: false, submitted: true, active: false, slots: { a: 2 } },
      { participantId: "priority", displayName: "Priority", isPriority: true, submitted: true, active: true, slots: { a: 1, b: 1 } },
      { participantId: "regular", displayName: "Regular", isPriority: false, submitted: true, active: true, slots: { a: 2, b: 2 } },
    ], { priority: ["a", "b"], "non-priority": ["a", "b"] });
    expect(result[0].id).toBe("priority");
    expect(result[0].priorityScore).toBe(1);
  });

  it("scores a candidate with no cells as zero instead of Infinity", () => {
    const result = scoreCandidates([candidate], [{ participantId: "a", displayName: "A", isPriority: false, submitted: true, active: true, slots: {} }], {});
    expect(result[0].totalScore).toBe(0);
    expect(Number.isFinite(result[0].totalScore)).toBe(true);
  });
});

describe('snapshot reasons and priority', () => {
  const candidate = {id:'one',startsAt:'2030-01-05T10:00:00Z',endsAt:'2030-01-05T11:00:00Z'};
  it('preserves conflict and unfilled reasons independently at the same score', () => {
    const people = ['red','unknown','yellow'].map((status,i)=>({participantId:String(i),isPriority:false,submitted:true,active:true,statuses:{a:status},slots:{a:(status==='yellow'?1:0) as 0|1|2}}));
    const result = scoreCandidates([candidate],people,{one:['a']})[0];
    expect(result.participantScores.map(p=>p.status)).toEqual(['red','unknown','yellow']);
    expect(result.participantScores[0].hasConflict).toBe(true);
    expect(result.participantScores[1].hasUnknown).toBe(true);
  });
  it('prefers priority availability over a larger nonpriority total', () => {
    const people = [
      {participantId:'host',isPriority:true,submitted:true,active:true,slots:{a:2 as const,b:1 as const}},
      ...['b','c','d'].map(id=>({participantId:id,isPriority:false,submitted:true,active:true,slots:{a:0 as const,b:2 as const}})),
    ];
    const results=scoreCandidates([{...candidate,id:'crowd'},candidate],people,{one:['a'],crowd:['b']});
    expect(results.map(c=>c.id)).toEqual(['one','crowd']);
    expect(results[0].totalScore).toBeLessThan(results[1].totalScore);
  });
});
