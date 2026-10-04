import type {Extraction} from './schemas';
import {occurrenceDates} from './slots';
export const LIVE_VOICE_CALL_LIMIT=8;
export const LIVE_VOICE_WINDOW_MS=180_000;
/** Titles are optional on availability. Identity is the actual interval/status. */
export function eventFingerprint(event:Extraction['events'][number]) {
 return JSON.stringify([event.intent,event.startDate,event.endDate,event.startTime,event.endTime,event.sourceTimezone,event.allDay,event.recurrence, event.startDate && (event.allDay||event.startTime)?null:event.label]);
}
export function mergeLiveVoice(current:Extraction,incoming:Extraction,transcript:string):Extraction {
 if(!current.liveVoice)throw new Error('LIVE_SESSION_REQUIRED');
 const seen=new Set(current.liveVoice.seen);
 // Every request contains the cumulative transcript. Replace pending fragments
 // with its latest complete interpretation, while preserving reviewed decisions.
 const incomingKeys=new Set(incoming.events.map(eventFingerprint));
 const superseded=current.events.filter(old=>old.userConfirmed!==true&&!incomingKeys.has(eventFingerprint(old))&&incoming.events.some(next=>{
  if(next.intent!==old.intent||next.startTime!==old.startTime||next.endTime!==old.endTime||next.sourceTimezone!==old.sourceTimezone||next.allDay!==old.allDay||!next.startDate||next.unresolved.length)return false;
  if(!old.startDate)return true;
  return next.recurrence?occurrenceDates(next,{startDate:next.startDate,endDate:next.recurrence.until??next.startDate}).includes(old.startDate):next.startDate===old.startDate;
 }));
 const supersededIds=new Set(superseded.map(event=>event.id));
 const sameInterval=(old:Extraction['events'][number],event:Extraction['events'][number])=>old.startDate===event.startDate&&old.endDate===event.endDate&&old.startTime===event.startTime&&old.endTime===event.endTime&&old.sourceTimezone===event.sourceTimezone&&old.allDay===event.allDay&&JSON.stringify(old.recurrence)===JSON.stringify(event.recurrence);
 let events=current.events.filter(event=>!supersededIds.has(event.id)||incoming.events.some(next=>sameInterval(event,next)));
 let questions=current.questions.filter(question=>!question.eventId||events.some(event=>event.id===question.eventId));
 for(const event of superseded)if(!events.some(kept=>kept.id===event.id))seen.delete(eventFingerprint(event));
 for(const event of incoming.events){
  if(event.allDay&&event.intent==='available')continue;
  const key=eventFingerprint(event);
  const pending=events.filter(old=>old.userConfirmed!==true&&old.startDate===event.startDate&&old.endDate===event.endDate&&old.startTime===event.startTime&&old.endTime===event.endTime&&old.sourceTimezone===event.sourceTimezone&&old.allDay===event.allDay&&JSON.stringify(old.recurrence)===JSON.stringify(event.recurrence));
  const previous=pending.length===1?pending[0]:undefined;
  if(seen.has(key)&&(!previous||eventFingerprint(previous)===key))continue;
  seen.add(key);
  const next=previous?{...event,id:previous.id}:event;
  if(previous){events=events.map(old=>old.id===previous.id?next:old);questions=questions.filter(q=>q.eventId!==previous.id);}
  else events.push(next);
  questions.push(...incoming.questions.filter(q=>q.eventId===event.id).map(q=>({...q,id:previous?`${next.id}-${q.kind}`:q.id,eventId:next.id})));
 }
 if(seen.size>100)throw new Error('LIVE_EVENT_LIMIT');
 const allSources=[...current.sources,...incoming.sources];const sourceIds=new Set(events.flatMap(event=>event.sourceIds));
 return {...current,transcript,liveVoice:{...current.liveVoice,seen:[...seen]},sources:allSources.filter((source,index)=>sourceIds.has(source.id)&&allSources.findIndex(s=>s.id===source.id)===index),events,questions};
}
