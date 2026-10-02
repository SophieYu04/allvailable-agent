import { afterEach, expect, it, vi } from 'vitest';
import { extractCalendarText } from './openai';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function response(overrides: Record<string,unknown> = {}) {
 vi.stubEnv('NEBIUS_API_KEY','test'); vi.stubEnv('NEBIUS_MODEL','nvidia/nemotron-test');
 const extraction={sources:[{id:'voice',kind:'schedule_voice',reason:null}],events:[{id:'event',sourceIds:['voice'],label:'',intent:'available',startDate:'2026-10-03',endDate:'2026-10-03',startTime:'19:00',endTime:'21:00',sourceTimezone:null,allDay:false,recurrence:null,unresolved:[],userConfirmed:true,...overrides}],visibleRanges:[],questions:[]};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(extraction)}}]}))));
}
it('grounds an explicitly spoken Taipei timezone and keeps model output unconfirmed', async()=>{
 response();
 const result=await extractCalendarText('2026年10月3日晚上七點到九點有空，時區是台北。');
 expect(result.events[0]).toMatchObject({sourceTimezone:'Asia/Taipei',label:null,userConfirmed:false,intent:'available'});
});
it('does not silently assign a timezone or invent missing dates', async()=>{
 response({startDate:null,endDate:null});
 expect((await extractCalendarText('我晚上七點有空')).events[0]).toMatchObject({startDate:null,endDate:null,sourceTimezone:null,userConfirmed:false});
});
it('rejects invalid model dates before they reach the calendar', async()=>{
 response({startDate:'二零二六年十月三日'});
 await expect(extractCalendarText('合成日期測試')).rejects.toThrow('NEBIUS_AUDIO_SCHEMA_INVALID');
});
