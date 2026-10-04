import {afterEach,expect,it,vi} from 'vitest';
import {createLiveVoiceClient} from './live-voice-client';
import {syntheticExtraction} from './local-import-preview';
import type {ImportData} from './import-transport';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('serializes live snapshots, uses the newest card version, and finishes without duplicate upload',async()=>{
 vi.useFakeTimers();let data:ImportData|null=null;
 const extraction=syntheticExtraction();extraction.liveVoice={startedAt:1,calls:1,closed:false,seen:[]};
 const transport=vi.fn(async(path:string,init?:RequestInit)=>{const body=typeof init?.body==='string'?JSON.parse(init.body):null;return new Response(JSON.stringify({importId:'session',status:'ready',version:data?String(Number(data.version)+1):'1',extraction:{...extraction,liveVoice:{...extraction.liveVoice,closed:Boolean(body?.finish)}}}));});
 const finished=vi.fn();const client=createLiveVoiceClient({transport,getData:()=>data,isIdle:()=>true,onData:next=>{data=next;},onBusy:vi.fn(),onError:vi.fn(),onFinished:finished});
 client.offer('first phrase');await vi.advanceTimersByTimeAsync(1300);expect(transport).toHaveBeenCalledTimes(1);
 data={...data!,version:'4'};client.offer('first phrase second phrase');await vi.advanceTimersByTimeAsync(1300);
 expect(JSON.parse(transport.mock.calls[1][1]!.body as string).version).toBe('4');
 client.finish('first phrase second phrase');await vi.advanceTimersByTimeAsync(1300);expect(transport).toHaveBeenCalledTimes(3);expect(finished).toHaveBeenCalledOnce();
});
it('ignores a late model response after cancellation',async()=>{
 vi.useFakeTimers();let complete!:(r:Response)=>void;const onData=vi.fn();
 const client=createLiveVoiceClient({transport:()=>new Promise(resolve=>{complete=resolve;}),getData:()=>null,isIdle:()=>true,onData,onBusy:vi.fn(),onError:vi.fn(),onFinished:vi.fn()});
 client.offer('spoken phrase');await vi.advanceTimersByTimeAsync(1300);client.cancel();complete(new Response(JSON.stringify({version:'1'})));await vi.advanceTimersByTimeAsync(1);expect(onData).not.toHaveBeenCalled();
});
it('retries a failed model request with the retained transcript and completes the session',async()=>{
 vi.useFakeTimers();let data:ImportData|null=null;
 const extraction=syntheticExtraction();extraction.liveVoice={startedAt:1,calls:1,closed:false,seen:[]};
 const transport=vi.fn(async(_path:string,init?:RequestInit)=>{
  if(transport.mock.calls.length===1)return new Response(JSON.stringify({error:{message:'failed'}}),{status:502});
  const body=typeof init?.body==='string'?JSON.parse(init.body):null;
  return new Response(JSON.stringify({importId:'session',status:'ready',version:'1',extraction:{...extraction,liveVoice:{...extraction.liveVoice,closed:Boolean(body?.finish)}}}));
 });const finished=vi.fn(),error=vi.fn();
 const client=createLiveVoiceClient({transport,getData:()=>data,isIdle:()=>true,onData:next=>{data=next;},onBusy:vi.fn(),onError:error,onFinished:finished});
 client.finish('tomorrow seven to eight busy');await vi.advanceTimersByTimeAsync(1300);expect(error).toHaveBeenCalled();
 client.retry();await vi.advanceTimersByTimeAsync(2600);
 expect((transport.mock.calls[1][1]?.body as FormData).get('transcript')).toBe('tomorrow seven to eight busy');
 expect(finished).toHaveBeenCalledOnce();
});
