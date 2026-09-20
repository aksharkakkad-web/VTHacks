import assert from 'node:assert/strict';
import test from 'node:test';
import { measureDecisions } from './latency.mjs';

test('latency acceptance counts slow results, fallbacks and missing audits as failures', async () => {
  let tick = 0, calls = 0;
  const report = await measureDecisions({ runs: 20, clock: () => tick, decide: async () => {
    calls++; tick += calls === 20 ? 10001 : 100;
    return { engine: calls === 2 ? 'local_fallback' : 'databricks', status: 'RECOMMENDED', auditPersisted: calls !== 3, statementId: `s-${calls}` };
  }});
  assert.equal(report.samples.length, 20);
  assert.equal(report.medianMs, 100);
  assert.equal(report.slowestMs, 10001);
  assert.equal(report.passed, false);
  assert.equal(report.underTargetCount, 17);
});

test('20 audited real-engine decisions under the bound pass; an exception remains a measured failure', async () => {
  let tick = 0;
  const options = { runs: 20, clock: () => tick, decide: async () => { tick += 50; return { engine: 'databricks', status: 'RECOMMENDED', auditPersisted: true }; } };
  assert.equal((await measureDecisions(options)).passed, true);
  const failed = await measureDecisions({ ...options, decide: async () => { tick += 100; throw new Error('must not leak secret'); } });
  assert.equal(failed.samples.length, 20);
  assert.equal(failed.passed, false);
  assert.ok(!JSON.stringify(failed).includes('must not leak secret'));
});
