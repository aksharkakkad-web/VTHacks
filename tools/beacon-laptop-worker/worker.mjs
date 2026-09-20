import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connectPlanner } from './client.mjs';
import { validateOutput } from './schemas.mjs';

const roles = ['student-intent', 'research-intent', 'student-explanation'];
const codes = ['AUTH_REQUIRED', 'RATE_LIMITED', 'TIMEOUT', 'INVALID_OUTPUT', 'MODEL_UNAVAILABLE'];
export function errorCode(error) { return codes.includes(error?.message) ? error.message : 'MODEL_UNAVAILABLE'; }

export class Backend {
  constructor(base, token, fetcher = fetch) {
    this.base = new URL(base);
    if (this.base.username || this.base.password || this.base.search || this.base.hash || this.base.pathname !== '/' ||
      (this.base.protocol !== 'https:' && !(this.base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(this.base.hostname)))) throw new Error('BACKEND_URL_INVALID');
    if (typeof token !== 'string' || token.length < 32) throw new Error('WORKER_TOKEN_REQUIRED');
    this.token = token; this.fetcher = fetcher;
  }
  async post(action, payload) {
    if (!['claim', 'heartbeat', 'complete', 'tick', 'pairing'].includes(action)) throw new Error('ACTION_INVALID');
    const response = await this.fetcher(new URL(`/api/internal/planner/${action}`, this.base), {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(action === 'tick' ? 60000 : 10000),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(response.status === 409 ? 'STALE_LEASE' : response.status === 401 ? 'WORKER_UNAUTHORIZED' : 'BACKEND_UNAVAILABLE');
    if (response.status === 204) return null;
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 32768) throw new Error('INVALID_OUTPUT');
    try { return JSON.parse(raw); } catch { throw new Error('INVALID_OUTPUT'); }
  }
}

export class Worker {
  constructor(backend, planner, { workerId = randomUUID(), now = Date.now, heartbeatMs = 10000 } = {}) {
    this.backend = backend; this.planner = planner; this.workerId = workerId; this.now = now; this.heartbeatMs = heartbeatMs;
    this.authState = 'online'; this.active = null; this.busy = false; this.stopped = false;
  }
  heartbeat() {
    return this.backend.post('heartbeat', { workerId: this.workerId, jobId: this.active?.job.jobId ?? null,
      leaseId: this.active?.leaseId ?? null, authState: this.authState, model: this.planner.model });
  }
  async step() {
    if (this.busy || this.stopped) return false;
    this.busy = true;
    try {
      await this.heartbeat();
      await this.backend.post('tick', {});
      // Recover auth/rate limits by restarting after login or the account window resets.
      if (this.authState !== 'online') return false;
      const claim = await this.backend.post('claim', { workerId: this.workerId, roles });
      if (!claim) return false;
      const { job, leaseId, attempt } = claim;
      if (!job || job.version !== 'beacon-planner-job-v1' || !roles.includes(job.role) || !Number.isInteger(attempt) ||
        ![1, 2].includes(attempt) || typeof leaseId !== 'string' || typeof job.snapshotId !== 'string' || typeof job.inputHash !== 'string' ||
        !Number.isFinite(Date.parse(job.expiresAt)) || JSON.stringify(job.input).length > 20000) throw new Error('INVALID_OUTPUT');
      this.active = claim;
      let leaseLost = false, heartbeatBusy = false;
      const timer = setInterval(async () => {
        if (heartbeatBusy) return;
        heartbeatBusy = true;
        try { await this.heartbeat(); } catch { leaseLost = true; } finally { heartbeatBusy = false; }
      }, this.heartbeatMs);
      let output = null, failure = null;
      try {
        const timeoutMs = Math.min(65000, Date.parse(job.expiresAt) - this.now() - 1000);
        if (timeoutMs <= 0) throw new Error('TIMEOUT');
        output = validateOutput(job.role, await this.planner.run(job.role, job.input, { timeoutMs }));
      } catch (error) {
        failure = errorCode(error);
        if (failure === 'AUTH_REQUIRED') this.authState = 'auth_required';
        if (failure === 'RATE_LIMITED') this.authState = 'rate_limited';
      } finally { clearInterval(timer); }
      if (!leaseLost && !this.stopped) {
        const completion = { version: 'beacon-planner-result-v1', jobId: job.jobId, leaseId, attempt,
          snapshotId: job.snapshotId, inputHash: job.inputHash, model: this.planner.model,
          outcome: failure ? 'failed' : 'succeeded', output, errorCode: failure };
        // Retry the identical completion only; never rerun inference after an ambiguous HTTP response.
        for (let retry = 0; retry < 2; retry++) {
          try { await this.backend.post('complete', completion); break; }
          catch (error) { if (error.message === 'STALE_LEASE') break; if (retry) throw error; }
        }
      }
      this.active = null;
      await this.heartbeat();
      await this.backend.post('tick', {});
      return true;
    } finally { this.active = null; this.busy = false; }
  }
  async stop() { this.stopped = true; await this.planner.close(); }
}

async function main() {
  try { process.loadEnvFile(process.env.BEACON_WORKER_ENV || join(homedir(), '.config/beacon-demo/worker.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('WORKER_CONFIG_INVALID'); }
  const backend = new Backend(process.env.BEACON_BACKEND_URL, process.env.BEACON_PLANNER_WORKER_TOKEN);
  if (process.argv.includes('--pair')) {
    const result = await backend.post('pairing', {});
    console.log(JSON.stringify({ pairingCode: result.code, expiresInMinutes: 10 })); return;
  }
  const planner = await connectPlanner();
  const worker = new Worker(backend, planner);
  console.log(JSON.stringify({ status: 'ready', authMode: 'chatgpt', model: planner.model, reasoning: 'low' }));
  let wake;
  const stop = () => { void worker.stop(); wake?.(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let idleMs = 2000;
  try {
    while (!worker.stopped) {
      try { idleMs = await worker.step() ? 2000 : Math.min(10000, idleMs * 1.5); }
      catch (error) { console.error(JSON.stringify({ status: 'unavailable', code: ['WORKER_UNAUTHORIZED', 'STALE_LEASE', 'BACKEND_UNAVAILABLE'].includes(error.message) ? error.message : 'WORKER_UNAVAILABLE' })); idleMs = 10000; }
      if (!worker.stopped) await new Promise(resolve => { const timer = setTimeout(resolve, idleMs + Math.random() * 500); wake = () => { clearTimeout(timer); resolve(); }; });
    }
  } finally { await worker.stop(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({ status: 'unavailable', code: errorCode(error) })); process.exitCode = 1; });
}
