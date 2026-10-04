import {expect,it}from'vitest';import{prepareScreenshotCards}from'./screenshot-cards';import{syntheticExtraction}from'./local-import-preview';
it('makes recognized calendar intervals Busy and only requests missing dates or times',()=>{
 const e=syntheticExtraction();e.events=e.events.slice(0,1).map(event=>({...event,intent:'busy',startTime:'09:00',endTime:'10:30',sourceTimezone:null,allDay:false,unresolved:['title','timezone','all_day']}));
 const result=prepareScreenshotCards(e);expect(result.questions).toEqual([]);expect(result.events[0]).toMatchObject({intent:'busy',startTime:'09:00',endTime:'10:30',sourceTimezone:'Asia/Taipei',userConfirmed:false});
});
it('does not fabricate time ranges and preserves already-reviewed cards on recovery',()=>{
 const e=syntheticExtraction();e.events=e.events.slice(0,1).map(event=>({...event,intent:'busy',startDate:null,endDate:null,userConfirmed:true}));
 const result=prepareScreenshotCards(e,'Asia/Taipei',true);expect(result.questions.map(q=>q.kind)).toEqual(['date','time']);expect(result.events[0].startTime).toBeNull();expect(result.events[0].userConfirmed).toBe(true);
});
it('does not turn an empty available day into an all-day Busy card',()=>{const e=syntheticExtraction();e.events=e.events.slice(0,1).map(event=>({...event,intent:'available',allDay:true}));expect(prepareScreenshotCards(e).events).toEqual([]);});
