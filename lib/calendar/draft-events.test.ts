import { describe, expect, it } from 'vitest';
import { appleDraftPreview, editDraft } from './draft-events';
import { deterministicCorrection } from './voice-command';
import type { Extraction } from './schemas';
const draft: Extraction = {
  screenshotValidation: { category: 'calendar', confidence: .96, layout: 'timetree_agenda', reason: 'calendar layout' },
  sources: [{ id: 'image', kind: 'calendar', reason: null }], visibleRanges: [], questions: [],
  events: [{ id: 'piano', sourceIds: ['image'], label: '鋼琴課', intent: 'busy', startDate: '2026-09-04', endDate: '2026-09-04', startTime: '15:00', endTime: '17:00', sourceTimezone: 'Asia/Taipei', allDay: false, recurrence: null, unresolved: [], userConfirmed: true }],
};
describe('Apple Calendar draft boundary', () => {
  it('accepts only positive screenshot validation and complete events', () => {
    expect(appleDraftPreview(draft)).toHaveLength(1);
    for (const category of ['possible', 'non_calendar'] as const) {
      expect(() => appleDraftPreview({ ...draft, screenshotValidation: { ...draft.screenshotValidation!, category } })).toThrow();
    }
    expect(() => appleDraftPreview({ ...draft, screenshotValidation: undefined })).toThrow();
    expect(() => appleDraftPreview({ ...draft, events: [{ ...draft.events[0], sourceTimezone: null }] })).toThrow();
    expect(() => appleDraftPreview({ ...draft, events: [{ ...draft.events[0], sourceIds: ['fabricated'] }] })).toThrow();
  });
  it('does not assume that an earlier end is tomorrow', () => {
    const changed = editDraft(draft, 'edit_event', 'piano', { endTime: '14:00' });
    expect(() => appleDraftPreview(changed)).toThrow(/確認/);
    const confirmedChange = editDraft(changed, 'edit_event', 'piano', { reviewed: true });
    expect(() => appleDraftPreview(confirmedChange)).toThrow(/結束/);
    const crossDay = editDraft(confirmedChange, 'edit_event', 'piano', { endDate: '2026-09-05', reviewed: true });
    expect(appleDraftPreview(crossDay)).toHaveLength(1);
  });
  it('rejects impossible dates and retains classification after human edits', () => {
    expect(() => editDraft(draft, 'edit_event', 'piano', { date: '2026-02-30' })).toThrow();
    const uncertain = { ...draft, screenshotValidation: { ...draft.screenshotValidation!, category: 'possible' as const } };
    const changed = editDraft(uncertain, 'edit_event', 'piano', { title: '小提琴課', reviewed: true });
    expect(() => appleDraftPreview(changed)).toThrow();
    expect(draft.events[0].label).toBe('鋼琴課');
  });
  it('deletes only the selected draft and leaves the original extraction intact', () => {
    expect(editDraft(draft, 'edit_event', 'piano', { delete: true }).events).toEqual([]);
    expect(draft.events).toHaveLength(1);
  });
});
describe('calendar context voice commands', () => {
  const context = { title: '鋼琴課', date: '2026-09-04', startTime: '15:00', endTime: '17:00' };
  it.each([
    ['不是三點，是四點。', 'update_start_time', 'startTime', '16:00'],
    ['結束時間改成六點。', 'update_end_time', 'endTime', '18:00'],
    ['不是星期五，是星期六。', 'update_date', 'date', '2026-09-05'],
    ['名稱改成鋼琴練習。', 'update_title', 'title', '鋼琴練習'],
    ['這個不是鋼琴課，是小提琴課。', 'update_title', 'title', '小提琴課'],
  ])('%s edits only the intended field', (text, intent, field, value) => {
    expect(deterministicCorrection(text, context)).toMatchObject({ intent, [field]: value });
  });
  it('does not treat unrelated questions as deterministic commands', () => {
    for (const text of ['今天晚餐吃什麼？', 'Apple 股票多少？', '幫我寫一封 Email。']) expect(deterministicCorrection(text, context)).toBeNull();
    expect(deterministicCorrection('確認事件', context)?.intent).toBe('confirm_event');
  });
});
