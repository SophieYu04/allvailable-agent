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
