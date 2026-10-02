import {afterEach,expect,it,vi} from 'vitest';
import {startLiveSpeech} from './live-speech';
afterEach(()=>vi.unstubAllGlobals());
it('updates interim captions, restarts sessions and ignores results after cancel',()=>{
 let instance:any;
 class Speech {onresult:any;onend:any;onerror:any;start=vi.fn();abort=vi.fn();constructor(){instance=this;}}
 vi.stubGlobal('window',{SpeechRecognition:Speech});
 const text=vi.fn(),unavailable=vi.fn();const capture=startLiveSpeech('zh-TW',text,unavailable);
 instance.onresult({results:[{0:{transcript:'週六'},isFinal:false}]});expect(text).toHaveBeenLastCalledWith('週六');
 instance.onresult({results:[{0:{transcript:'週六七點'},isFinal:true}]});expect(text).toHaveBeenLastCalledWith('週六七點');
 instance.onend();expect(instance.start).toHaveBeenCalledTimes(2);
 instance.onresult({results:[{0:{transcript:'有空'},isFinal:false}]});expect(text).toHaveBeenLastCalledWith('週六七點有空');
 const late=instance.onresult;capture?.stop();late({results:[{0:{transcript:'late'}}]});expect(text).toHaveBeenCalledTimes(3);expect(instance.abort).toHaveBeenCalledOnce();expect(unavailable).not.toHaveBeenCalled();
});
it('reports unsupported browsers without claiming live transcription',()=>{vi.stubGlobal('window',{});const unavailable=vi.fn();expect(startLiveSpeech('en-US',vi.fn(),unavailable)).toBeNull();expect(unavailable).toHaveBeenCalledOnce();});
