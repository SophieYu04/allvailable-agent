/** Text and vision may share Token Factory credentials; audio stays independent. */
export function providerConfig(kind: 'text' | 'vision' | 'audio') {
  const prefix = kind === 'text' ? 'NEBIUS' : `NEBIUS_${kind.toUpperCase()}`;
  const apiKey = kind === 'vision'
    ? process.env.NEBIUS_VISION_API_KEY || process.env.NEBIUS_API_KEY
    : process.env[`${prefix}_API_KEY`];
  const model = process.env[`${prefix}_MODEL`];
  const baseUrl = process.env[`${prefix}_BASE_URL`] || (kind === 'vision'
    ? process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1'
    : kind === 'text' ? 'https://api.tokenfactory.nebius.com/v1' : '');
  if (!apiKey || !model || !baseUrl) throw new Error(`${prefix}_NOT_CONFIGURED`);
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error(`${prefix}_INVALID_ENDPOINT`);
  return { apiKey, model, baseUrl: baseUrl.replace(/\/$/, '') };
}
