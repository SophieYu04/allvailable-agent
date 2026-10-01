// Explicit deployment only; default validates/builds without publishing.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEnvironment, deploymentEnvironment } from './deployment-env.mjs';
process.loadEnvFile('.env.local');
const publish = process.argv.includes('--publish');
const origin = process.env.ALLVAILABLE_DEPLOY_ORIGIN;
if (publish && (!origin || new URL(origin).protocol !== 'https:')) throw Error('Set ALLVAILABLE_DEPLOY_ORIGIN to the HTTPS demo origin');
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://mccbaouodyprmqplxeav.supabase.co') throw Error('Wrong Supabase project');
for (const key of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw Error(`Missing ${key}`);
}
if (publish) {
  if (process.env.AI_PROVIDER !== 'nebius' || process.env.AI_IMPORT_ENABLED !== 'true') {
    throw Error('Refusing public deployment: enable the Nebius provider and AI_IMPORT_ENABLED=true');
  }
  const requiredModelConfig = [
    'NEBIUS_API_KEY', 'NEBIUS_BASE_URL', 'NEBIUS_MODEL',
    'NEBIUS_VISION_MODEL',
  ];
  const missing = requiredModelConfig.filter((key) => !process.env[key]);
  if (missing.length) throw Error(`Refusing public deployment: configure and verify live Nemotron text and vision paths (${missing.join(', ')})`);
  if (!/^nvidia\/(?:NVIDIA-)?nemotron/i.test(process.env.NEBIUS_MODEL)) {
    throw Error('Refusing public deployment: NEBIUS_MODEL must be an NVIDIA Nemotron model');
  }
  for (const key of ['NEBIUS_BASE_URL', ...(process.env.NEBIUS_VISION_BASE_URL ? ['NEBIUS_VISION_BASE_URL'] : [])]) {
    let endpoint;
    try { endpoint = new URL(process.env[key]); } catch { throw Error(`Invalid ${key}`); }
    if (endpoint.protocol !== 'https:') throw Error(`${key} must use HTTPS in a public deployment`);
  }
  const audioConfig = ['NEBIUS_AUDIO_API_KEY', 'NEBIUS_AUDIO_BASE_URL', 'NEBIUS_AUDIO_MODEL'];
  const audioConfigured = audioConfig.filter((key) => process.env[key]).length;
  if (audioConfigured > 0 && audioConfigured < audioConfig.length) {
    throw Error(`NEBIUS_AUDIO configuration is partial; set or remove all of ${audioConfig.join(', ')}`);
  }
  if (audioConfigured === audioConfig.length) {
    let endpoint;
    try { endpoint = new URL(process.env.NEBIUS_AUDIO_BASE_URL); } catch { throw Error('Invalid NEBIUS_AUDIO_BASE_URL'); }
    if (endpoint.protocol !== 'https:') throw Error('NEBIUS_AUDIO_BASE_URL must use HTTPS in a public deployment');
  }
  if (process.env.NEBIUS_AUDIO_MODE && process.env.NEBIUS_AUDIO_MODE !== 'transcriptions') {
    throw Error('Unsupported NEBIUS_AUDIO_MODE for the web demo');
  }
}
const run = (command,args,env=process.env) => {
  const result = spawnSync(command,args,{stdio:'inherit',env});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} failed (${result.status})`);
};
run('npm',['run','build'],buildEnvironment(process.env));
const args=['wrangler','deploy','--config','dist/server/wrangler.json','--name','allvailable-hackathon'];
if (!publish) {
  run('npx',[...args,'--dry-run'],deploymentEnvironment(process.env));
} else {
  // Only runtime app settings are transmitted. CLI/Google management credentials
  // and unrelated environment values never enter the deployment bundle.
  const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY',
    'PAGES_ORIGIN','AI_PROVIDER','AI_IMPORT_ENABLED','AI_DAILY_USER_LIMIT','AI_DAILY_GLOBAL_LIMIT','AI_IMPORT_TTL_HOURS',
    'NEBIUS_API_KEY','NEBIUS_BASE_URL','NEBIUS_MODEL',
    'NEBIUS_VISION_API_KEY','NEBIUS_VISION_BASE_URL','NEBIUS_VISION_MODEL',
    'NEBIUS_AUDIO_API_KEY','NEBIUS_AUDIO_BASE_URL','NEBIUS_AUDIO_MODEL','NEBIUS_AUDIO_MODE'];
  const secrets=Object.fromEntries(keys.filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  secrets.APP_ORIGIN=new URL(origin).origin;
  const directory=mkdtempSync(join(tmpdir(),'allvailable-deploy-'));
  try {
    const path=join(directory,'secrets.json');
    writeFileSync(path,JSON.stringify(secrets),{mode:0o600});
    // Wrangler reads only its local OAuth session and non-sensitive process
    // settings. Runtime credentials enter through the explicit allowlist above.
    run('npx',[...args,'--secrets-file',path],deploymentEnvironment(process.env));
  } finally { rmSync(directory,{recursive:true,force:true}); }
}
