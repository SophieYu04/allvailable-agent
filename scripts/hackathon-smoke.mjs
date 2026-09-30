// Live provider connectivity evidence. Never logs credentials or recognized content.
// Usage: node scripts/hackathon-smoke.mjs [--text] [--vision] [--audio] [image-path] [audio-path]
// By default, each modality is attempted independently when its configuration and fixture exist.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const args = process.argv.slice(2);
const requested = args.filter((arg) => arg.startsWith('--')).map((arg) => arg.slice(2));
const positional = args.filter((arg) => !arg.startsWith('--'));
const known = new Set(['text', 'vision', 'audio']);
const unknown = requested.filter((name) => !known.has(name));
if (unknown.length) {
  console.error(JSON.stringify({ status: 'usage_error', unknownFlags: unknown, usage: 'node scripts/hackathon-smoke.mjs [--text] [--vision] [--audio] [image-path] [audio-path]' }));
  process.exit(2);
}

const selected = requested.length ? [...new Set(requested)] : ['text', 'vision', 'audio'];
const imagePath = selected.includes('vision') ? positional[0] : undefined;
const audioPath = selected.includes('audio') ? positional[selected.includes('vision') ? 1 : 0] : undefined;
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.webm': 'audio/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const configs = {
  text: { prefix: 'NEBIUS', needs: ['API_KEY', 'MODEL'], fixture: null },
  vision: { prefix: 'NEBIUS_VISION', needs: ['MODEL'], fixture: imagePath },
  audio: { prefix: 'NEBIUS_AUDIO', needs: ['API_KEY', 'BASE_URL', 'MODEL'], fixture: audioPath },
};

for (const modality of selected) {
  const { prefix, needs, fixture } = configs[modality];
  const missingConfiguration = needs.map((name) => `${prefix}_${name}`).filter((key) => !process.env[key]);
  if (modality === 'vision' && !process.env.NEBIUS_VISION_API_KEY && !process.env.NEBIUS_API_KEY) missingConfiguration.push('NEBIUS_API_KEY');
  if (missingConfiguration.length) {
    console.log(JSON.stringify({ status: 'blocked', modality, missingConfiguration, live: false }));
    process.exitCode = 1;
    continue;
  }
  if (modality !== 'text' && !fixture) {
    console.log(JSON.stringify({ status: 'blocked', modality, missingFixture: true, live: false }));
    process.exitCode = 1;
    continue;
  }

  const fixtureType = modality === 'vision' || modality === 'audio' ? mime[extname(fixture).toLowerCase()] : undefined;
  if (modality !== 'text' && !fixtureType?.startsWith(modality === 'vision' ? 'image/' : 'audio/')) {
    console.log(JSON.stringify({ status: 'blocked', modality, reason: 'unsupported_or_missing_fixture_format', live: false }));
    process.exitCode = 1;
    continue;
  }

  const base = (process.env[`${prefix}_BASE_URL`] || process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/$/, '');
  let url;
  try {
    url = new URL(base);
    if (url.protocol !== 'https:') throw new Error('https required');
  } catch {
    console.log(JSON.stringify({ status: 'blocked', modality, reason: 'invalid_https_endpoint', live: false }));
    process.exitCode = 1;
    continue;
  }

  let fixtureBytes;
  if (modality !== 'text') {
    fixtureBytes = await readFile(fixture);
    const limit = modality === 'vision' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (fixtureBytes.length > limit) throw new Error(`${modality} fixture exceeds app upload limit`);
  }

  const model = process.env[`${prefix}_MODEL`];
  const apiKey = process.env[`${prefix}_API_KEY`] || process.env.NEBIUS_API_KEY;
  const headers = { Authorization: `Bearer ${apiKey}` };
  let body;
  const path = modality === 'audio' ? '/audio/transcriptions' : '/chat/completions';
  if (modality === 'audio') {
    body = new FormData();
    body.set('file', new Blob([fixtureBytes], { type: fixtureType }), `voice${extname(fixture)}`);
    body.set('model', model);
  } else {
    headers['Content-Type'] = 'application/json';
    const content = modality === 'vision'
      ? [{ type: 'text', text: '請逐列讀取這張有日期的單日計畫截圖，列出每列的原文名稱、畫面明示的日期、精確起訖（若未顯示就回 null），並區分明確期限／提醒和可能行程；不得猜時刻或把期限當成忙碌時段。回覆 JSON。' }, { type: 'image_url', image_url: { url: `data:${fixtureType};base64,${fixtureBytes.toString('base64')}` } }]
      : '我在 2026 年 10 月 3 日台灣時間晚上 7 點到 9 點有空。請解析日期及起訖。';
    body = JSON.stringify({ model, messages: [{ role: 'user', content }], max_tokens: 1024 });
  }

  const started = performance.now();
  try {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(60000) });
    let value;
    try { value = await response.json(); } catch { value = {}; }
    const content = value.choices?.[0]?.message?.content;
    const nonEmpty = modality === 'audio'
      ? typeof value.text === 'string' && value.text.trim().length > 0
      : (typeof content === 'string' && content.trim().length > 0) || (Array.isArray(content) && content.length > 0);
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), modality, endpointOrigin: url.origin, model, httpStatus: response.status, elapsedMs: Math.round(performance.now() - started), nonEmptyResponse: nonEmpty, accuracy: 'not assessed; review in app', live: true }));
    if (!response.ok || !nonEmpty) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), modality, endpointOrigin: url.origin, model, elapsedMs: Math.round(performance.now() - started), status: 'network_or_timeout_failure', live: true }));
    process.exitCode = 1;
  }
}
