import{expect,it}from'vitest';import fixtures from'./fixtures/spoken-calendar-regressions.json';import{groundSpeech}from'./speech-context';import{normalizeModelExtraction}from'./import-normalization';import{extractionSchema}from'@/lib/calendar/schemas';
const context={timezone:'Asia/Taipei',referenceDate:'2026-10-03',dateStart:'2026-10-07',dateEnd:'2026-10-09'};
it.each(fixtures)('replays real provider output safely: $name',item=>{const result=normalizeModelExtraction(groundSpeech(extractionSchema.parse(item.extraction),item.text,context));
 const expected=item.name==='Available + Tentative'?2:1;expect(result.events).toHaveLength(expected);expect(result.events.every(e=>e.userConfirmed===false&&e.sourceTimezone==='Asia/Taipei')).toBe(true);
 if(item.name==='媒體原句'){expect(result.events[0]).toMatchObject({startDate:null,endDate:null,intent:'busy',startTime:'19:00',endTime:'20:00'});expect(result.questions.map(q=>q.kind)).toEqual(['date']);}
 else {expect(result.questions).toEqual([]);if(item.name==='跨日')expect(result.events[0]).toMatchObject({startDate:'2026-10-07',endDate:'2026-10-08',startTime:'23:00',endTime:'01:00',intent:'busy'});else if(item.name==='每天')expect(result.events[0].recurrence).toMatchObject({frequency:'daily',until:'2026-10-09'});else if(item.name==='明天')expect(result.events[0].startDate).toBe('2026-10-04');else if(item.name==='Available + Tentative')expect(result.events.map(e=>e.intent)).toEqual(['available','tentative']);else expect(result.events[0]).toMatchObject({intent:'busy',startDate:'2026-10-07',endDate:'2026-10-07',startTime:'19:00',endTime:'20:00'});}
});
it('tomorrow is one card on the Taipei reference date plus one day, never a daily series',()=>{
 const fixture=fixtures[0];
 const input=extractionSchema.parse(structuredClone(fixture.extraction));
 input.events=[...input.events,...input.events.map(e=>({...e,id:'duplicate-day',startDate:'2026-10-06',endDate:'2026-10-06'}))];
 const result=groundSpeech(input,'明天晚上七點到八點忙碌',{timezone:'Asia/Taipei',referenceDate:'2026-10-04',dateStart:'2026-10-05',dateEnd:'2026-10-09'});
 expect(result.events).toHaveLength(1);expect(result.events[0]).toMatchObject({startDate:'2026-10-05',endDate:'2026-10-05',startTime:'19:00',endTime:'20:00',intent:'busy',recurrence:null});
});
