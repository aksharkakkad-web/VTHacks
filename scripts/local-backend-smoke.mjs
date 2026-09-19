/** Isolated local acceptance: no cloud credentials, real rides or notifications. */
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const children = new Set();
const state = await mkdtemp(join(tmpdir(), 'beacon-http-acceptance-'));
const env = { ...process.env };
// Empty strings override Next's local dotenv values without exposing any secret.
for (const key of ['DATABRICKS_HOST', 'DATABRICKS_TOKEN', 'DATABRICKS_WAREHOUSE_ID', 'DATABRICKS_PROVIDER_OUTCOMES_TABLE', 'GOOGLE_ROUTES_API_KEY', 'TELEGRAM_BOT_TOKEN', 'ANS_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) env[key] = '';
Object.assign(env, {
  DEMO_MODE: 'true', BEACON_NOTIFICATION_MODE: 'simulated', BEACON_ANS_MODE: 'demo',
  BEACON_PLANNER_MODE: 'codex_laptop', BEACON_PLANNER_WORKER_TOKEN: randomBytes(32).toString('hex'),
  BEACON_PROVIDER_TOKEN: randomBytes(32).toString('hex'), BEACON_MONITOR_TOKEN: randomBytes(32).toString('hex'),
  BEACON_CONTEXT_SERVICE_TOKEN: randomBytes(32).toString('hex'),
  BEACON_CONTEXT_AGENT_URL: 'http://127.0.0.1:3123/api/demo/context-agent',
  BEACON_SYNTHETIC_JOURNEY_BINDINGS: 'true', BEACON_GOOGLE_ROUTES_ENABLED: 'false',
  UBER_GUEST_SANDBOX_ENABLED: 'false', BEACON_LYFT_DEMO: 'false', BEACON_HOSTED_PROVIDERS: 'false',
  BEACON_STATE_DIR: state, BEACON_SMOKE_URL: 'http://127.0.0.1:3123',
  BEACON_SMOKE_FIXTURE_MODEL: process.argv.includes('--actual-model') ? 'false' : 'true',
});
delete env.VERCEL;
function start(file, args) {
  const child = spawn(file, args, { cwd: root, env, stdio: 'inherit' });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code ?? signal}`))); });
  // Background failures are also checked by readiness/final execution.
  child.done.catch(() => {});
  return child;
}
async function available(port) {
  await new Promise((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve)); });
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error('Local service exited before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Local service not ready: ${url}`);
}
try {
  await Promise.all([3123, 4311, 4312, 4313].map(available));
  await start(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'src/agents/tsconfig.test.json', '--outDir', join(state, 'compiled')]).done;
  const providers = start(process.execPath, [join(state, 'compiled/agents/serve-demo.js')]);
  const app = start(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3123']);
  await Promise.all([ready('http://127.0.0.1:3123', app), ready('http://127.0.0.1:4311/.well-known/agent-card.json', providers)]);
  await start(process.execPath, ['scripts/hybrid-demo-smoke.mjs']).done;
  console.log(`Local acceptance artifacts retained in ${state}`);
} finally {
  const stopped = [...children].map(child => { child.kill('SIGTERM'); return child.done.catch(() => {}); });
  const timer = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 3000);
  await Promise.all(stopped); clearTimeout(timer);
}
