/** Speech recognition is separate from the Nebius/Nemotron reasoning step. */
export const speechModel = '@cf/openai/whisper-large-v3-turbo';
type AudioBinding = { run(model: string, input: { audio: string; task: string; vad_filter: boolean }): Promise<{ text?: string }> };

export async function workersAudioBinding(): Promise<AudioBinding | null> {
  if (process.env.CLOUDFLARE_AUDIO_ENABLED !== 'true') return null;
  try {
    const { env } = await import('cloudflare:workers');
    return (env as unknown as { AI?: AudioBinding }).AI ?? null;
  } catch { return null; }
}

export async function transcribeWorkersAudio(file: Blob, ai: AudioBinding) {
  // Send the intact encoded recording. Splitting bytes corrupts MP4/WebM containers.
  const result = await ai.run(speechModel, {
    audio: Buffer.from(await file.arrayBuffer()).toString('base64'),
    task: 'transcribe',
    vad_filter: true,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    const code = /(?:code|error)[: ]+(\d+)/i.exec(message)?.[1];
    throw new Error(`CLOUDFLARE_AUDIO_FAILED${code ? '_' + code : ''}`);
  });
  const text = result.text?.trim();
  if (!text) throw new Error('AUDIO_NO_SPEECH');
  return text;
}
