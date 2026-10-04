import { afterEach, expect, it, vi } from 'vitest';
import { createAudioCapture } from './audio-capture';
function fake() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const media = { stream, state: 'inactive', mimeType: 'audio/mp4;codecs=mp4a', onstop: null as (() => void) | null, ondataavailable: null as ((event: {data: Blob}) => void) | null,
    start() { this.state = 'recording'; }, stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['synthetic audio']) }); this.onstop?.(); } };
  return { track, stream, media, create: () => media as unknown as MediaRecorder };
}
afterEach(() => vi.useRealTimers());
it('normal stop releases microphone and emits one normalized recording', async () => {
  const f = fake(); const done = vi.fn(); const capture = createAudioCapture({ acquire: async () => f.stream, create: f.create });
  await capture.start(done, vi.fn()); capture.stop(); capture.stop();
  expect(done).toHaveBeenCalledTimes(1); expect(done.mock.calls[0][1]).toBe('audio/mp4'); expect(f.track.stop).toHaveBeenCalled(); expect(capture.isActive()).toBe(false);
});
it('cancel/navigation stops tracks without uploading or completing', async () => {
  const f = fake(); const done = vi.fn(); const capture = createAudioCapture({ acquire: async () => f.stream, create: f.create });
  await capture.start(done, vi.fn()); const lateStop = f.media.onstop; capture.cancel(); lateStop?.();
  expect(done).not.toHaveBeenCalled(); expect(f.track.stop).toHaveBeenCalled(); expect(capture.isActive()).toBe(false);
});
it('late microphone permission after cancellation is immediately released', async () => {
  const f = fake(); let resolve!: (stream: MediaStream) => void;
  const done = vi.fn(); const capture = createAudioCapture({ acquire: () => new Promise(r => { resolve = r; }), create: f.create });
  const pending = capture.start(done, vi.fn()); capture.cancel(); resolve(f.stream); await pending;
  expect(f.track.stop).toHaveBeenCalled(); expect(done).not.toHaveBeenCalled(); expect(f.media.state).toBe('inactive');
});
it('denial unlocks capture for a retry and duplicate starts do not reacquire', async () => {
  const f = fake(); const acquire = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(f.stream);
  const capture = createAudioCapture({ acquire, create: f.create });
  await expect(capture.start(vi.fn(), vi.fn())).rejects.toThrow('denied'); expect(capture.isActive()).toBe(false);
  await capture.start(vi.fn(), vi.fn()); await capture.start(vi.fn(), vi.fn()); expect(acquire).toHaveBeenCalledTimes(2); capture.cancel();
});
it('the 60-second limit stops once and releases the microphone', async () => {
  vi.useFakeTimers(); const f = fake(); const done = vi.fn(); const capture = createAudioCapture({ acquire: async () => f.stream, create: f.create });
  await capture.start(done, vi.fn()); vi.advanceTimersByTime(60000);
  expect(done).toHaveBeenCalledTimes(1); expect(f.track.stop).toHaveBeenCalled(); expect(capture.isActive()).toBe(false);
});

it('a stale stop callback cannot cancel the timer of a newer recording', async () => {
  vi.useFakeTimers(); const first = fake(), second = fake();
  const acquire = vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
  const create = vi.fn().mockReturnValueOnce(first.media).mockReturnValueOnce(second.media);
  const capture = createAudioCapture({ acquire, create }); const done = vi.fn();
  await capture.start(done, vi.fn()); const oldStop = first.media.onstop; capture.cancel();
  await capture.start(done, vi.fn()); oldStop?.(); vi.advanceTimersByTime(60000);
  expect(done).toHaveBeenCalledTimes(1); expect(second.track.stop).toHaveBeenCalled();
});
it('observes the existing recording stream and stops metering on stop and cancel',async()=>{
 const f=fake(),cleanup=vi.fn(),level=vi.fn();const observe=vi.fn((stream:MediaStream,onLevel:(n:number)=>void)=>{expect(stream).toBe(f.stream);onLevel(.6);return cleanup;});
 const capture=createAudioCapture({acquire:async()=>f.stream,create:f.create,observe});
 await capture.start(vi.fn(),vi.fn(),level);expect(level).toHaveBeenCalledWith(.6);capture.stop();expect(cleanup).toHaveBeenCalledTimes(1);
 await capture.start(vi.fn(),vi.fn(),level);capture.cancel();expect(cleanup).toHaveBeenCalledTimes(2);
});

it('offers complete growing recordings with the container header, not broken standalone chunks',async()=>{vi.useFakeTimers();const f=fake(),progress=vi.fn();const capture=createAudioCapture({acquire:async()=>f.stream,create:f.create});await capture.start(vi.fn(),vi.fn(),undefined,progress);f.media.ondataavailable?.({data:new Blob(['HEADER'])});vi.advanceTimersByTime(5000);f.media.ondataavailable?.({data:new Blob(['FRAME'])});expect(progress).toHaveBeenCalledTimes(1);expect(await progress.mock.calls[0][0].text()).toBe('HEADERFRAME');capture.cancel();vi.advanceTimersByTime(5000);f.media.ondataavailable?.({data:new Blob(['LATE'])});expect(progress).toHaveBeenCalledTimes(1);});
it('can record again after a completed clip fails downstream recognition',async()=>{
 const first=fake(),second=fake(),clips:Blob[]=[];
 const acquire=vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
 const create=vi.fn().mockReturnValueOnce(first.media).mockReturnValueOnce(second.media);
 const capture=createAudioCapture({acquire,create});
 const done=vi.fn((clip:Blob)=>clips.push(clip));
 await capture.start(done,vi.fn());capture.stop();
 expect(capture.isActive()).toBe(false);expect(clips[0].size).toBeGreaterThan(0);
 await capture.start(done,vi.fn());expect(capture.isActive()).toBe(true);capture.stop();
 expect(done).toHaveBeenCalledTimes(2);expect(acquire).toHaveBeenCalledTimes(2);expect(second.track.stop).toHaveBeenCalled();
});
it('unlocks one audio context before microphone permission and retains final PCM samples for transcription',async()=>{
 const order:string[]=[];const f=fake();const done=vi.fn();
 const processor={onaudioprocess:null as ((e:{inputBuffer:{getChannelData:()=>Float32Array}})=>void)|null,connect:vi.fn(),disconnect:vi.fn()};
 const source={connect:vi.fn(),disconnect:vi.fn()},gain={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};
 const close=vi.fn(async()=>{}),resume=vi.fn(async()=>{order.push('resume');});
 class Context {sampleRate=16000;destination={};resume=resume;close=close;constructor(){order.push('context');}createMediaStreamSource(){return source;}createScriptProcessor(){return processor;}createGain(){return gain;}}
 vi.stubGlobal('window',{AudioContext:Context});
 try{
  const capture=createAudioCapture({acquire:async()=>{order.push('acquire');return f.stream;},create:f.create,observe:()=>()=>{}});
  await capture.start(done,vi.fn(),vi.fn(),vi.fn());
  expect(order.slice(0,3)).toEqual(['context','resume','acquire']);
  processor.onaudioprocess!({inputBuffer:{getChannelData:()=>new Float32Array([.5,-.5])}});
  capture.stop();expect(done.mock.calls[0][1]).toBe('audio/wav');
  const wave=new DataView(await done.mock.calls[0][0].arrayBuffer());expect(wave.getUint32(40,true)).toBe(4);expect(wave.getInt16(44,true)).toBe(16383);
  expect(close).toHaveBeenCalledOnce();expect(processor.onaudioprocess).toBeNull();
 }finally{vi.unstubAllGlobals();}
});
