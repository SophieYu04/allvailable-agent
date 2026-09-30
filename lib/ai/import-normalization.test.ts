import { expect, it } from 'vitest';
import { normalizeModelExtraction } from './import-normalization';
import { clarifyExtraction } from '@/lib/calendar/import-clarification';
import type { Extraction } from '@/lib/calendar/schemas';

it('makes a real provider’s malformed uncertainty answerable without guessing dates or times', () => {
  let result = normalizeModelExtraction({ sources: [{id:'s',kind:'calendar',reason:null}], visibleRanges: [], questions: [],
    events: [{ id:'dinner', sourceIds:['s'], label:'和 Maya 吃晚餐', intent:'busy', startDate:null, endDate:null, startTime:null, endTime:null, sourceTimezone:null, allDay:null, recurrence:null, unresolved:['待辦'], userConfirmed:true }] });
  expect(result.events[0]).toMatchObject({intent:'uncertain',userConfirmed:false,startDate:null,startTime:null});
  result = clarifyExtraction(result,'dinner-date','2026-10-03');
  result = clarifyExtraction(result,'dinner-all-day','指定起訖');
  result = clarifyExtraction(result,'dinner-time','19:00-20:30');
  result = clarifyExtraction(result,'dinner-timezone','Asia/Taipei');
  expect(result.questions).toEqual([]);
  expect(result.events[0]).toMatchObject({startTime:'19:00',endTime:'20:30',unresolved:[],userConfirmed:false});
});

it('asks about explicitly uncertain fields even when the model filled a tentative value', () => {
  const input: Extraction = {sources:[],visibleRanges:[],questions:[],events:[{id:'x',sourceIds:[],label:'Dinner',intent:'busy',startDate:'2026-10-03',endDate:'2026-10-03',startTime:'19:00',endTime:'20:30',sourceTimezone:'Asia/Taipei',allDay:false,recurrence:null,unresolved:['date','time','timezone','all_day']}]};
  let result=normalizeModelExtraction(input);
  expect(result.questions.map(q=>q.kind)).toEqual(['date','all_day','timezone']);
  result=clarifyExtraction(result,'x-all-day','指定起訖');
  expect(result.events[0].unresolved).not.toContain('all_day');
  expect(result.questions.some(q=>q.kind==='time')).toBe(true);
});
