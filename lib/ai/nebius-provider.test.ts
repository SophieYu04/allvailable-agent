import { afterEach, expect, it, vi } from 'vitest';
import { modelRequest, transcribeAudio } from './openai';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('bounds agent output and never retries an uncertain request when retry is disabled', async () => {
  vi.stubEnv('NEBIUS_API_KEY', 'test-key'); vi.stubEnv('NEBIUS_MODEL', 'text-model');
  const fetch = vi.fn().mockRejectedValue(new Error('connection lost'));
  vi.stubGlobal('fetch', fetch);
  await expect(modelRequest({ maxOutputTokens: 2048, retry: false, input: [{ role: 'user', content: [{ type: 'input_text', text: 'plan' }] }] })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body).max_tokens).toBe(2048);
});
it('rejects invalid output budgets before sending a request', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(modelRequest({ maxOutputTokens: 9000, input: [] })).rejects.toThrow('NEBIUS_INVALID_TOKEN_LIMIT');
  expect(fetch).not.toHaveBeenCalled();
});
it('does not accept truncated structured output or retry it automatically', async () => {
  vi.stubEnv('NEBIUS_API_KEY', 'test-key'); vi.stubEnv('NEBIUS_MODEL', 'text-model');
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await expect(modelRequest({ input: [] })).rejects.toThrow('NEBIUS_OUTPUT_LIMIT_REACHED');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('honors the explicitly selected model instead of silently replacing it', async () => {
  vi.stubEnv('NEBIUS_API_KEY', 'test-key'); vi.stubEnv('NEBIUS_MODEL', 'text-model');
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await modelRequest({ model: 'vision-model', input: [{ role: 'user', content: [{ type: 'input_text', text: 'classify' }] }] });
  expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('vision-model');
});
it('sends recorded audio to the configured transcription endpoint/model', async () => {
  vi.stubEnv('NEBIUS_AUDIO_API_KEY', 'audio-only-key'); vi.stubEnv('NEBIUS_AUDIO_MODE', 'transcriptions');
  vi.stubEnv('NEBIUS_AUDIO_BASE_URL', 'https://audio.example/v1'); vi.stubEnv('NEBIUS_AUDIO_MODEL', 'nvidia/parakeet-tdt-0.6b-v3');
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Change the start to four' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  expect(await transcribeAudio(new Blob(['audio'], { type: 'audio/mp4' }))).toContain('four');
  expect(fetch.mock.calls[0][0]).toBe('https://audio.example/v1/audio/transcriptions');
  expect((fetch.mock.calls[0][1].body as FormData).get('model')).toBe('nvidia/parakeet-tdt-0.6b-v3');
});
it('rejects unsupported audio wire formats instead of sending audio as an image', async () => {
  vi.stubEnv('NEBIUS_AUDIO_MODE', 'chat');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(transcribeAudio(new Blob(['audio']))).rejects.toThrow('NEBIUS_AUDIO_MODE_UNSUPPORTED');
  expect(fetch).not.toHaveBeenCalled();
});
it('never sends audio using text credentials or an assumed audio model', async () => {
  vi.stubEnv('NEBIUS_API_KEY', 'text-only');
  vi.stubEnv('NEBIUS_AUDIO_API_KEY', ''); vi.stubEnv('NEBIUS_AUDIO_MODEL', '');
  const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
  await expect(transcribeAudio(new Blob(['audio']))).rejects.toThrow('NEBIUS_AUDIO_NOT_CONFIGURED');
  expect(fetch).not.toHaveBeenCalled();
});
it('uses the dedicated Token Factory key/base for a vision model when no override is set', async () => {
  vi.stubEnv('NEBIUS_API_KEY','text-only'); vi.stubEnv('NEBIUS_MODEL','text-model');
  vi.stubEnv('NEBIUS_VISION_API_KEY','');
  vi.stubEnv('NEBIUS_VISION_BASE_URL','');
  vi.stubEnv('NEBIUS_VISION_MODEL','vision-model');
  const extraction = { sources: [{ id: 'image', kind: 'calendar', reason: null }], events: [{ id: 'e', sourceIds: ['image'], label: 'Dinner', intent: 'busy', startDate: '2026-10-03', endDate: '2026-10-03', startTime: '19:00', endTime: '20:00', sourceTimezone: 'Asia/Taipei', allDay: false, recurrence: null, unresolved: [], userConfirmed: true }], visibleRanges: [], questions: [] };
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({sources:[{id:'image',text:'2026-10-03 Dinner 19:00–20:00 Asia/Taipei'}]})}}]}),{status:200})).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(extraction) } }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const {extractCalendarImages} = await import('./openai');
  await expect(extractCalendarImages([{id:'image',dataUrl:'data:image/png;base64,AA=='}])).resolves.toMatchObject({events:[{userConfirmed:false}]});
  expect(fetch.mock.calls[0][0]).toBe('https://api.tokenfactory.nebius.com/v1/chat/completions');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer text-only');
  expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('vision-model');
  expect(JSON.parse(fetch.mock.calls[1][1].body).model).toBe('text-model');
  expect(fetch.mock.calls[1][1].body).not.toContain('data:image');
});
it('never uses the text model for a vision request when no vision model is selected', async () => {
  vi.stubEnv('NEBIUS_API_KEY','text-only'); vi.stubEnv('NEBIUS_MODEL','text-model');
  vi.stubEnv('NEBIUS_VISION_API_KEY',''); vi.stubEnv('NEBIUS_VISION_MODEL','');
  const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
  const {extractCalendarImages} = await import('./openai');
  await expect(extractCalendarImages([{id:'image',dataUrl:'data:image/png;base64,AA=='}])).rejects.toThrow('NEBIUS_VISION_NOT_CONFIGURED');
  expect(fetch).not.toHaveBeenCalled();
});
