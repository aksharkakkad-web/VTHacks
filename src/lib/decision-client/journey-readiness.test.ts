import assert from 'node:assert/strict';
import test from 'node:test';
import { assessJourneyReadiness } from './journey-readiness';

// Synthetic fixtures exercise the contract; these are not operational records.
const now = '2026-09-20T02:45:00Z';
const source = { sourceUrl: 'https://apps.students.vt.edu/fixture/', sourceVersion: 'a'.repeat(64), capturedAt: '2026-09-20T02:30:00Z', validUntil: '2026-09-20T03:30:00Z' };
const segments = [
  { segmentId: 'first', lengthMeters: 100 },
  { segmentId: 'second', lengthMeters: 50 },
];
const route = { routeId: 'public-route', routeVersion: 'v1', segments };
const observedRoute = { routeId: 'public-route', routeVersion: 'v1', segments: [
  { ...segments[0], observation: { ...source, kind: 'operational' as const, state: 'lit' as const } },
  { ...segments[1], observation: { ...source, kind: 'operational' as const, state: 'unlit' as const } },
] };
const site = { siteId: 'fixture-site', indoor: true, source, accessAllowed: true,
  openWindows: [{ opensAt: '2026-09-19T13:00:00Z', closesAt: '2026-09-20T03:00:00Z' }] };
const providerPickup = { kind: 'provider' as const, providerId: 'provider-a', serviceId: 'service-a', siteId: 'fixture-site',
  pickupAt: '2026-09-20T03:10:00Z', walkToPickupMinutes: 3, routeVerified: true,
  permission: { providerId: 'provider-a', serviceId: 'service-a', siteId: 'fixture-site', permitted: true, source } };
const full = { evaluatedAt: now, expectedRoute: route, observedRoute, lightingRequired: true,
  pickup: providerPickup, waitingSite: site };

test('fully evidenced synthetic journey reports coverage without authorizing a booking', () => {
  const result = assessJourneyReadiness(full);
  assert.equal(result.coverage, 'complete');
  assert.equal(result.bookingAuthorized, false);
  assert.equal(result.availabilityImpact, 'none');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.route.inventoryMatches, true);
  assert.equal(result.lighting.state, 'mixed_lit_unlit');
  assert.equal(result.lighting.summary?.verifiedLitMeters, 100);
  assert.equal(result.lighting.summary?.verifiedUnlitMeters, 50);
  assert.equal(result.pickup.status, 'supported');
  assert.equal(result.pickup.sourceValidity, 'valid');
  assert.equal(result.indoorWaiting.status, 'estimated');
});

test('missing and stale operational lighting cannot satisfy required coverage', () => {
  for (const changed of [
    { ...observedRoute, segments: [observedRoute.segments[0], { ...segments[1] }] },
    { ...observedRoute, segments: [observedRoute.segments[0], { ...observedRoute.segments[1], observation: { ...observedRoute.segments[1].observation, validUntil: now } }] },
  ]) {
    const result = assessJourneyReadiness({ ...full, observedRoute: changed });
    assert.equal(result.coverage, 'incomplete');
    assert.equal(result.lighting.summary?.unknownMeters, 50);
    assert.ok(result.reasons.includes('LIGHTING_UNKNOWN'));
  }
});

test('partial, duplicate, reordered, length-mismatched, and version-mismatched route evidence never produces complete coverage', () => {
  const cases = [
    { ...observedRoute, segments: [observedRoute.segments[0]] },
    { ...observedRoute, segments: [observedRoute.segments[0], observedRoute.segments[0]] },
    { ...observedRoute, segments: [...observedRoute.segments].reverse() },
    { ...observedRoute, segments: [observedRoute.segments[0], { ...observedRoute.segments[1], lengthMeters: 51 }] },
    { ...observedRoute, routeVersion: 'v2' },
  ];
  for (const changed of cases) {
    const result = assessJourneyReadiness({ ...full, observedRoute: changed });
    assert.equal(result.coverage, 'incomplete');
    assert.equal(result.route.inventoryMatches, false);
    assert.ok(result.reasons.includes('ROUTE_INVENTORY_MISMATCH'));
  }
});

test('asset inventory, future observation, and unknown state stay unknown while all-lit and all-unlit remain distinct', () => {
  for (const observation of [
    { ...source, kind: 'pole_inventory' as const, state: 'lit' as const },
    { ...source, kind: 'operational' as const, state: 'lit' as const, capturedAt: '2026-09-20T03:00:00Z' },
    { ...source, kind: 'operational' as const, state: 'unknown' as const },
  ]) {
    const result = assessJourneyReadiness({ ...full, observedRoute: { ...observedRoute, segments: [
      { ...segments[0], observation }, observedRoute.segments[1],
    ] } });
    assert.equal(result.lighting.summary?.unknownMeters, 100);
    assert.equal(result.coverage, 'incomplete');
  }
  const lit = assessJourneyReadiness({ ...full, observedRoute: { ...observedRoute, segments: observedRoute.segments.map(segment => ({ ...segment, observation: { ...segment.observation, state: 'lit' as const } })) } });
  const unlit = assessJourneyReadiness({ ...full, observedRoute: { ...observedRoute, segments: observedRoute.segments.map(segment => ({ ...segment, observation: { ...segment.observation, state: 'unlit' as const } })) } });
  assert.equal(lit.lighting.state, 'all_lit');
  assert.equal(unlit.lighting.state, 'all_unlit');
  assert.equal(unlit.coverage, 'complete');
});

test('provider, service, and site permissions are bound to the exact pickup', () => {
  for (const permission of [
    { ...providerPickup.permission, providerId: 'provider-b' },
    { ...providerPickup.permission, serviceId: 'service-b' },
    { ...providerPickup.permission, siteId: 'other-site' },
  ]) {
    const result = assessJourneyReadiness({ ...full, pickup: { ...providerPickup, permission } });
    assert.equal(result.pickup.status, 'unknown');
    assert.ok(result.reasons.includes('PICKUP_PERMISSION_MISMATCH'));
  }
  const waitingMismatch = assessJourneyReadiness({ ...full, waitingSite: { ...site, siteId: 'other-site' } });
  assert.equal(waitingMismatch.indoorWaiting.status, 'unknown');
  assert.ok(waitingMismatch.reasons.includes('WAITING_SITE_MISMATCH'));
});

test('stale permission, expired before pickup, and unverified pickup route remain unsupported', () => {
  const stale = assessJourneyReadiness({ ...full, pickup: { ...providerPickup, permission: { ...providerPickup.permission, source: { ...source, capturedAt: '2026-09-19T02:30:00Z', validUntil: '2026-09-20T03:30:00Z' } } } });
  assert.equal(stale.pickup.status, 'unknown');
  assert.equal(stale.pickup.sourceValidity, 'stale');
  const expiresBeforePickup = assessJourneyReadiness({ ...full, pickup: { ...providerPickup, permission: { ...providerPickup.permission, source: { ...source, validUntil: '2026-09-20T03:05:00Z' } } } });
  assert.ok(expiresBeforePickup.reasons.includes('PICKUP_PERMISSION_TIME_UNCOVERED'));
  const unverified = assessJourneyReadiness({ ...full, pickup: { ...providerPickup, routeVerified: false } });
  assert.ok(unverified.reasons.includes('PICKUP_ROUTE_UNVERIFIED'));
});

test('closed or inaccessible waiting cannot be claimed, but optional unclaimed waiting does not block coverage', () => {
  const closed = assessJourneyReadiness({ ...full, waitingSite: { ...site, openWindows: [{ opensAt: '2026-09-20T03:00:00Z', closesAt: '2026-09-20T04:00:00Z' }] } });
  assert.equal(closed.indoorWaiting.status, 'closed');
  assert.ok(closed.reasons.includes('INDOOR_WAIT_NOT_SUPPORTED'));
  const inaccessible = assessJourneyReadiness({ ...full, waitingSite: { ...site, accessAllowed: null } });
  assert.equal(inaccessible.indoorWaiting.status, 'unknown');
  const noClaim = assessJourneyReadiness({ ...full, waitingSite: undefined });
  assert.equal(noClaim.indoorWaiting.status, 'not_claimed');
  assert.equal(noClaim.coverage, 'complete');
});

test('walking without a provider explicitly omits pickup and indoor waiting requirements', () => {
  const result = assessJourneyReadiness({ ...full, pickup: { kind: 'walk' }, waitingSite: undefined });
  assert.equal(result.coverage, 'complete');
  assert.equal(result.pickup.status, 'not_applicable');
  assert.equal(result.indoorWaiting.status, 'not_claimed');
  assert.equal(result.bookingAuthorized, false);
});

test('past pickup instant cannot be covered by a currently fresh permission', () => {
  const result = assessJourneyReadiness({ ...full, pickup: { ...providerPickup, pickupAt: now }, waitingSite: undefined });
  assert.equal(result.pickup.status, 'unknown');
  assert.ok(result.reasons.includes('PICKUP_PERMISSION_TIME_UNCOVERED'));
});

test('malformed waiting hours remain an invalid claim rather than crashing the assessment', () => {
  const result = assessJourneyReadiness({ ...full, waitingSite: { ...site, openWindows: [
    { opensAt: '2026-09-20T03:00:00Z', closesAt: '2026-09-20T02:00:00Z' },
  ] } });
  assert.equal(result.coverage, 'incomplete');
  assert.equal(result.indoorWaiting.status, 'unknown');
  assert.ok(result.reasons.includes('WAITING_HOURS_INVALID'));
  assert.ok(result.reasons.includes('INDOOR_WAIT_NOT_SUPPORTED'));
});
