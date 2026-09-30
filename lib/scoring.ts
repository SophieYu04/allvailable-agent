import { scoreCandidates as scoreCore, type ScoreCandidate, type ScoreSubmission } from "../supabase/functions/_shared/scoring";

export type AvailabilityValue = 0 | 1 | 2;
export type CandidateSlot = ScoreCandidate;
export type Submission = ScoreSubmission;
export type ScoredCandidate = ReturnType<typeof scoreCore>[number];

export function scoreCandidates(candidates: CandidateSlot[], submissions: Submission[], cellsByCandidate: Record<string, string[]>) {
  return scoreCore(candidates, submissions, cellsByCandidate);
}
