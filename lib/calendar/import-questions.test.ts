import { describe, expect, it } from 'vitest';
import { ensureImportQuestions } from './import-questions';
import { editDraft } from './draft-events';
import { buildPreview } from '@/lib/server/calendar-imports';
import type { Extraction } from './schemas';

const extraction: Extraction = {
  screenshotValidation: { category: 'calendar', confidence: .99, layout: 'dated_task_list', reason: 'dated task rows' },
  sources: [{ id: 'list', kind: 'calendar', reason: null }],
  events: [{
    id: 'dinner', sourceIds: ['list'], label: 'Dinner with Maya', intent: 'uncertain',
    startDate: '2026-10-03', endDate: '2026-10-03', startTime: null, endTime: null,
    sourceTimezone: null, allDay: false, recurrence: null, unresolved: ['intent', 'time', 'timezone'],
  }],
  visibleRanges: [],
  questions: [{ id: 'dinner-intent', eventId: 'dinner', kind: 'intent', prompt: 'Wrong question for a task candidate', options: ['Busy', 'Available'] }],
};

describe('dated task-list review flow', () => {
  it('asks for exact time and timezone without asking whether the user is free', () => {
    const result = ensureImportQuestions(extraction);
    expect(result.questions.map(question => question.kind)).toEqual(['time', 'timezone']);
    expect(result.events[0].intent).toBe('uncertain');
    expect(buildPreview(result, { startDate: '2026-10-03', endDate: '2026-10-03', currentCells: {}, slotStart: '18:00', slotEnd: '22:00' }).changes).toEqual([]);
  });

  it('asks for a missing event title but does not require one for explicitly stated availability', () => {
    const unnamedBusy = { ...extraction, events: [{ ...extraction.events[0], label: null, intent: 'busy' as const }] };
    expect(ensureImportQuestions(unnamedBusy).questions.map(question => question.kind)).toContain('title');
    const unnamedAvailability = { ...unnamedBusy, events: [{ ...unnamedBusy.events[0], intent: 'available' as const }] };
    expect(ensureImportQuestions(unnamedAvailability).questions.map(question => question.kind)).not.toContain('title');
  });

  it('writes busy cells only after the user confirms a complete candidate', () => {
    const complete: Extraction = {
      ...extraction,
      questions: [],
      events: [{ ...extraction.events[0], startTime: '19:00', endTime: '20:30', sourceTimezone: 'Asia/Taipei', unresolved: ['intent'] }],
    };
    const confirmed = editDraft(complete, 'edit_event', 'dinner', { reviewed: true });
    const preview = buildPreview(confirmed, { startDate: '2026-10-03', endDate: '2026-10-03', currentCells: {}, slotStart: '18:00', slotEnd: '22:00' });
    expect(preview.changes.map(change => [change.key, change.after])).toEqual([
      ['2026-10-03-19:00', 'red'],
      ['2026-10-03-19:30', 'red'],
      ['2026-10-03-20:00', 'red'],
    ]);
  });

  it('preserves explicit availability when the person confirms the row', () => {
    const available: Extraction = { ...extraction, questions: [], events: [{ ...extraction.events[0], intent: 'available', startDate: '2026-10-03', endDate: '2026-10-03', startTime: '19:00', endTime: '20:00', sourceTimezone: 'Asia/Taipei', unresolved: [] }] };
    const confirmed = editDraft(available, 'edit_event', 'dinner', { reviewed: true });
    expect(confirmed.events[0].intent).toBe('available');
    expect(confirmed.events[0].userConfirmed).toBe(true);
  });

  it('removes a skipped deadline candidate from this import', () => {
    const deadline: Extraction = { ...extraction, events: [{ ...extraction.events[0], label: 'Report deadline', intent: 'reminder' }] };
    const skipped = editDraft(deadline, 'edit_event', 'dinner', { delete: true });
    expect(skipped.events).toEqual([]);
    expect(skipped.questions).toEqual([]);
  });
});
