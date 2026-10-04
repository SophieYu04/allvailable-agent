import type {Extraction} from './schemas';
/** Calendar screenshots represent occupied time. Only missing date/time blocks review. */
export function prepareScreenshotCards(input:Extraction,timezone='Asia/Taipei',preserveConfirmed=false):Extraction {
 const events=input.events.filter(event=>event.intent!=='available'&&event.intent!=='reminder').map(event=>{
  const unresolved:string[]=[];
  if(!event.startDate||!event.endDate||event.unresolved.includes('date'))unresolved.push('date');
  if(event.allDay!==true&&(!event.startTime||!event.endTime||event.unresolved.includes('time')))unresolved.push('time');
  return {...event,label:event.label?.trim()||'Calendar event',intent:'busy' as const,sourceTimezone:event.sourceTimezone||timezone,allDay:event.allDay===true,unresolved,userConfirmed:preserveConfirmed&&event.userConfirmed===true};
 });
 return {...input,events,questions:events.flatMap(event=>event.unresolved.map(kind=>({id:`${event.id}-${kind}`,eventId:event.id,kind:kind as 'date'|'time',prompt:kind==='date'?'請補上日期':'請補上開始與結束時間'})))};
}
