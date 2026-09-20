import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorOnce } from './monitor.mjs';
test('monitor uses its own bounded authenticated server endpoint without location or planner state', async () => {
  let called = false;
  await monitorOnce('https://example.com', 't'.repeat(32), async (url, options) => {
    called = true; assert.equal(url.pathname, '/api/trips/monitor'); assert.equal(options.method, 'POST'); assert.equal(options.body, undefined); assert.equal(options.redirect, 'error'); return Response.json({ checked: true });
  }); assert.equal(called, true);
});
test('monitor refuses insecure remote hosts and reports failures without raw errors', async () => {
  await assert.rejects(monitorOnce('http://example.com', 't'.repeat(32)), /MONITOR_CONFIG_INVALID/);
  await assert.rejects(monitorOnce('https://example.com', 't'.repeat(32), async () => new Response('secret', { status: 503 })), /^Error: MONITOR_UNAVAILABLE$/);
});
