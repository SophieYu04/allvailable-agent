/** A finalized WAV prefix avoids incomplete MediaRecorder containers at the speech API. */
export function encodeWave(samples:Float32Array,sampleRate:number):Blob{
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
 const tag=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 tag(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,s<0?s*32768:s*32767,true);}return new Blob([buffer],{type:'audio/wav'});
}
export function observeAudioPrefixes(stream:MediaStream,onProgress:(blob:Blob,mime:string)=>void):(()=>void)|null{
 if(typeof AudioContext==='undefined')return null;
 const context=new AudioContext(),source=context.createMediaStreamSource(stream),processor=context.createScriptProcessor(4096,1,1),silence=context.createGain();silence.gain.value=0;
 const chunks:Float32Array[]=[];let count=0,last=0,active=true;
 processor.onaudioprocess=event=>{if(!active)return;const chunk=event.inputBuffer.getChannelData(0).slice();chunks.push(chunk);count+=chunk.length;
  if(count-last>=context.sampleRate*5){last=count;const all=new Float32Array(count);let offset=0;for(const data of chunks){all.set(data,offset);offset+=data.length;}onProgress(encodeWave(all,context.sampleRate),'audio/wav');}
 };
 source.connect(processor);processor.connect(silence);silence.connect(context.destination);void context.resume().catch(()=>{});
 return()=>{active=false;processor.onaudioprocess=null;source.disconnect();processor.disconnect();silence.disconnect();chunks.length=0;void context.close().catch(()=>{});};
}
