import {expect,it} from 'vitest';
import {syntheticExtraction} from './local-import-preview';
import {eventFingerprint,mergeLiveVoice} from './live-voice';
import {patchFromEvents} from './slots';
it('keeps reviewed cards, adds new windows, and does not resurrect skipped windows',()=>{
 const base=syntheticExtraction();base.questions=[];base.events=base.events.slice(0,1).map(e=>({...e,intent:'available',startTime:'18:00',endTime:'19:00',unresolved:[],userConfirmed:true}));
 base.liveVoice={startedAt:Date.now(),calls:2,closed:false,seen:base.events.map(eventFingerprint)};
 const incoming={...base,events:[{...base.events[0],id:'duplicate',label:'different model title',userConfirmed:false},{...base.events[0],id:'new',startTime:'20:00',endTime:'21:00',userConfirmed:false}]};
 const merged=mergeLiveVoice(base,incoming,'two phrases');expect(merged.events).toHaveLength(2);expect(merged.events[0].userConfirmed).toBe(true);expect(merged.events[1].userConfirmed).toBe(false);
 const skipped={...merged,events:merged.events.slice(0,1)};expect(mergeLiveVoice(skipped,incoming,'same phrases').events).toHaveLength(1);
});

it('updates an unconfirmed interval when the complete phrase changes its intent, without duplicating it',()=>{const base=syntheticExtraction();base.questions=[];base.events=base.events.slice(0,1).map(e=>({...e,intent:'available' as const,startTime:'19:00',endTime:'20:00',unresolved:[],userConfirmed:false}));base.liveVoice={startedAt:Date.now(),calls:2,closed:false,seen:base.events.map(eventFingerprint)};const incoming={...base,events:[{...base.events[0],id:'new-model-id',intent:'busy' as const}]};const result=mergeLiveVoice(base,incoming,'完整句子說沒空');expect(result.events).toHaveLength(1);expect(result.events[0]).toMatchObject({id:base.events[0].id,intent:'busy',userConfirmed:false});});
it('replaces per-day pending cards with one recurring card from the completed cumulative phrase',()=>{
 const base=syntheticExtraction();base.questions=[];
 const event={...base.events[0],intent:'busy' as const,startDate:'2026-10-05',endDate:'2026-10-05',startTime:'19:00',endTime:'20:00',sourceTimezone:'Asia/Taipei',allDay:false,recurrence:null,unresolved:[],userConfirmed:false};
 base.events=[event,{...event,id:'day2',startDate:'2026-10-06',endDate:'2026-10-06'}];
 base.liveVoice={startedAt:Date.now(),calls:2,closed:false,seen:base.events.map(eventFingerprint)};
 const recurring={...event,id:'one-series',recurrence:{frequency:'daily' as const,interval:1,weekdays:[],until:'2026-10-09'}};
 const merged=mergeLiveVoice(base,{...base,events:[recurring]},'每天晚上七點到八點忙碌');
 expect(merged.events).toHaveLength(1);expect(merged.events[0]).toEqual(recurring);
 const cells=patchFromEvents([{...merged.events[0],userConfirmed:true}],{startDate:'2026-10-05',endDate:'2026-10-09'},{});
 expect(Object.keys(cells)).toHaveLength(10);for(const day of ['05','06','07','08','09'])expect(cells[`2026-10-${day}-19:00`]).toBe('red');
});
it('does not lose a pending card when a later transcript snapshot returns no events',()=>{
 const base=syntheticExtraction();base.questions=[];base.events=base.events.slice(0,1).map(e=>({...e,userConfirmed:false}));
 base.liveVoice={startedAt:Date.now(),calls:2,closed:false,seen:base.events.map(eventFingerprint)};
 expect(mergeLiveVoice(base,{...base,events:[]},'same retained transcript').events).toEqual(base.events);
});
