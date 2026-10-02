import {observeMicrophoneLevel} from './audio-level';
type Dependencies = { acquire: () => Promise<MediaStream>; create: (stream: MediaStream) => MediaRecorder; observe?: typeof observeMicrophoneLevel };
export function createAudioCapture(deps: Dependencies = { acquire: () => navigator.mediaDevices.getUserMedia({ audio: true }), create: stream => new MediaRecorder(stream) }) {
  let generation = 0;
  let media: MediaRecorder | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let stopLevel: (() => void) | null = null;
  const release = (recorder: MediaRecorder) => recorder.stream.getTracks().forEach(track => track.stop());
  const cancel = () => {
    generation++; active = false;
    stopLevel?.(); stopLevel = null;
    if (timer) clearTimeout(timer);
    timer = null;
    if (media) { media.onstop = null; media.ondataavailable = null; if (media.state !== 'inactive') media.stop(); release(media); media = null; }
  };
  return {
    isActive: () => active,
    cancel,
    stop: () => { if (media?.state === 'recording') media.stop(); },
    async start(onComplete: (blob: Blob, mime: string) => void, onStarted: () => void, onLevel?: (level: number) => void) {
      if (active) return;
      active = true;
      const token = ++generation;
      let stream: MediaStream | undefined;
      try {
        stream = await deps.acquire();
        if (token !== generation) { stream.getTracks().forEach(track => track.stop()); return; }
        const recorder = deps.create(stream); media = recorder;
        const chunks: Blob[] = [];
        recorder.ondataavailable = event => { if (token === generation && event.data.size) chunks.push(event.data); };
        recorder.onstop = () => {
          release(recorder);
          if (token !== generation || media !== recorder) return;
          stopLevel?.(); stopLevel = null;
          if (timer) clearTimeout(timer); timer = null;
          media = null; active = false;
          const mime = (recorder.mimeType || 'audio/webm').split(';')[0];
          onComplete(new Blob(chunks, { type: mime }), mime);
        };
        recorder.start();
        if (onLevel) { try { stopLevel = (deps.observe ?? observeMicrophoneLevel)(stream, onLevel); } catch { onLevel(0); } }
        onStarted();
        timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 60000);
      } catch (error) { stream?.getTracks().forEach(track => track.stop()); if (token === generation) { cancel(); throw error; } }
    },
  };
}
