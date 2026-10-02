import type {Extraction} from './schemas';
export const LIVE_VOICE_CALL_LIMIT=8;
export const LIVE_VOICE_WINDOW_MS=180_000;
/** Titles are optional on availability. Identity is the actual interval/status. */
export function eventFingerprint(event:Extraction['events'][number]) {
 return JSON.stringify([event.intent,event.startDate,event.endDate,event.startTime,event.endTime,event.sourceTimezone,event.allDay,event.recurrence, event.startDate && (event.allDay||event.startTime)?null:event.label]);
}
export function mergeLiveVoice(current:Extraction,incoming:Extraction,transcript:string):Extraction {
 if(!current.liveVoice)throw new Error('LIVE_SESSION_REQUIRED');
 const seen=new Set(current.liveVoice.seen);
 const events=incoming.events.filter(event=>{const key=eventFingerprint(event);if(seen.has(key))return false;seen.add(key);return true;});
 if(seen.size>100)throw new Error('LIVE_EVENT_LIMIT');
 const ids=new Set(events.map(e=>e.id));
 return {...current,transcript,liveVoice:{...current.liveVoice,seen:[...seen]},
 sources:[...current.sources.filter(s=>current.events.some(e=>e.sourceIds.includes(s.id))),...incoming.sources.filter(s=>events.some(e=>e.sourceIds.includes(s.id)))],
 events:[...current.events,...events],questions:[...current.questions,...incoming.questions.filter(q=>q.eventId!==null&&ids.has(q.eventId))]};
}
