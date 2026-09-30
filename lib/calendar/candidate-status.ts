export type ParticipantAvailability = { submitted: boolean; status?: string; hasUnknown?: boolean; hasConflict?: boolean };
export function candidateSummary(people: ParticipantAvailability[], expectedCount: number) {
  const available = people.filter(p => p.submitted && p.status === 'green' && !p.hasUnknown && !p.hasConflict).length;
  const missing = Math.max(0, expectedCount - people.filter(p => p.submitted).length);
  return { available, missing, common: expectedCount > 0 && people.length === expectedCount && available === expectedCount };
}
