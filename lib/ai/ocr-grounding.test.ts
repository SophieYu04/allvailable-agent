import { expect, it } from 'vitest';
import { groundOcrEvents } from './ocr-grounding';
import type { Extraction } from '@/lib/calendar/schemas';
const event: Extraction['events'][number] = { id:'e',sourceIds:['s'],label:'和 Maya 吃晚餐',intent:'uncertain',startDate:null,endDate:null,startTime:null,endTime:null,sourceTimezone:null,allDay:null,recurrence:null,unresolved:['title','date','time'] };
it('uses one literal full-date header and a verbatim title while keeping times unknown',()=>{
  expect(groundOcrEvents([event],[{id:'s',text:'我的一天\n2026 年 10 月 3 日（星期六）\n和 Maya 吃晚餐'}])[0]).toMatchObject({startDate:'2026-10-03',endDate:'2026-10-03',startTime:null,endTime:null,unresolved:['time'],userConfirmed:false});
});
it('does not guess missing years, ambiguous headers, dates in a sentence, or another source’s date',()=>{
  for(const source of [{id:'s',text:'10 月 3 日\n和 Maya 吃晚餐'},{id:'s',text:'2026-10-03\n2026-10-04\n和 Maya 吃晚餐'},{id:'s',text:'Maya mentioned 2026-10-03'},{id:'other',text:'2026-10-03'}]) expect(groundOcrEvents([event],[source])[0].startDate).toBeNull();
});
it('recognizes an explicitly dated deadline without treating its clock as a busy interval',()=>{
  expect(groundOcrEvents([{...event,label:'交研究報告 · 期限今天 23:59'}],[{id:'s',text:'2026 年 10 月 3 日\n交研究報告 · 期限今天 23:59'}])[0]).toMatchObject({intent:'reminder',startTime:null,endTime:null});
});
