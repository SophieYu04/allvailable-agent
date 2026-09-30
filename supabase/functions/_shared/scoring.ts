export type ScoreCandidate = { id: string; startsAt: string; endsAt: string };
export type ScoreSubmission = {
  participantId: string;
  displayName?: string;
  isPriority: boolean;
  slots: Record<string, 0 | 1 | 2>;
  statuses?: Record<string, string>;
  submitted: boolean;
  active: boolean;
};

/** Shared integer scoring core: green=2, yellow=1, red/unknown=0. */
export function scoreCandidates(candidates: ScoreCandidate[], submissions: ScoreSubmission[], cellsByCandidate: Record<string, string[]>) {
  const activeSubmissions = submissions.filter((submission) => submission.active);
  return candidates.map((candidate) => {
    const cells = cellsByCandidate[candidate.id] ?? [];
    const participantScores = activeSubmissions.map((submission) => {
      const score = submission.submitted && cells.length
        ? Math.min(...cells.map((cell) => submission.slots[cell] ?? 0))
        : 0;
      const hasUnknown = submission.submitted && (!cells.length || cells.some((cell) => submission.statuses
        ? !submission.statuses[cell] || submission.statuses[cell] === "unknown"
        : submission.slots[cell] === undefined));
      const hasConflict = submission.submitted && cells.some((cell) => submission.statuses?.[cell] === "red");
      const status = !submission.submitted ? "unsubmitted" : hasConflict ? "red" : hasUnknown ? "unknown" : score === 2 ? "green" : score === 1 ? "yellow" : "unavailable";
      return { status, hasUnknown, hasConflict, participantId: submission.participantId, displayName: submission.displayName ?? "", score: submission.submitted ? score : null, submitted: submission.submitted };
    });
    const priorityScore = participantScores.reduce((sum, person, index) => sum + (activeSubmissions[index]?.isPriority ? (person.score ?? 0) : 0), 0);
    const totalScore = participantScores.reduce((sum, person) => sum + (person.score ?? 0), 0);
    return { ...candidate, priorityScore, totalScore, participantScores };
  }).sort((a, b) => b.priorityScore - a.priorityScore || b.totalScore - a.totalScore || a.startsAt.localeCompare(b.startsAt));
}
