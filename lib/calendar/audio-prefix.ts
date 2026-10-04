/** A finalized WAV prefix avoids incomplete MediaRecorder containers at the speech API. */
export function encodeWave(samples:Float32Array,sampleRate:number):Blob{
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
 const tag=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 tag(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,s<0?s*32768:s*32767,true);}return new Blob([buffer],{type:'audio/wav'});
}
export function observeAudioPrefixes(stream:MediaStream,onProgress:(blob:Blob,mime:string)=>void,sharedContext?:AudioContext):((()=>void)&{finish?:()=>Blob|null})|null{
 const Constructor=typeof window==='undefined'?undefined:(window as unknown as {AudioContext?:typeof AudioContext;webkitAudioContext?:typeof AudioContext}).AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 if(!sharedContext&&!Constructor)return null;
 const context=sharedContext??new Constructor!(),source=context.createMediaStreamSource(stream),processor=context.createScriptProcessor(4096,1,1),silence=context.createGain();silence.gain.value=0;
 const chunks:Float32Array[]=[];let count=0,silent=0,active=true;
 processor.onaudioprocess=event=>{if(!active)return;const chunk=event.inputBuffer.getChannelData(0).slice();chunks.push(chunk);count+=chunk.length;const rms=Math.sqrt(chunk.reduce((sum,value)=>sum+value*value,0)/chunk.length);silent=rms<.008?silent+chunk.length:0;
  if((count>=context.sampleRate*1.5&&silent>=context.sampleRate*.35)||count>=context.sampleRate*8){const all=new Float32Array(count);let offset=0;for(const data of chunks){all.set(data,offset);offset+=data.length;}chunks.length=0;count=0;silent=0;onProgress(encodeWave(all,context.sampleRate),'audio/wav');}
 };
 source.connect(processor);processor.connect(silence);silence.connect(context.destination);void context.resume().catch(()=>{});
 const finish=()=>{const all=new Float32Array(count);let offset=0;for(const data of chunks){all.set(data,offset);offset+=data.length;}return encodeWave(all,context.sampleRate);};
 const stop=()=>{active=false;processor.onaudioprocess=null;source.disconnect();processor.disconnect();silence.disconnect();chunks.length=0;if(!sharedContext)void context.close().catch(()=>{});};
 return Object.assign(stop,{finish});
}
