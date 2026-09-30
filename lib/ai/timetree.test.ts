import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./openai', () => ({ modelRequest: vi.fn(), outputText: (r: { output_text: string }) => r.output_text, calendarJsonSchema: {} }));
import { modelRequest } from './openai';
import { extractTimeTree } from './timetree';
import { appleDraftPreview } from '@/lib/calendar/draft-events';
const model = vi.mocked(modelRequest);
const ocr = [{ text: 'TimeTree', confidence: .99, x: .2, y: .9, width: .5, height: .05 }];
beforeEach(() => model.mockReset());
describe('classification before TimeTree event extraction', () => {
  it('never extracts events for non-calendar images', async () => {
    model.mockResolvedValueOnce({ output_text: JSON.stringify({ category: 'non_calendar', confidence: .99, layout: 'unknown', reason: 'chat screenshot' }) });
    const result = await extractTimeTree(ocr, 'image');
    expect(result.events).toEqual([]);
    expect(model).toHaveBeenCalledTimes(1);
    expect(() => appleDraftPreview(result)).toThrow();
  });
  it('downgrades low confidence and keeps any extraction read-only', async () => {
    model.mockResolvedValueOnce({ output_text: JSON.stringify({ category: 'calendar', confidence: .7, layout: 'timetree_agenda', reason: 'cropped' }) });
    model.mockResolvedValueOnce({ output_text: JSON.stringify({ sources: [], events: [], questions: [], visibleRanges: [] }) });
    const result = await extractTimeTree(ocr, 'image');
    expect(result.screenshotValidation?.category).toBe('possible');
    expect(() => appleDraftPreview(result)).toThrow();
  });
});

it('removes invented years, times and names even if the model claims certainty', async () => {
  model.mockResolvedValueOnce({ output_text: JSON.stringify({ category: 'calendar', confidence: .98, layout: 'timetree_agenda', reason: 'calendar UI' }) });
  model.mockResolvedValueOnce({ output_text: JSON.stringify({ sources: [], questions: [], visibleRanges: [], events: [{ id: 'invented', sourceIds: [], label: '不存在的行程', intent: 'busy', startDate: '2026-09-04', endDate: '2026-09-04', startTime: '15:00', endTime: '17:00', sourceTimezone: 'Asia/Taipei', allDay: false, recurrence: null, unresolved: [] }] }) });
  const result = await extractTimeTree(ocr, 'image');
  expect(result.events[0]).toMatchObject({ label: null, startDate: null, endDate: null, startTime: null, endTime: null, sourceTimezone: null });
  expect(() => appleDraftPreview(result)).toThrow();
});
