import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPocContext } from './poc-context';

test('POC context exposes collected breadth without claiming it is active cloud data or live coverage', () => {
  const r = loadPocContext('2026-09-19T21:00:00Z');
  assert.equal(r.source, 'local_public_snapshots');
  assert.equal(r.transit?.stops, 297);
  assert.equal(r.transit?.routes, 24);
  assert.equal(r.transit?.stopTimes, 74301);
  assert.equal(r.lightingMeasurements?.measurements, 72);
  assert.equal(r.waitingSites.length, 3);
  assert.ok(r.waitingSites.every(s => s.accessConfirmed === null && s.providerPickupPermitted === null));
  assert.equal(r.pedestrianPilot?.supportedDirections, 10);
  assert.equal(r.pedestrianPilot?.totalDirections, 50);
  assert.equal(r.campus.datasets.find(d => d.name === 'crime')?.count, 719);
  assert.equal(r.campus.unknowns.completeCrimeHistory, true);
});
test('published hours are neither indoor access nor pickup permission, and old captures do not renew themselves', () => {
  const r = loadPocContext('2026-09-21T21:00:00Z');
  assert.ok(r.waitingSites.every(s => s.hoursStatus === 'stale_or_outside_window'));
  assert.ok(r.waitingSites.every(s => s.accessConfirmed === null));
  assert.equal(loadPocContext('2026-09-30T21:00:00Z').transit?.snapshotFresh, false);
  assert.throws(() => loadPocContext('bad date'));
});
