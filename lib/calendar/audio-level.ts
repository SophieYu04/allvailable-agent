/** Local microphone energy only: no audio playback or network transmission. */
export function microphoneLevel(samples: Float32Array) {
  if (!samples.length) return 0;
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  if (rms <= 0.001) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 60));
}
export function observeMicrophoneLevel(stream: MediaStream, onLevel: (level: number) => void, sharedContext?: AudioContext): () => void {
  const Constructor = (window as unknown as {AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext}).AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!sharedContext && !Constructor) { onLevel(0); return () => {}; }
  const context = sharedContext ?? new Constructor!();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let frame = 0, stopped = false, previous = 0, lastUpdate = 0;
  void context.resume().catch(() => {});
  function sample(now: number) {
    if (stopped) return;
    analyser.getFloatTimeDomainData(samples);
    previous = Math.max(microphoneLevel(samples), previous * 0.8);
    if (now - lastUpdate >= 80) { onLevel(previous); lastUpdate = now; }
    frame = requestAnimationFrame(sample);
  }
  frame = requestAnimationFrame(sample);
  return () => {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(frame);
    source.disconnect(); analyser.disconnect();
    if (!sharedContext) void context.close().catch(() => {});
    onLevel(0);
  };
}
