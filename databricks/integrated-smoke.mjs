import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './build.mjs';

// Explicit local-demo acceptance only. No live transport or alert is requested.
const base = process.env.BEACON_SMOKE_URL ?? 'http://localhost:3100';
const target = new URL(base);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname), 'Run this against an isolated local demo server');
const route = JSON.parse(readFileSync(join(root, 'data/campus/route-evidence.json'), 'utf8')).find(r => r.corridor_id === 'eggleston-pritchard');
assert.ok(route?.geometry && Date.parse(route.construction_avoidance.valid_until) > Date.now(), 'Refresh the construction-aware route before acceptance');
let cookie = '';
async function call(path, body, status = 200, withOwner = true) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(withOwner ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const set = response.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
const trip = await call('/api/trips', { corridorId: 'eggleston-pritchard', preferences: { maxBudget: 0, walkingPreference: 'balanced' } }, 201);
const path = `/api/trips/${trip.id}`;
await call(`${path}/evidence`, undefined, 401, false);
const discovered = await call(`${path}/discover`, {});
assert.ok(discovered.candidates.some(p => p.planId === 'mapped:eggleston-pritchard'));
const selected = await call(`${path}/evaluate`, {});
assert.equal(selected.selectedPlan.planId, 'mapped:eggleston-pritchard');
assert.ok(selected.recommendation.reasonCodes.includes('DATABRICKS_EVALUATION'));
const evidence = await call(`${path}/evidence`);
assert.equal(evidence.options.walkingAlternative.source, 'databricks');
assert.equal(evidence.options.walkingAlternative.route.source_version, route.source_version);
assert.equal(evidence.intelligence.decision.auditPersisted, true);
assert.equal(evidence.intelligence.safetyEvidence.routeExposureScore, null);
assert.equal(evidence.intelligence.safetyEvidence.coverage.geometry, 'supported');
assert.equal(evidence.selectionCurrent, true);
await call(`${path}/confirm`, {});
const navigating = await call(`${path}/request`, {});
assert.equal(navigating.state, 'NAVIGATING');
assert.equal(navigating.sensitiveDataReleased, false);
const [lng, lat] = route.geometry.coordinates.at(-1);
const arrived = await call(`${path}/location`, { lat, lng, recordedAt: new Date().toISOString() });
assert.equal(arrived.state, 'ARRIVED');
assert.equal((await call(`${path}/evidence`)).selectionCurrent, false);
console.log(JSON.stringify({ result: 'PASS', corridorId: route.corridor_id, distanceMeters: route.distance_meters,
  statementId: evidence.intelligence.decision.statementId, routeStatementId: evidence.options.walkingAlternative.statementId,
  auditPersisted: true, selected: selected.selectedPlan.planId, navigationAndArrival: true, ownerProtection: true,
  exactCoordinatesSharedWithProvider: false, routeExposureScore: null,
  simulation: 'Local demo server, synthetic public endpoints; no actual walk, vehicle or notification' }, null, 2));
