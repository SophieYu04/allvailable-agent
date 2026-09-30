import type { Extraction } from '@/lib/calendar/schemas';

type Source = { id: string; text: string };
const compact = (text: string) => text.normalize('NFKC').replace(/\s+/g, '');

/** Recover only literal OCR evidence, never current dates or default durations. */
export function groundOcrEvents(events: Extraction['events'], sources: Source[]): Extraction['events'] {
  return events.map(event => {
    const texts = sources.filter(source => event.sourceIds.includes(source.id)).map(source => source.text);
    const evidence = texts.map(compact).join('\n');
    const headers = texts.flatMap(text => [...text.matchAll(/(?:^|\n)\s*(\d{4})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})\s*(?:日)?(?=\s|$|[（(·])/g)]);
    const dates = [...new Set(headers.map(match => `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`))];
    const date = dates.length === 1 && Number.isFinite(Date.parse(`${dates[0]}T00:00:00Z`)) && new Date(`${dates[0]}T00:00:00Z`).toISOString().slice(0,10) === dates[0] ? dates[0] : null;
    const titleSupported = Boolean(event.label?.trim() && evidence.includes(compact(event.label)));
    const literalDeadline = titleSupported && /(?:期限|截止)\s*(?:今天|今日|\d)|deadline\s*[:：]/i.test(event.label!);
    const inferredDate = !event.startDate && !event.endDate ? date : null;
    return { ...event,
      startDate: inferredDate ?? event.startDate,
      endDate: inferredDate ?? event.endDate,
      intent: literalDeadline ? 'reminder' : event.intent,
      unresolved: event.unresolved.filter(field => !(field === 'title' && titleSupported) && !(field === 'date' && inferredDate)),
      userConfirmed: false,
    };
  });
}
