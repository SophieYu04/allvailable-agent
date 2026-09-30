// Read-only inventory of Git-visible release candidates. Does not stage or publish.
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))].sort();
const missing = [], unsafe = [], files = [];
for (const path of paths) {
  let stat;
  try { stat = lstatSync(path); } catch { missing.push(path); continue; }
  const parts = path.split('/');
  const secret = parts.some(part => /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|mobileprovision))$/i.test(part) && part !== '.env.example');
  const generated = parts.some(part => ['node_modules', '.git', '.next', '.vinext', '.wrangler', '.sites-runtime', '.agents', '.codex', 'outputs', 'work', 'dist', 'build', 'Pods', '.dart_tool', '.symlinks'].includes(part));
  const sourceBuildFile = ['build/sites-vite-plugin.ts', 'build/sites-vite-plugin.LICENSE'].includes(path);
  if (secret || (generated && !sourceBuildFile) || stat.isSymbolicLink() || !stat.isFile()) { unsafe.push(path); continue; }
  files.push({ path, bytes: stat.size });
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), count: files.length, unsafe, missing, files }, null, 2));
if (unsafe.length) process.exitCode = 1;
