import type {ImportData,ImportTransport} from './import-transport';
/** One serial model request per stable transcript snapshot, bounded by server session. */
export function createLiveVoiceClient(input:{transport:ImportTransport;gatheringId?:string;getData:()=>ImportData|null;isIdle:()=>boolean;onData:(data:ImportData)=>void;onBusy:(busy:boolean)=>void;onError:(message:string)=>void;onFinished:()=>void;delayMs?:number}){
 const key=crypto.randomUUID();let stopped=false,running=false,wanted='',processed='',finishing=false,budgetExhausted=false;
 let timer:ReturnType<typeof setTimeout>|undefined;let controller:AbortController|undefined;
 const schedule=()=>{if(stopped||running)return;clearTimeout(timer);timer=setTimeout(()=>void drain(),input.delayMs??1200);};
 async function drain(){
  if(stopped||running)return;if(!input.isIdle()){schedule();return;}
  const snapshot=wanted;const data=input.getData();
  if(budgetExhausted||!snapshot||snapshot===processed){if(finishing)await finish();return;}
  running=true;input.onBusy(true);controller=new AbortController();
  try{
   let response:Response;
   if(data?.extraction.liveVoice){response=await input.transport(`/api/calendar-imports/${data.importId}/live`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:data.version,transcript:snapshot}),signal:controller.signal});}
   else{const form=new FormData();form.set('mode','live_voice');form.set('transcript',snapshot);if(input.gatheringId)form.set('gatheringId',input.gatheringId);response=await input.transport('/api/calendar-imports',{method:'POST',headers:{'Idempotency-Key':key},body:form,signal:controller.signal});}
   const body=await response.json() as ImportData & {error?:{message?:string}};if(stopped)return;
   if(!response.ok){
    if(response.status===429){budgetExhausted=true;input.onError(body.error?.message??'Free processing limit reached');if(finishing){running=false;input.onBusy(false);schedule();}return;}
    // Reservation may have advanced a version even if inference failed. Recover it.
    if(data){const recovery=await input.transport(`/api/calendar-imports/${data.importId}`,{signal:controller.signal});if(recovery.ok){const row=await recovery.json() as ImportData & {id?:string};if(!stopped)input.onData({...row,importId:row.id??data.importId,version:String(row.version)});}}
    throw new Error(body.error?.message??'Live processing failed');
   }
   processed=snapshot;input.onData({...body,version:String(body.version)});
  }catch(error){if(!stopped)input.onError(error instanceof Error?error.message:'Live processing failed');}
  finally{running=false;input.onBusy(false);}
  if(!stopped&&(wanted!==snapshot||finishing)){if(processed===snapshot)schedule();else input.onError('請重試即時處理 / Retry live processing');}
 }
 async function finish(){
  const data=input.getData();if(stopped)return;
  if(data?.extraction.liveVoice&&!data.extraction.liveVoice.closed){
   if(!input.isIdle()){schedule();return;}
   running=true;input.onBusy(true);
   try{const r=await input.transport(`/api/calendar-imports/${data.importId}/live`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:data.version,finish:true})});const body=await r.json() as ImportData & {error?:{message?:string}};if(stopped)return;if(!r.ok)throw new Error(body.error?.message??'Finish failed');input.onData({...body,version:String(body.version)});}
   catch(error){if(!stopped)input.onError(error instanceof Error?error.message:'Finish failed');return;}
   finally{running=false;input.onBusy(false);}
  }
  if(!stopped){stopped=true;input.onFinished();}
 }
 return {offer(text:string){if(stopped)return;wanted=text.trim().slice(0,8000);schedule();},finish(text:string){if(stopped)return;finishing=true;wanted=text.trim().slice(0,8000);schedule();},retry(){schedule();},cancel(){stopped=true;clearTimeout(timer);controller?.abort();try{const previous=JSON.parse(localStorage.getItem('allvailable.cancelledUploads')??'[]');localStorage.setItem('allvailable.cancelledUploads',JSON.stringify([...previous,key].slice(-100)));}catch{}return key;}};
}
