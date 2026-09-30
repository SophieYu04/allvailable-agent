import type { Extraction } from '@/lib/calendar/schemas';
import { ensureImportQuestions } from '@/lib/calendar/import-questions';

const fields = new Set(['title', 'date', 'time', 'timezone', 'all_day']);

/** Model notes cannot become unanswerable blockers. Every ambiguity gets a reviewable field. */
export function normalizeModelExtraction(extraction: Extraction): Extraction {
  const events = extraction.events.map(event => {
    const unknownNote = event.unresolved.some(field => !fields.has(field));
    return {
      ...event,
      // Unknown semantics require the user to choose whether this is an actual busy item.
      intent: unknownNote && event.intent !== 'reminder' ? 'uncertain' as const : event.intent,
      unresolved: event.unresolved.filter(field => fields.has(field)),
      userConfirmed: false,
    };
  });
  // Question wording/options come from application rules. Model-generated options may be
  // malformed (for example “null” as an answer), duplicate a field, or refer to missing IDs.
  return ensureImportQuestions({ ...extraction, events, questions: [] });
}
