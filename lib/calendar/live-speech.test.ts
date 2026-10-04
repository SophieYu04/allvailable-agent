import {afterEach,expect,it,vi} from 'vitest';
import {startLiveSpeech,type SpeechResult} from './live-speech';
afterEach(()=>vi.unstubAllGlobals());
it('updates interim captions, restarts sessions and ignores results after cancel',()=>{
 const instances:Speech[]=[];
 class Speech {lang='';continuous=false;interimResults=false;onresult:((event:{results:SpeechResult})=>void)|null=null;onend:(()=>void)|null=null;onerror:((event:{error:string})=>void)|null=null;start=vi.fn();abort=vi.fn();constructor(){instances.push(this);}}
 vi.stubGlobal('window',{SpeechRecognition:Speech});
 const text=vi.fn(),unavailable=vi.fn();const capture=startLiveSpeech('zh-TW',text,unavailable);const instance=instances[0];
 instance.onresult!({results:[{0:{transcript:'週六'},isFinal:false}]});expect(text).toHaveBeenLastCalledWith('週六');
 instance.onresult!({results:[{0:{transcript:'週六七點'},isFinal:true}]});expect(text).toHaveBeenLastCalledWith('週六七點');
 expect(instance.lang).toBe('zh-TW');instance.onerror!({error:'no-speech'});instance.onend!();expect(instance.start).toHaveBeenCalledTimes(2);
 instance.onresult!({results:[{0:{transcript:'有空'},isFinal:false}]});expect(text).toHaveBeenLastCalledWith('週六七點有空');
 const late=instance.onresult;capture?.stop();late!({results:[{0:{transcript:'late'},isFinal:false}]});expect(text).toHaveBeenCalledTimes(3);expect(instance.abort).toHaveBeenCalledOnce();expect(unavailable).not.toHaveBeenCalled();
});
it('reports unsupported browsers without claiming live transcription',()=>{vi.stubGlobal('window',{});const unavailable=vi.fn();expect(startLiveSpeech('en-US',vi.fn(),unavailable)).toBeNull();expect(unavailable).toHaveBeenCalledOnce();});
it('failed browser recognition can be cleaned up and started again even if abort throws',()=>{
 const instances:Speech[]=[];
 class Speech {lang='';continuous=false;interimResults=false;onresult:((event:{results:SpeechResult})=>void)|null=null;onend:(()=>void)|null=null;onerror:((event:{error:string})=>void)|null=null;start=vi.fn();abort=vi.fn(()=>{throw new Error('already ended');});constructor(){instances.push(this);}}
 vi.stubGlobal('window',{SpeechRecognition:Speech});const unavailable=vi.fn();
 const first=startLiveSpeech('zh-TW',vi.fn(),unavailable);instances[0].onerror!({error:'network'});
 expect(()=>first?.stop()).not.toThrow();expect(instances[0].onerror).toBeNull();
 const text=vi.fn();const second=startLiveSpeech('zh-TW',text,unavailable);
 instances[1].onresult!({results:[{0:{transcript:'晚上七點到八點忙碌'},isFinal:true}]});
 expect(text).toHaveBeenCalledWith('晚上七點到八點忙碌');expect(()=>second?.stop()).not.toThrow();
});
