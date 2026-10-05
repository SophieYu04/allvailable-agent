export type RequiredParticipant = { participantId: string; status: string; submitted: boolean };

export function requiredAttendeesAvailable(people: RequiredParticipant[], requiredIds: Set<string>): boolean {
  return [...requiredIds].every((id) => people.some((person) => person.participantId === id && person.submitted && person.status === "green"));
}
