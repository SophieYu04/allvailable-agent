import { z } from 'zod';
import { extractionSchema, timeSchema, type Extraction } from './schemas';

const date = z.string().refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, '請輸入有效日期 YYYY-MM-DD');
const zone = z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, '請確認時區');
export const draftChangesSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(), date: date.optional(), endDate: date.optional(),
  startTime: timeSchema.optional(), endTime: timeSchema.optional(),
  sourceTimezone: zone.optional(), allDay: z.boolean().optional(),
  reviewed: z.boolean().optional(), delete: z.boolean().optional(),
}).strict();
export function canWriteScreenshot(extraction: Extraction) {
  return extraction.screenshotValidation?.category === 'calendar' && extraction.screenshotValidation.confidence >= .9 &&
    extraction.sources.length > 0 && extraction.sources.every(source => source.kind === 'calendar');
}
export function editDraft(extraction: Extraction, action: 'edit_event' | 'add_event', eventId: string | undefined, raw: unknown): Extraction {
  if (!extraction.sources.length || extraction.sources.some(source => source.kind === 'unrelated')) throw new Error('沒有偵測到可匯入的行程。');
  const changes = draftChangesSchema.parse(raw);
  const current = extraction.events.find(event => event.id === eventId);
  if (action === 'edit_event' && !current) throw new Error('找不到這個草稿事件');
  if (changes.delete) {
    if (!current || action !== 'edit_event') throw new Error('找不到這個草稿事件');
    return { ...extraction, events: extraction.events.filter(event => event.id !== eventId), questions: extraction.questions.filter(q => q.eventId !== eventId) };
  }
  if (action === 'add_event' && extraction.events.length >= 100) throw new Error('一次最多 100 個草稿事件');
  const event = current && action === 'edit_event' ? { ...current } : {
    id: crypto.randomUUID(), sourceIds: extraction.sources.map(source => source.id), label: null,
    intent: 'busy' as const, startDate: null, endDate: null, startTime: null, endTime: null,
    sourceTimezone: null, allDay: false, recurrence: null, unresolved: [],
  };
  if (changes.title !== undefined) event.label = changes.title;
  if (changes.date !== undefined) {
    // Preserve an explicitly recognized cross-day span when only the start date moves.
    const span = event.startDate && event.endDate ? Math.max(0, Date.parse(event.endDate) - Date.parse(event.startDate)) : 0;
    event.startDate = changes.date;
    event.endDate = changes.endDate ?? new Date(Date.parse(changes.date) + span).toISOString().slice(0, 10);
  }
  if (changes.endDate !== undefined) event.endDate = changes.endDate;
  if (changes.startTime !== undefined) event.startTime = changes.startTime;
  if (changes.endTime !== undefined) event.endTime = changes.endTime;
  if (changes.sourceTimezone !== undefined) event.sourceTimezone = changes.sourceTimezone;
  if (changes.allDay !== undefined) event.allDay = changes.allDay;
  if (changes.reviewed) {
    if (event.intent === 'uncertain') event.intent = 'busy';
    event.recurrence = null;
  }
  event.userConfirmed = changes.reviewed === true;
  event.unresolved = changes.reviewed ? [] : event.unresolved.filter(field =>
    !(field === 'date' && changes.date) && !(field === 'time' && event.startTime && event.endTime) &&
    !(field === 'timezone' && changes.sourceTimezone) && !(field === 'title' && changes.title));
  if (!event.label) event.unresolved.push('title');
  if (!event.startDate || !event.endDate) event.unresolved.push('date');
  if (!event.allDay && (!event.startTime || !event.endTime)) event.unresolved.push('time');
  if (!event.sourceTimezone) event.unresolved.push('timezone');
  event.unresolved = [...new Set(event.unresolved)];
  return extractionSchema.parse({ ...extraction,
    events: action === 'add_event' ? [...extraction.events, event] : extraction.events.map(e => e.id === eventId ? event : e),
    questions: extraction.questions.filter(q => q.eventId !== eventId),
  });
}
export function appleDraftPreview(extraction: Extraction) {
  if (!canWriteScreenshot(extraction)) throw new Error('截圖尚未通過行事曆分類，請重新選擇清楚的 TimeTree 截圖');
  if (!extraction.events.length) throw new Error('沒有可加入的草稿事件');
  const sourceIds = new Set(extraction.sources.map(source => source.id));
  for (const event of extraction.events) {
    if (!event.sourceIds.length || event.sourceIds.some(id => !sourceIds.has(id)) || event.userConfirmed !== true || event.unresolved.length || event.recurrence || event.intent === 'uncertain' || !event.label?.trim() || !event.startDate || !event.endDate || !event.sourceTimezone || event.allDay === null) throw new Error('請先逐筆補齊並確認事件資料');
    date.parse(event.startDate); date.parse(event.endDate); zone.parse(event.sourceTimezone);
    if (event.endDate < event.startDate) throw new Error('結束日期不可早於開始日期');
    if (!event.allDay) {
      timeSchema.parse(event.startTime); timeSchema.parse(event.endTime);
      if (`${event.endDate}T${event.endTime}` <= `${event.startDate}T${event.startTime}`) throw new Error('結束必須晚於開始；跨日行程請修改結束日期');
    }
  }
  return extraction.events;
}
