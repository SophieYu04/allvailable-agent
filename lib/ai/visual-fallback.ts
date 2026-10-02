import type {Extraction} from '@/lib/calendar/schemas';
type Observation={id:string;kind?:'calendar'|'possible'|'non_calendar';confidence?:number;events:Array<{label:string|null;startDate:string|null;endDate:string|null;startTime:string|null;endTime:string|null;allDay:boolean|null}>};
const validDate=(s:string|null)=>s&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:null;
const validTime=(s:string|null)=>s&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)?s:null;
/** A malformed second-stage answer must not discard high-confidence visual evidence. */
export function visualFallback(sources:Observation[],timezone:string):Extraction|null {
 if(!sources.length||sources.some(s=>s.kind!=='calendar'||(s.confidence??0)<.9))return null;
 const events=sources.flatMap(source=>source.events.map(item=>{
  const startDate=validDate(item.startDate),endDate=validDate(item.endDate),startTime=validTime(item.startTime),endTime=validTime(item.endTime),allDay=item.allDay===true;
  const unresolved=[...(!startDate||!endDate?['date']:[]),...(!allDay&&(!startTime||!endTime)?['time']:[])];
  if(startDate&&endDate&&endDate<startDate)unresolved.push('date');
  if(startDate&&endDate&&startTime&&endTime&&`${endDate}T${endTime}`<=`${startDate}T${startTime}`&&!allDay)unresolved.push('time');
  return {id:crypto.randomUUID(),sourceIds:[source.id],label:item.label,intent:'busy' as const,startDate,endDate,startTime,endTime,allDay,sourceTimezone:timezone,recurrence:null,unresolved,userConfirmed:false};
 }));
 return {sources:sources.map(s=>({id:s.id,kind:'calendar',reason:null})),events,questions:[],visibleRanges:[]};
}
