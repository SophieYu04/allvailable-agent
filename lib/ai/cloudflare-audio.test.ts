import { afterEach, expect, it, vi } from 'vitest';
import { speechModel, transcribeWorkersAudio, workersAudioBinding } from './cloudflare-audio';
afterEach(() => vi.unstubAllEnvs());
it('sends intact recordings to multilingual Whisper without translating them', async () => {
  const run = vi.fn().mockResolvedValue({ text: ' 十月三日晚上七點到九點有空。 ' });
  const bytes = new Uint8Array([0, 255, 10, 42]);
  expect(await transcribeWorkersAudio(new Blob([bytes], { type: 'audio/mp4' }), { run })).toBe('十月三日晚上七點到九點有空。');
  expect(run).toHaveBeenCalledWith(speechModel, { audio: Buffer.from(bytes).toString('base64'), task: 'transcribe', vad_filter: true });
});
it('does not fabricate availability from silence or failed inference', async () => {
  await expect(transcribeWorkersAudio(new Blob(['audio']), { run: vi.fn().mockResolvedValue({ text: ' ' }) })).rejects.toThrow('AUDIO_NO_SPEECH');
  await expect(transcribeWorkersAudio(new Blob(['audio']), { run: vi.fn().mockRejectedValue(new Error('quota exceeded')) })).rejects.toThrow('CLOUDFLARE_AUDIO_FAILED');
});
it('does not expose Cloudflare audio unless explicitly enabled', async () => {
  vi.stubEnv('CLOUDFLARE_AUDIO_ENABLED', 'false');
  expect(await workersAudioBinding()).toBeNull();
});
