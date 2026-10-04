import { apiFetch } from '@/lib/api-fetch';
import type { Extraction } from './schemas';
export type ImportTransport = (path: string, init?: RequestInit) => Promise<Response>;
const english:Record<string,string>={UNAUTHENTICATED:'Please sign in again.',LIVE_SESSION_CLOSED:'This recording session has ended. Record again.',LIVE_SESSION_LIMIT:'Finish this recording, then start a new one.',LIVE_PROCESS_FAILED:'Voice processing failed. Your recording is retained. Please retry.',CLOUDFLARE_AUDIO_FAILED:'Speech recognition is temporarily unavailable. Retry the retained recording.',AUDIO_INVALID:'Recording format or size is unsupported.',AI_REQUEST_IN_PROGRESS:'Another AI import is processing. Please retry shortly.',AI_QUOTA_EXCEEDED:'Free processing limit reached. Use manual entry.',VERSION_CONFLICT:'The import changed. Please retry.',AUDIO_NO_SPEECH:'No speech detected. Please record again.',AI_DISABLED:'AI import is unavailable.',IMPORT_EXPIRED:'This import expired. Upload again.',REVIEW_REQUIRED:'Complete the card details first.',IMAGE_INVALID:'Image format or size is unsupported.'};
export function createImportTransport(fetcher:ImportTransport,language:()=>string,retries=15):ImportTransport {
 return async(path,init)=>{
  for(let attempt=0;;attempt++){
   const response=await fetcher(path,init);
   if(response.ok)return response;
   const body=await response.clone().json().catch(()=>null) as {error?:{code?:string;message?:string}}|null;
   if(response.status===409&&body?.error?.code==='AI_REQUEST_IN_PROGRESS'&&attempt<retries){
    await new Promise<void>((resolve,reject)=>{const signal=init?.signal;if(signal?.aborted){reject(signal.reason??new DOMException('Aborted','AbortError'));return;}const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},2000);signal?.addEventListener('abort',abort,{once:true});});continue;
   }
   if(language()==='en'&&body?.error){const error=body.error;error.message=english[error.code??'']??(error.message?.includes(' / ')?error.message.split(' / ').at(-1):(/[\u3400-\u9fff]/.test(error.message??'')||/^\s*[\[{]/.test(error.message??''))?'Request failed. Please retry.':error.message);return new Response(JSON.stringify(body),{status:response.status,headers:response.headers});}
   return response;
  }
 };
}
export const browserImportTransport: ImportTransport = createImportTransport(apiFetch,()=>{try{return localStorage.getItem('yuema.language')??'en';}catch{return'en';}});
export type ImportData = { importId: string; status: string; version: string; extraction: Extraction; expiresAt: string };
export type ImportPreview = { previewId: string; targetVersion: string; changes: { key: string; before: string; after: string }[] };
