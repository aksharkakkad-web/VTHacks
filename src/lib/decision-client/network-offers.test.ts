import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNetworkOffers, evaluateNetworkOffers, type NetworkOffer } from './network-offers';
import { evaluateCandidates } from './decision';
const at = '2026-09-19T20:00:00Z';
const offer = (overrides: Partial<NetworkOffer> = {}): NetworkOffer => ({
  operatorId: 'demo-operator', serviceId: 'campus', quoteId: 'q1', offerVersion: '1',
  displayName: 'Campus service', mode: 'campus_ride', source: 'simulated', available: true,
  issuedAt: at, expiresAt: '2026-09-19T20:02:00Z',
  admission: { serviceAreaMatch: true, authSupported: true, paymentSupported: true },
  price: { currency: 'USD', kind: 'fixed', totalMinor: 700, includesAllFees: true },
  waitMinutes: 5, travelMinutes: 10, walkingMinutes: 1, transfers: 0,
  ...overrides,
});
const context = { maxBudget: 10, evaluatedAt: at, minimizeWalking: true };
test('network services of one operator remain distinct and selected mapping binds exact offer version', async () => {
  const offers = [offer(), offer({ serviceId: 'independent', quoteId: 'q2', price: { currency: 'USD', kind: 'fixed', totalMinor: 0, includesAllFees: true } })];
  const r = await evaluateNetworkOffers(offers, context, {}, async (plans, c, signals) => evaluateCandidates(plans, c, signals));
  assert.equal(r.decision.status, 'RECOMMENDED');
  assert.equal(r.selectedOffer?.serviceId, 'independent');
  assert.equal(r.selectedOffer?.quoteId, 'q2');
  assert.equal(r.selectedOffer?.offerVersion, '1');
  assert.equal(r.selectedOffer?.maximumCostMinor, 0);
  assert.equal(new Set(r.decision.ranked.map(p => p.planId)).size, 2);
});
test('recovery subtracts existing liabilities and never adds pending refunds to budget', () => {
  const p = prepareNetworkOffers([offer()], context, { committedMinor: 400 });
  assert.equal(p.context.maxBudget, 6);
  assert.equal(evaluateCandidates(p.candidates, p.context, p.signals).status, 'NO_FEASIBLE_PLAN');
  assert.throws(() => prepareNetworkOffers([offer()], context, { committedMinor: -1 }));
  assert.equal(prepareNetworkOffers([offer()], context, { committedMinor: 2000 }).context.maxBudget, 0);
});
test('ineligible, expired and unbounded or incomplete price offers never become candidates', () => {
  const invalid = [
    offer({ expiresAt: at }),
    offer({ issuedAt: '2026-09-19T20:01:00Z' }),
    offer({ available: false }),
    offer({ source: 'scheduled', mode: 'campus_ride' }),
    offer({ admission: { serviceAreaMatch: false, authSupported: true, paymentSupported: true } }),
    offer({ price: { currency: 'EUR', kind: 'fixed', totalMinor: 7, includesAllFees: true } }),
    offer({ price: { currency: 'USD', kind: 'fixed', totalMinor: 700, includesAllFees: false } }),
    offer({ price: { currency: 'USD', kind: 'estimate', totalMinor: 300, includesAllFees: true } }),
  ];
  for (const item of invalid) {
    const r = prepareNetworkOffers([item], context);
    assert.equal(r.candidates.length, 0);
    assert.equal(Object.keys(r.rejectedOffers).length, 1);
  }
});
test('binding price caps are compared at the cap and missing route evidence stays nonblocking', () => {
  const p = prepareNetworkOffers([offer({ price: { currency: 'USD', kind: 'capped', totalMinor: 300, maximumMinor: 900, includesAllFees: true } })], context);
  assert.equal(p.candidates[0].cost, 9);
  assert.equal(p.signals[p.candidates[0].planId].lighting, 'unknown');
  assert.ok(p.warnings.includes('ROUTE_LIGHTING_AND_PICKUP_COVERAGE_MAY_BE_UNKNOWN'));
  assert.equal(evaluateCandidates(p.candidates, p.context, p.signals).status, 'RECOMMENDED');
});
test('service exclusion is narrower than operator exclusion and unknown transfers remain unknown', () => {
  const p = prepareNetworkOffers([offer({ transfers: undefined }), offer({ serviceId: 'second', quoteId: 'q2' })], context, { excludedServices: [{ operatorId: 'demo-operator', serviceId: 'second' }] });
  assert.equal(p.candidates.length, 1);
  assert.equal(p.candidates[0].transfers, undefined);
  assert.equal(evaluateCandidates(p.candidates, p.context, p.signals).ranked[0].transfers, null);
});
test('duplicate identities fail without overwriting mappings and SQL input does not receive offer payload', () => {
  assert.throws(() => prepareNetworkOffers([offer(), offer()], context));
  const dirty = { ...offer(), paymentGrant: 'private-grant', exactLocation: 'private-location' };
  const p = prepareNetworkOffers([dirty], context);
  assert.ok(!JSON.stringify(p).includes('private-grant'));
  assert.ok(!JSON.stringify(p).includes('private-location'));
  assert.equal('metadata' in p.candidates[0], false);
});

test('recovery excludes only the failed operator/service pair', () => {
  const p = prepareNetworkOffers([offer(), offer({ operatorId: 'another-operator' })], context, {
    excludedServices: [{ operatorId: 'demo-operator', serviceId: 'campus' }],
  });
  assert.equal(p.candidates.length, 1);
  assert.equal(p.candidates[0].providerId, 'another-operator');
});

test('public walking competes with network rides using the same remaining budget', async () => {
  const option = {
    candidate: { planId: 'public-walk', providerId: null, providerName: 'Mapped walk', mode: 'walk' as const,
      available: true, cost: 0, waitMinutes: 0, travelMinutes: 0, walkingMinutes: 5, totalMinutes: 5, transfers: 0, requiresProviderVerification: false },
    signals: { source: 'mapped' as const, collectedAt: at, validUntil: '2026-09-19T20:02:00Z', dataVersion: 'actual-map-version', lighting: 'unknown' as const },
  };
  const evaluate: Parameters<typeof evaluateNetworkOffers>[3] = async (plans, c, signals) => evaluateCandidates(plans, c, signals);
  const r = await evaluateNetworkOffers([offer()], context, { committedMinor: 400 }, evaluate, [option]);
  assert.equal(r.decision.status, 'RECOMMENDED');
  if (r.decision.status === 'RECOMMENDED') assert.equal(r.decision.recommendation.selectedPlanId, 'public-walk');
  assert.equal(r.selectedOffer, null);
  assert.equal(r.remainingBudgetMinor, 600);
  const closed = await evaluateNetworkOffers([offer()], context, { committedMinor: 400 }, evaluate, [{ ...option, signals: { ...option.signals, walkingPathClosed: true } }]);
  assert.equal(closed.decision.status, 'NO_FEASIBLE_PLAN');
  await assert.rejects(evaluateNetworkOffers([], context, {}, evaluate, [option, option]), /public option/);
});

test('public transit retains explicit access estimates in the combined result', async () => {
  const bus = {
    candidate: { planId: 'public-bus', providerId: 'blacksburg-transit', providerName: 'Scheduled bus', mode: 'transit' as const,
      available: true, cost: 0, waitMinutes: 2, travelMinutes: 5, walkingMinutes: 6, totalMinutes: 13, transfers: 0, requiresProviderVerification: false },
    signals: { source: 'scheduled' as const, collectedAt: at, validUntil: '2026-09-19T20:02:00Z', dataVersion: 'a'.repeat(64) },
    source: { walkingSource: 'estimated' as const, sourceSha256: 'a'.repeat(64), capturedAt: at, serviceDate: '2026-09-19', tripId: 'trip', routeId: 'route', fromStopId: '8008', toStopId: '1400', departureAt: '2026-09-19T20:05:00Z', arrivalAt: '2026-09-19T20:10:00Z' },
    statementId: 'public-transit-query', warnings: ['Stop walks are estimated, not verified routes.'],
  };
  const evaluate: Parameters<typeof evaluateNetworkOffers>[3] = async (p, c, s) => evaluateCandidates(p, c, s);
  const result = await evaluateNetworkOffers([], context, {}, evaluate, [bus]);
  assert.equal(result.publicOptionEvidence[0].planId, 'public-bus');
  assert.equal(result.publicOptionEvidence[0].walkingSource, 'estimated');
  assert.equal(result.publicOptionEvidence[0].statementId, 'public-transit-query');
  assert.ok(result.publicOptionEvidence[0].warnings[0].includes('estimated'));
  const missing = await evaluateNetworkOffers([], context, {}, evaluate, [{ candidate: bus.candidate, signals: bus.signals }]);
  assert.equal(missing.publicOptionEvidence[0].walkingSource, 'unknown');
  assert.ok(missing.publicOptionEvidence[0].warnings.some(w => w.includes('unknown')));
});
