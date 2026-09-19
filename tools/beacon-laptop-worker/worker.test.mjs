import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { RpcClient, hardenedConfig, chooseModel, modelEnvironment } from './client.mjs';
import { schemaFor, validateOutput } from './schemas.mjs';

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
