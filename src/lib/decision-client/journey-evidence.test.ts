import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeLighting, planIndoorWait, type SourceWindow } from './journey-evidence';

const now = '2026-09-20T02:45:00Z';
const source: SourceWindow = { sourceUrl: 'https://apps.students.vt.edu/schours/', sourceVersion: 'a'.repeat(64), capturedAt: '2026-09-20T02:30:00Z', validUntil: '2026-09-20T03:30:00Z' };

test('pole inventory and stale observations remain unknown, while a sourced outage is unlit', () => {
  const result = summarizeLighting([
    { segmentId: 'a', lengthMeters: 100, observation: { ...source, kind: 'pole_inventory', state: 'lit' } },
    { segmentId: 'b', lengthMeters: 50, observation: { ...source, kind: 'operational', state: 'unlit' } },
    { segmentId: 'c', lengthMeters: 25, observation: { ...source, kind: 'operational', state: 'lit', validUntil: now } },
  ], now);
  assert.deepEqual(result, { totalMeters: 175, verifiedLitMeters: 0, verifiedUnlitMeters: 50, unknownMeters: 125, fullyVerified: false });
});

test('unknown illumination cannot be presented as full verified coverage; duplicate segments fail', () => {
  assert.equal(summarizeLighting([{ segmentId: 'a', lengthMeters: 10 }], now).fullyVerified, false);
  assert.equal(summarizeLighting([{ segmentId: 'a', lengthMeters: 10, observation: { ...source, kind: 'operational', state: 'lit' } }], now).fullyVerified, true);
  assert.throws(() => summarizeLighting([{ segmentId: 'a', lengthMeters: 10 }, { segmentId: 'a', lengthMeters: 10 }], now));
});

const site = { siteId: 'fixture-squires', indoor: true as const, source, accessAllowed: true as const,
  openWindows: [{ opensAt: '2026-09-19T13:00:00Z', closesAt: '2026-09-20T03:00:00Z' }] };
const pickup = { providerPickupPermitted: true as const, pickupAt: '2026-09-20T03:10:00Z', walkToPickupMinutes: 3, routeVerified: true as const };

test('closing indoors before pickup means leave at closing, not wait in a closed building', () => {
  const result = planIndoorWait(site, pickup, now);
  assert.equal(result.status, 'ESTIMATED');
  assert.equal(result.leaveWaitingPlaceAt, '2026-09-20T03:00:00.000Z');
  assert.equal(result.estimatedOutdoorWaitMinutes, 7);
  assert.equal(result.estimatedIndoorWaitMinutes, 15);
});

test('when pickup is before closing, walk departure is timed without inventing outdoor wait', () => {
  const result = planIndoorWait(site, { ...pickup, pickupAt: '2026-09-20T02:55:00Z' }, now);
  assert.equal(result.leaveWaitingPlaceAt, '2026-09-20T02:52:00.000Z');
  assert.equal(result.estimatedOutdoorWaitMinutes, 0);
});

test('unknown access, pickup permission, unverified path, stale hours or expired pickup are not actionable estimates', () => {
  const cases = [
    [ { ...site, accessAllowed: null }, pickup ],
    [ site, { ...pickup, providerPickupPermitted: null } ],
    [ site, { ...pickup, routeVerified: false } ],
    [ { ...site, source: { ...source, validUntil: now } }, pickup ],
    [ site, { ...pickup, pickupAt: now } ],
  ] as const;
  for (const [place, offer] of cases) {
    const result = planIndoorWait(place, offer, now);
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.estimatedOutdoorWaitMinutes, null);
    assert.equal(result.leaveWaitingPlaceAt, null);
  }
});

test('closed building or a future opening does not become an indoor waiting option', () => {
  assert.equal(planIndoorWait(site, pickup, '2026-09-20T03:01:00Z').status, 'CLOSED');
  assert.equal(planIndoorWait({ ...site, openWindows: [{ opensAt: '2026-09-20T03:00:00Z', closesAt: '2026-09-20T04:00:00Z' }] }, pickup, now).status, 'CLOSED');
});
