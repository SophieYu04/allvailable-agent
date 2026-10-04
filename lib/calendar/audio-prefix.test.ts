import {describe,it,expect} from 'vitest';
import {encodeWave} from './audio-prefix';
describe('finalized microphone prefixes',()=>{it('writes the exact WAV duration, mono PCM headers and clipped samples',async()=>{const blob=encodeWave(new Float32Array([-2,0,2]),16000);const view=new DataView(await blob.arrayBuffer());expect(blob.type).toBe('audio/wav');expect(blob.size).toBe(50);expect(view.getUint32(4,true)).toBe(42);expect(view.getUint32(24,true)).toBe(16000);expect(view.getUint32(40,true)).toBe(6);expect(view.getInt16(44,true)).toBe(-32768);expect(view.getInt16(46,true)).toBe(0);expect(view.getInt16(48,true)).toBe(32767);});});
it('sends disjoint audio segments and returns only the final unsent tail',async()=>{
 const {observeAudioPrefixes}=await import('./audio-prefix');
 const node={connect:()=>{},disconnect:()=>{}};const processor={...node,onaudioprocess:null as ((e:{inputBuffer:{getChannelData:()=>Float32Array}})=>void)|null};
 const context={sampleRate:10,destination:{},createMediaStreamSource:()=>node,createScriptProcessor:()=>processor,createGain:()=>({...node,gain:{value:1}}),resume:async()=>{},close:async()=>{}} as unknown as AudioContext;
 const segments:Blob[]=[];const observer=observeAudioPrefixes({} as MediaStream,blob=>segments.push(blob),context)!;
 processor.onaudioprocess!({inputBuffer:{getChannelData:()=>new Float32Array(80).fill(.5)}});
 processor.onaudioprocess!({inputBuffer:{getChannelData:()=>new Float32Array(4).fill(.25)}});
 expect(segments).toHaveLength(1);expect(segments[0].size).toBe(44+160);
 const tail=observer.finish!()!;expect(tail.size).toBe(44+8);const view=new DataView(await tail.arrayBuffer());expect(view.getInt16(44,true)).toBe(8191);observer();
});
