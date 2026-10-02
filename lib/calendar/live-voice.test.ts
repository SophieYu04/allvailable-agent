import {expect,it} from 'vitest';
import {syntheticExtraction} from './local-import-preview';
import {eventFingerprint,mergeLiveVoice} from './live-voice';
it('keeps reviewed cards, adds new windows, and does not resurrect skipped windows',()=>{
 const base=syntheticExtraction();base.questions=[];base.events=base.events.slice(0,1).map(e=>({...e,intent:'available',startTime:'18:00',endTime:'19:00',unresolved:[],userConfirmed:true}));
 base.liveVoice={startedAt:Date.now(),calls:2,closed:false,seen:base.events.map(eventFingerprint)};
 const incoming={...base,events:[{...base.events[0],id:'duplicate',label:'different model title',userConfirmed:false},{...base.events[0],id:'new',startTime:'20:00',endTime:'21:00',userConfirmed:false}]};
 const merged=mergeLiveVoice(base,incoming,'two phrases');expect(merged.events).toHaveLength(2);expect(merged.events[0].userConfirmed).toBe(true);expect(merged.events[1].userConfirmed).toBe(false);
 const skipped={...merged,events:merged.events.slice(0,1)};expect(mergeLiveVoice(skipped,incoming,'same phrases').events).toHaveLength(1);
});
