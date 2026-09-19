import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { RpcClient, hardenedConfig, chooseModel, modelEnvironment } from './client.mjs';
import { schemaFor, validateOutput } from './schemas.mjs';
import { Worker, Backend } from './worker.mjs';

function fake() {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => child.emit('exit', 0); return child;
}
test('RPC correlates interleaved replies and ignores unrelated notifications', async () => {
  const child = fake(), rpc = new RpcClient(child, 200);
  const a = rpc.call('a', {}), b = rpc.call('b', {});
  child.stdout.write('{"method":"notification","params":{}}\n{"id":2,"result":{"ok":2}}\n{"id":1,"result":{"ok":1}}\n');
  assert.deepEqual(await a, {ok:1}); assert.deepEqual(await b, {ok:2}); rpc.close();
});
test('child exit rejects outstanding calls without copying raw stderr', async () => {
  const child = fake(), rpc = new RpcClient(child, 200); const p = rpc.call('a', {});
  child.stderr.write('secret-token'); child.emit('exit', 1);
  await assert.rejects(p, /MODEL_UNAVAILABLE/); rpc.close();
});
test('RPC timeout is bounded', async () => {
  const rpc = new RpcClient(fake(), 10); await assert.rejects(rpc.call('a', {}), /TIMEOUT/); rpc.close();
});
test('oversized transport fails closed', async () => {
  const child = fake(), rpc = new RpcClient(child, 200, 30); const p = rpc.call('a', {});
  child.stdout.write('x'.repeat(31)); await assert.rejects(p, /INVALID_OUTPUT/); rpc.close();
});
test('model selection honors explicit sol or terra and never changes to another family', () => {
  const data = [{model:'gpt-5.6-terra',supportedReasoningEfforts:[{reasoningEffort:'low'}]}];
  assert.equal(chooseModel(data), 'gpt-5.6-terra');
  assert.throws(() => chooseModel(data,'gpt-5.6-sol'), /MODEL_UNAVAILABLE/);
  assert.throws(() => chooseModel([{model:'other'}]), /MODEL_UNAVAILABLE/);
});
test('model child does not inherit worker secrets or API billing credentials', () => {
  assert.deepEqual(modelEnvironment({HOME:'/home/u',PATH:'/bin',BEACON_PLANNER_WORKER_TOKEN:'secret',OPENAI_API_KEY:'secret'}), {HOME:'/home/u',PATH:'/bin'});
});
test('hardening disables inherited MCP plugins hooks and shell without changing auth', () => {
  const config = hardenedConfig({mcp_servers:{foo:{enabled:true}},plugins:{'x@y':{enabled:true}},hooks:{SessionStart:[{}]}});
  assert.equal(config['mcp_servers.foo.enabled'],false); assert.equal(config['plugins.x@y.enabled'],false);
  assert.deepEqual(config['hooks.SessionStart'],[]); assert.equal(config['features.shell_tool'],false);
  assert.equal(config.forced_login_method,'chatgpt');
});
test('intent validates enums and rejects budget authorizations or arbitrary tools', () => {
  const valid = {objective:'get_home',priorities:['minimize_walking'],evidenceRequests:[{topic:'weather'}],clarification:null};
  assert.deepEqual(validateOutput('student-intent',valid),valid);
  assert.throws(()=>validateOutput('student-intent',{...valid,budget:100}));
  assert.throws(()=>validateOutput('student-intent',{...valid,evidenceRequests:[{topic:'shell'}]}));
  assert.equal(schemaFor('student-intent').additionalProperties,false);
});
test('explanation requires bounded fact references and rejects extra output', () => {
  const v={snapshotId:'s',selectedPlanId:'p',sentences:[{text:'Wait indoors only if access is confirmed.',factIds:['f1']}]};
  assert.deepEqual(validateOutput('student-explanation',v),v);
  assert.throws(()=>validateOutput('student-explanation',{...v,secret:'x'}));
  assert.throws(()=>schemaFor('unknown'));
});

function workerFixture(overrides = {}) {
  const calls = [];
  const claim = { job: { version: 'beacon-planner-job-v1', jobId: 'j', role: 'research-intent', snapshotId: 's', inputHash: 'h', input: { topics: ['weather'] }, expiresAt: new Date(Date.now() + 90000).toISOString() }, leaseId: 'lease', attempt: 1 };
  const backend = { post: async (action, payload) => { calls.push({ action, payload }); return action === 'claim' ? claim : {}; } };
  let runs = 0;
  const planner = { model: 'gpt-5.6-sol', run: async () => { runs++; return { topics: ['weather'] }; }, close: async () => {} };
  Object.assign(backend, overrides.backend); Object.assign(planner, overrides.planner);
  return { calls, claim, backend, planner, runs: () => runs };
}
test('worker executes one bounded job and submits no owner or credentials to model', async () => {
  const f = workerFixture(); let modelInput;
  f.planner.run = async (role, input, opts) => { modelInput = input; assert.ok(opts.timeoutMs <= 65000); return { topics: ['weather'] }; };
  const worker = new Worker(f.backend, f.planner);
  await worker.step();
  assert.deepEqual(modelInput, { topics: ['weather'] });
  const completion = f.calls.find(c => c.action === 'complete').payload;
  assert.equal(completion.leaseId, 'lease'); assert.equal(completion.outcome, 'succeeded');
  assert.equal(f.calls.filter(c => c.action === 'tick').length, 2);
});
test('ambiguous completion retries exact payload without a second inference', async () => {
  const f = workerFixture(), original = f.backend.post; let attempts = 0; const payloads = [];
  f.backend.post = async (action, payload) => { if (action === 'complete') { payloads.push(payload); if (++attempts === 1) throw new Error('BACKEND_UNAVAILABLE'); } return original(action, payload); };
  await new Worker(f.backend, f.planner).step();
  assert.equal(f.runs(), 1); assert.equal(attempts, 2); assert.deepEqual(payloads[0], payloads[1]);
});
test('lost lease never submits a late result', async () => {
  const f = workerFixture(), original = f.backend.post; let beats = 0;
  f.backend.post = async (action, payload) => { if (action === 'heartbeat' && ++beats === 2) throw new Error('STALE_LEASE'); return original(action, payload); };
  f.planner.run = async () => { await new Promise(r => setTimeout(r, 20)); return { topics: ['weather'] }; };
  await new Worker(f.backend, f.planner, { heartbeatMs: 3 }).step();
  assert.equal(f.calls.some(c => c.action === 'complete'), false);
});
test('rate limit disables further claims but keeps status and backend ticks alive', async () => {
  const f = workerFixture({ planner: { run: async () => { throw new Error('RATE_LIMITED'); } } });
  const worker = new Worker(f.backend, f.planner);
  await worker.step(); await worker.step();
  assert.equal(f.calls.filter(c => c.action === 'claim').length, 1);
  assert.equal(f.calls.find(c => c.action === 'complete').payload.errorCode, 'RATE_LIMITED');
  assert.equal(f.calls.at(-2).payload.authState, 'rate_limited');
});
test('worker serializes inference and stops without completing a cancelled run', async () => {
  const f = workerFixture(); let resolve;
  f.planner.run = () => new Promise(r => { resolve = r; });
  const worker = new Worker(f.backend, f.planner);
  const first = worker.step();
  await new Promise(r => setImmediate(r));
  assert.equal(await worker.step(), false);
  await worker.stop(); resolve({ topics: ['weather'] }); await first;
  assert.equal(f.calls.some(c => c.action === 'complete'), false);
});
test('backend refuses insecure remote hosts and redirects and never exposes raw errors', async () => {
  assert.throws(() => new Backend('http://example.com', 'x'.repeat(32)), /BACKEND_URL_INVALID/);
  assert.throws(() => new Backend('https://user:password@example.com', 'x'.repeat(32)), /BACKEND_URL_INVALID/);
  const backend = new Backend('https://example.com', 'x'.repeat(32), async (_url, opts) => { assert.equal(opts.redirect, 'error'); return new Response('secret raw upstream token', { status: 500 }); });
  await assert.rejects(backend.post('claim', {}), /^Error: BACKEND_UNAVAILABLE$/);
  await assert.rejects(backend.post('book', {}), /ACTION_INVALID/);
});
