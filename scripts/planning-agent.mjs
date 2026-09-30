// Offline by default. --live-demo makes exactly one real model request using synthetic data.
// Custom input: --live --input /path/to/input.json (request, existing?, participants?).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const demo = !args.length || (args.length === 1 && args[0] === '--demo');
const liveDemo = args.length === 1 && args[0] === '--live-demo';
const liveInput = args.length === 3 && args[0] === '--live' && args[1] === '--input';
if (!demo && !liveDemo && !liveInput) {
  console.error('Usage: node scripts/planning-agent.mjs [--demo | --live-demo | --live --input input.json]');
  process.exit(2);
}
if (!demo) {
  try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!process.env.NEBIUS_API_KEY || !process.env.NEBIUS_MODEL) {
    console.error('NEBIUS_NOT_CONFIGURED: configure a dedicated server-side key/model first. No request was sent.');
    process.exit(1);
  }
  // Deliberately no billing API, top-up, paid endpoint provisioning, or retry path.
  console.error('One live request (max 2048 output tokens). Ensure Nebius is set to stop usage after trial; local token limits are not a billing guarantee.');
}
const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const deadlineDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const draft = { name: '朋友聚餐', dateStart: date, dateEnd: date, dailyStart: '18:00', dailyEnd: '22:00', duration: 60, deadline: `${deadlineDate}T12:00:00+08:00` };
const fixture = {
  request: `邀約名稱「朋友聚餐」，${date} 當天晚上18:00到22:00之間，聚會60分鐘，回覆截止為${deadlineDate}中午12:00，全部使用台灣時間。`,
  participants: [0, 1, 2].map((index) => ({ id: `synthetic-${index + 1}`, submitted: true,
    cells: Object.fromEntries(['19:00', '19:30', '20:00', '20:30'].slice(index).map((time) => [`${date}-${time}`, 'green'])) })),
};
const input = liveInput ? JSON.parse(await readFile(args[2], 'utf8')) : fixture;
const server = await createServer({ configFile: false, envFile: false, logLevel: 'error',
  resolve: { alias: { '@': fileURLToPath(new URL('..', import.meta.url)) } },
  server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
try {
  const { runPlanningAgent } = await server.ssrLoadModule('/lib/ai/planning-agent.ts');
  const started = performance.now();
  const result = await runPlanningAgent(input, demo ? async () => ({ input: draft, questions: [] }) : undefined);
  console.log(JSON.stringify({ mode: demo ? 'offline_synthetic' : 'live', model: demo ? null : process.env.NEBIUS_MODEL,
    elapsedMs: Math.round(performance.now() - started), ...result }, null, 2));
} catch (error) {
  // Never print provider payloads, request text, or keys on failures.
  const code = error instanceof Error && /^NEBIUS_[A-Z0-9_]+$/.test(error.message) ? error.message : 'AGENT_INPUT_OR_RESPONSE_INVALID';
  console.error(code);
  process.exitCode = 1;
} finally {
  await server.close();
}
