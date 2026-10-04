import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser} from '@/lib/server/auth';
import {jsonError,nextDecimalVersion} from '@/lib/server/http';
import {extractionSchema} from '@/lib/calendar/schemas';
import {fastSpeech,speechDelta} from '@/lib/ai/fast-speech';
import {analyzeImport} from '@/lib/ai/service';
import {mergeLiveVoice,LIVE_VOICE_CALL_LIMIT,LIVE_VOICE_WINDOW_MS} from '@/lib/calendar/live-voice';
const input=z.object({version:z.string().regex(/^\d+$/),transcript:z.string().trim().min(1).max(8000).optional(),finish:z.boolean().optional()}).strict();
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 let auth:Awaited<ReturnType<typeof requireUser>>;
 try{auth=await requireUser(request);}catch{return jsonError(401,'UNAUTHENTICATED','請先登入');}
 if(process.env.AI_IMPORT_ENABLED!=='true')return jsonError(503,'AI_DISABLED','AI 尚未開放');
 const body=input.safeParse(await request.json().catch(()=>null));
 if(!body.success||(!body.data.finish&&!body.data.transcript))return jsonError(400,'LIVE_INPUT_INVALID','請提供逐字稿');
 const {id}=await context.params;const {supabase,user}=auth;
 const {data:row,error}=await supabase.from('calendar_imports').select('*').eq('id',id).eq('user_id',user.id).single();
 if(error||!row)return jsonError(404,'IMPORT_NOT_FOUND','找不到錄音');
 const current=extractionSchema.parse(row.extraction);
 const session=current.liveVoice;
 if(!session||session.closed||new Date(row.expires_at).getTime()<=Date.now())return jsonError(410,'LIVE_SESSION_CLOSED','這段錄音已結束');
 if(String(row.version)!==body.data.version)return jsonError(409,'VERSION_CONFLICT','卡片已更新，請重試',true);
 const respond=(data:typeof row)=>NextResponse.json({importId:data.id,status:data.status,version:String(data.version),extraction:data.extraction,expiresAt:data.expires_at});
 if(body.data.finish){
  const {data,error}=await supabase.from('calendar_imports').update({status:current.events.length?row.status:'rejected',extraction:{...current,liveVoice:{...session,closed:true}},version:nextDecimalVersion(row.version)}).eq('id',id).eq('user_id',user.id).eq('version',row.version).select('*').single();
  return error||!data?jsonError(409,'VERSION_CONFLICT','卡片已更新',true):respond(data);
 }
 if(session.calls>=LIVE_VOICE_CALL_LIMIT||Date.now()-session.startedAt>LIVE_VOICE_WINDOW_MS)return jsonError(429,'LIVE_SESSION_LIMIT','此段錄音已達處理上限，請确认已有卡片',false);
 if(body.data.transcript===current.transcript)return respond(row);
 // Each inference also consumes an independent daily quota, so editable import
 // metadata cannot bypass the provider usage ceiling.
 const requestKey=request.headers.get('Idempotency-Key')??'';
 const lockId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)?requestKey:crypto.randomUUID();
 const {data:locked,error:lockError}=await supabase.rpc('acquire_ai_request',{p_request_id:lockId});
 if(lockError||locked!==true)return jsonError(409,'AI_REQUEST_IN_PROGRESS','另一段辨識正在處理',true);
 try{
 const {data:quota,error:quotaError}=await supabase.rpc('consume_ai_quota',{p_idempotency_key:crypto.randomUUID(),p_user_limit:Number(process.env.AI_DAILY_USER_LIMIT??3),p_global_limit:Number(process.env.AI_DAILY_GLOBAL_LIMIT??120)});
 if(quotaError)return jsonError(503,'QUOTA_UNAVAILABLE','目前無法確認用量',true);
 if(!(quota as {allowed?:boolean}|null)?.allowed)return jsonError(429,'AI_QUOTA_EXCEEDED','今日免費處理次數已用完；請完成錄音，再手動補上其餘時間');
  // Reserve a call before inference. Concurrent or failed requests cannot bypass the cap.
  const reserved={...current,liveVoice:{...session,calls:session.calls+1}};
  const version=nextDecimalVersion(row.version);
  const {data:reservation,error:reserveError}=await supabase.from('calendar_imports').update({extraction:reserved,version}).eq('id',id).eq('user_id',user.id).eq('version',row.version).select('id').single();
  if(reserveError||!reservation)return jsonError(409,'VERSION_CONFLICT','卡片已更新',true);
  let speechContext:{timezone:string;dateStart?:string;dateEnd?:string}={timezone:'Asia/Taipei'};
  if(row.gathering_id){const {data:gathering}=await supabase.from('gatherings').select('date_start,date_end').eq('id',row.gathering_id).single();if(gathering)speechContext={timezone:'Asia/Taipei',dateStart:gathering.date_start,dateEnd:gathering.date_end};}
  const delta=speechDelta(current.transcript??'',body.data.transcript!);
  const direct=fastSpeech(delta,speechContext);
  const parsed=direct??await analyzeImport({transcript:direct?delta:(delta!==body.data.transcript&&!/(?:今天|明天|後天|每天|\d{4}|tomorrow|today|every)/i.test(delta)?body.data.transcript:delta),speechContext});
  const {data:stillActive}=await supabase.rpc('ai_request_is_active',{p_request_id:lockId});
  if(stillActive!==true)return jsonError(409,'AI_CANCELLED','Cancelled.');
  const events=parsed.events.filter(e=>e.intent!=='uncertain'&&(e.allDay===true||e.startTime&&e.endTime));const ids=new Set(events.map(e=>e.id));
  const incoming={...parsed,events,questions:parsed.questions.filter(q=>q.eventId&&ids.has(q.eventId))};
  const merged=mergeLiveVoice(reserved,incoming,body.data.transcript!);
  const {data,error}=await supabase.from('calendar_imports').update({extraction:merged,status:merged.questions.length?'needs_clarification':'ready',version:nextDecimalVersion(version)}).eq('id',id).eq('user_id',user.id).eq('version',version).select('*').single();
  return error||!data?jsonError(409,'VERSION_CONFLICT','卡片已更新，請重試',true):respond(data);
 }catch{return jsonError(502,'LIVE_PROCESS_FAILED','即時辨識失敗，請重試；錄音仍保留',true);}
 finally{await supabase.rpc('release_ai_request',{p_request_id:lockId});}
}
