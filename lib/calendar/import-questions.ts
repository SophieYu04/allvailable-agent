import type { Extraction } from './schemas';

/** Add only the next deterministic questions needed to make one event safe to review. */
export function ensureImportQuestions(extraction: Extraction): Extraction {
  const uncertainIds = new Set(extraction.events.filter((event) => event.intent === 'uncertain').map((event) => event.id));
  // An uncertain task is a review candidate, not an availability intent question.
  const questions = extraction.questions.filter((question) => !(question.kind === 'intent' && question.eventId && uncertainIds.has(question.eventId)));
  const add = (question: Extraction['questions'][number]) => {
    if (!questions.some((existing) => existing.id === question.id)) questions.push(question);
  };

  for (const event of extraction.events) {
    if (!['busy', 'available', 'tentative', 'uncertain'].includes(event.intent)) continue;
    if ((event.intent !== 'available' && !event.label?.trim()) || event.unresolved.includes('title')) add({ id: `${event.id}-title`, eventId: event.id, kind: 'title', prompt: '請確認這一項的名稱；若只是期限或提醒，可以略過。' });
    if (!event.startDate || !event.endDate || event.unresolved.includes('date')) add({ id: `${event.id}-date`, eventId: event.id, kind: 'date', prompt: '這個行程是哪一天？請提供完整年月日。' });
    if (event.allDay === null || event.unresolved.includes('all_day')) add({ id: `${event.id}-all-day`, eventId: event.id, kind: 'all_day', prompt: '這是全天事件，還是要補上確切起訖時間？', options: ['真的全天不能', '指定起訖', '只是提醒不占時間', '暫時未知'] });
    else if (((!event.startTime || !event.endTime) && event.allDay === false) || event.unresolved.includes('time')) {
      add({ id: `${event.id}-time`, eventId: event.id, kind: 'time', prompt: '請確認確切開始與結束時間（例如 18:00-20:00）。' });
    }
    if (!event.sourceTimezone || event.unresolved.includes('timezone')) add({ id: `${event.id}-timezone`, eventId: event.id, kind: 'timezone', prompt: '請確認時區（例如 Asia/Taipei）。' });
  }
  return { ...extraction, questions };
}
