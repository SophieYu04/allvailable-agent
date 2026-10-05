import type {Extraction} from '@/lib/calendar/schemas';
import {groundSpeech,speechContext,type SpeechContext} from './speech-context';
/** Only a fully specified, single scheduling sentence can bypass the model. */
export function fastSpeech(text:string,input?:SpeechContext):Extraction|null{
 if(!input||text.length>160||/(?:但是|除了|除外|不要|取消|改成|而是|except|instead|change|cancel|ignore|not busy|不忙)/i.test(text))return null;
 const intentGroups=[/(?:忙碌|沒空|忙|\bbusy\b|unavailable)/i,/(?:有空|\bavailable\b|\bfree\b|\bcan do it\b)/i,/(?:暫定|tentative)/i].filter(re=>re.test(text));
 if(intentGroups.length!==1)return null;
 // No unsupported words or second date/window may be silently discarded.
 const allowed=/^(?:(?:今天|明天|後天|每天|每晚|今日)|(?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}[日號]?))\s*(?:凌晨|早上|上午|下午|晚上|傍晚)?\s*[零〇一二兩三四五六七八九十\d]{1,3}(?:[:：]\d{2}|點(?:半|[零〇一二三四五六七八九十\d]{1,3}分)?)\s*(?:到|至|[-~～–])\s*(?:凌晨|早上|上午|下午|晚上|傍晚)?\s*[零〇一二兩三四五六七八九十\d]{1,3}(?:[:：]\d{2}|點(?:半|[零〇一二三四五六七八九十\d]{1,3}分)?)\s*(?:忙碌|沒空|有空|暫定|busy|available|free|tentative)[。.!！]?$/i;
 const english=/^(?:today|tomorrow|every day)\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:to|[-~–])\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\s+(?:busy|available|free|tentative)[.!]?$/i;
 const spokenEnglish=/^I can do it every day between\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\s+(?:to|and)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)[.!]?$/i;
 if(!allowed.test(text.trim())&&!english.test(text.trim())&&!spokenEnglish.test(text.trim()))return null;
 const seed:Extraction={sources:[{id:crypto.randomUUID(),kind:'schedule_voice',reason:null}],events:[],questions:[],visibleRanges:[]};
 const result=groundSpeech(seed,text.trim(),speechContext(input));
 if(result.events.length!==1||result.events.some(e=>!e.startDate||!e.endDate||!e.startTime||!e.endTime||e.unresolved.length||e.recurrence&&!e.recurrence.until))return null;
 return result;
}
export function speechDelta(previous:string,next:string){
 if(previous&&next.startsWith(previous)){const delta=next.slice(previous.length).trim().replace(/^[，,。.!！\s]+/,'');if(delta)return delta;}
 return next;
}
