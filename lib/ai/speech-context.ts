import type {Extraction} from '@/lib/calendar/schemas';
export type SpeechContext={timezone:string;referenceDate?:string;dateStart?:string;dateEnd?:string};
export function speechContext(input:SpeechContext={timezone:'Asia/Taipei'}):SpeechContext {
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:input.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return {...input,referenceDate:input.referenceDate??date};
}
/** Explicit single-intent speech cannot be downgraded by model annotation noise. */
export function groundSpeech(input:Extraction,text:string,context?:SpeechContext):Extraction {
 const semantic=text.replace(/(?:\bnot busy\b|不忙)/ig,' available ');
 const busy=/(?:\bbusy\b|沒空|没空|不能參加|不能参加|沒辦法|有事|不行|忙碌|不得閒|unavailable|cannot attend|can't attend|not available|not free)/i.test(semantic);
 const free=/(?:\bavailable\b|\bfree\b|有空|可以參加|可以参加|能參加|能参加)/i.test(semantic.replace(/(?:unavailable|not available|not free|不能參加|不能参加|不能參與|不能参与)/ig,''));
 const tentative=/(?:tentative|可能|暫定|暂定|不確定|不确定|maybe)/i.test(text);
 const assertedActivity=/(?:開會|开会|有會議|有会议|上課|上课|看醫生|看医生|\bmeeting\b|\bappointment\b|\bclass\b)/i.test(text);
 const single=[busy,free,tentative].filter(Boolean).length===1;
 const intent=tentative?'tentative':busy?'busy':'available';
 let events=input.events.map(event=>({...event,...(!busy&&!free&&!tentative&&!assertedActivity?{intent:'uncertain' as const}:{}),...(single?{intent:intent as 'busy'|'available'|'tentative'}:{}),sourceTimezone:event.sourceTimezone??context?.timezone??null,userConfirmed:false}));
 const allDaySpoken=/(?:全天|整天|all day|whole day)/i.test(text);
 events=events.map(event=>event.allDay&&!allDaySpoken?{...event,allDay:false,unresolved:event.startTime&&event.endTime?event.unresolved:event.unresolved.filter(f=>f!=='time').concat('time')}:event);
 const daily=/(?:每天|每日|每晚|every day|daily|every evening)/i.test(text);
 const weekdays=spokenWeekdays(text);
 const weekly=weekdays.length>0&&/(?:每(?:個|个)?[週周]|every\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))/i.test(text);
 const clock=spokenRange(text);
 // A single spoken range does not imply free/busy time before or after it.
 if(!daily&&!weekly&&single&&clock){
  const exact=events.filter(event=>event.startTime===clock.start&&event.endTime===clock.end);
  const literalDate=/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})(?:日|號|号)?/.exec(text);
  const dateCandidate=literalDate?`${literalDate[1]}-${literalDate[2].padStart(2,'0')}-${literalDate[3].padStart(2,'0')}`:context?.dateStart&&context.dateStart===context.dateEnd?context.dateStart:null;
  const stamp=dateCandidate?Date.parse(dateCandidate):NaN;
  const date=Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===dateCandidate?dateCandidate:null;
  const endDate=date&&clock.end<clock.start?new Date(stamp+86400000).toISOString().slice(0,10):date;
  const candidates=events.length?events.slice(0,1):[{id:crypto.randomUUID(),sourceIds:input.sources.map(source=>source.id),label:null,intent:intent as 'busy'|'available'|'tentative',startDate:date,endDate,startTime:clock.start,endTime:clock.end,allDay:false,recurrence:null,sourceTimezone:context?.timezone??null,unresolved:date?[]:['date'],userConfirmed:false}];
  events=exact.length?exact:candidates.map(event=>({...event,startTime:clock.start,endTime:clock.end,allDay:false,unresolved:event.unresolved.filter(field=>field!=='time')}));
 }
 if((daily||weekly)&&single&&clock){
  const start=context?.dateStart??null;
  const end=start&&clock.end<=clock.start?new Date(Date.parse(start)+86400000).toISOString().slice(0,10):start;
  events=[{id:input.events[0]?.id??crypto.randomUUID(),sourceIds:input.sources.map(s=>s.id),label:null,intent:intent as 'busy'|'available'|'tentative',startDate:start,endDate:end,startTime:clock.start,endTime:clock.end,sourceTimezone:context?.timezone??input.events[0]?.sourceTimezone??null,allDay:false,recurrence:{frequency:weekly?'weekly':'daily',interval:1,weekdays:weekly?weekdays:[],until:context?.dateEnd??null},unresolved:start?[]:['date'],userConfirmed:false}];
 }
 if(events.some(e=>e.startTime&&e.endTime)&&!/(?:全天|整天|all day|whole day)/i.test(text))events=events.filter(e=>e.startTime||e.endTime);
 const hasSpokenDate=/(?:[\d零〇一二三四五六七八九]{4}年|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|[\d一二三四五六七八九十]{1,3}月[\d一二三四五六七八九十]{1,3}[日號号]|今天|今日|明天|後天|后天|星期|週[一二三四五六日天]|周[一二三四五六日天]|\b(?:today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b)/i.test(text);
 if(!daily&&!weekly&&!hasSpokenDate){
  const onlyDay=context?.dateStart&&context.dateStart===context.dateEnd?context.dateStart:null;
  events=events.map(event=>({...event,startDate:onlyDay,endDate:onlyDay,recurrence:null,unresolved:event.unresolved.filter(f=>f!=='date').concat(onlyDay?[]:['date'])}));
 }
 const relative=[...text.matchAll(/今天|今日|明天|後天|后天|\btoday\b|\btomorrow\b|day after tomorrow/gi)];
 if(context?.referenceDate&&relative.length===1&&!/(?:\d{4}[-年/.])/.test(text)&&!daily&&!weekly){
  const token=relative[0][0].toLowerCase();const offset=/後天|后天|day after tomorrow/.test(token)?2:/明天|tomorrow/.test(token)?1:0;
  const date=new Date(Date.parse(context.referenceDate)+offset*86400000).toISOString().slice(0,10);
  events=(single&&clock?events.slice(0,1):events).map(event=>({...event,recurrence:null,startDate:date,endDate:/(?:隔天|翌日|next day)/i.test(text)?new Date(Date.parse(date)+86400000).toISOString().slice(0,10):date,unresolved:event.unresolved.filter(field=>field!=='date')}));
 }
 const seen=new Set<string>();
 events=events.filter(e=>{const key=JSON.stringify([e.intent,e.startDate,e.endDate,e.startTime,e.endTime,e.sourceTimezone,e.allDay,e.recurrence,e.startTime&&e.endTime?null:e.label]);if(seen.has(key))return false;seen.add(key);return true;});
 return {...input,...(single&&clock?{sources:input.sources.map(source=>({...source,kind:'schedule_voice' as const}))}:{}),events};
}

function spokenWeekdays(text:string):number[]{
 const values=new Set<number>();const chinese:Record<string,number>={日:0,天:0,一:1,二:2,三:3,四:4,五:5,六:6};
 for(const m of text.matchAll(/(?:星期|禮拜|礼拜|[週周])([日天一二三四五六])/g))values.add(chinese[m[1]]);
 const list=/每(?:個|个)?[週周]\s*([日天一二三四五六、，,和與与及\s]+)/.exec(text)?.[1];if(list)for(const day of list)if(day in chinese)values.add(chinese[day]);
 const names=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];for(const m of text.matchAll(/\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi))values.add(names.indexOf(m[0].toLowerCase()));
 return [...values].sort((a,b)=>a-b);
}

function numeral(value:string):number {
 if(/^\d+$/.test(value))return Number(value);
 const digits:Record<string,number>={零:0,〇:0,一:1,二:2,兩:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 if(value.includes('十')){const[a,b]=value.split('十');return (a?digits[a]:1)*10+(b?digits[b]:0);}
 return digits[value]??NaN;
}
function spokenRange(text:string):{start:string;end:string}|null {
 const matches=[...text.matchAll(/(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*([零〇一二兩两三四五六七八九十\d]{1,3})(?:[:：](\d{2})|[點点](半|[零〇一二兩两三四五六七八九十\d]{1,3}分)?|\s*(a\.?m\.?|p\.?m\.?))\s*(a\.?m\.?|p\.?m\.?)?/gi)];
 if(matches.length!==2||!/(?:到|至|[-~～–]|\bto\b)/i.test(text.slice((matches[0].index??0)+matches[0][0].length,matches[1].index)))return null;
 let period='';
 const times=matches.map(m=>{period=m[1]||(m[6]||m[5])?.toLowerCase().replace(/\./g,'')||period;let h=numeral(m[2]);const minute=m[3]?Number(m[3]):m[4]==='半'?30:m[4]?numeral(m[4].replace('分','')):0;if(/(?:下午|傍晚|晚上|pm)/.test(period)&&h<12)h+=12;if(/(?:凌晨|上午|早上|am)/.test(period)&&h===12)h=0;return Number.isInteger(h)&&h>=0&&h<24&&minute>=0&&minute<60?`${String(h).padStart(2,'0')}:${String(minute).padStart(2,'0')}`:null;});
 return times[0]&&times[1]&&times[0]!==times[1]?{start:times[0],end:times[1]}:null;
}
