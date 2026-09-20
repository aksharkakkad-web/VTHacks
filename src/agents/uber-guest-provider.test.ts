import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryJsonStore } from '../lib/planner/store';
import { UberGuestProvider, emptyUberGuestProviderState } from './uber-guest-provider';
import type { ProviderQuote, TripRequest } from './contract';
import { StudentAgent } from './student/service';
import { MemoryTripStore } from '../lib/trip-state/store';
import { LocalDemoDirectory } from '../integrations/ans/directory';
import { planJourney } from '../lib/decision-client/journey-planner';
import { distanceMeters } from '../lib/decision-client/walking-router';
import type { JourneyRequest } from '../lib/decision-client/journey-types';

const time = 1_800_000_000_000;
const query = { originZone: 'Downtown Blacksburg', destinationZone: 'VT residential campus', maxBudget: 10, minimizeWalking: true, minimizeTransfers: true };
const estimate = { etas_unavailable: false, fares_unavailable: false, product_estimates: [{ product: { product_id: 'product-1', parent_product_type_id: 'parent-1', display_name: 'UberX', upfront_fare_enabled: true, cancellation: { min_cancellation_fee: 1 } }, estimate_info: { fare_id: 'fare-1', pickup_estimate: 4, trip: { duration_estimate: 600 }, fare: { currency_code: 'USD', value: 7, expires_at: time / 1000 + 120 } } }] };
const fixtureTrip = { request_id: 'ride-1', status: 'accepted', driver: { name: 'Sandbox Driver', phone_number: 'do-not-forward' }, vehicle: { make: 'Toyota', model: 'Prius', vehicle_color_name: 'White', license_plate: 'TEST123' }, pickup: { latitude: 37.229, longitude: -80.414, eta: 3 }, destination: { latitude: 37.221, longitude: -80.420 }, guest: { guest_id: 'synthetic-guest' }, product: { product_id: 'product-1' } };
function payload(q: ProviderQuote): TripRequest {
  assert.ok(q.network);
  return { tripId: 'beacon-request', pickup: { lat: 37.229, lng: -80.414 }, destination: { lat: 37.221, lng: -80.420 }, network: { offer: q.network.offer, consentId: 'confirmed-consent' } };
}
function setup() {
  const store = new MemoryJsonStore(emptyUberGuestProviderState());
  const calls: { url: string; method: string; body: unknown }[] = [];
  let now = time, status = 'accepted', uncertain = false, reject = false, match = false, memo = '';
  const config = { enabled: true, demoMode: true, apiFamily: 'guest-rides', accessToken: 'fixture-token', runId: 'run-1', guestId: 'synthetic-guest', now: () => now };
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)); const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), method, body });
    if (path.pathname.endsWith('/estimates')) return Response.json(estimate);
    if (method === 'POST') { memo = body.expense_memo; if (reject) return new Response(null, { status: 403 }); if (uncertain) throw Error('network lost'); }
    if (method === 'DELETE') { status = 'rider_canceled'; return new Response(null, { status: 204 }); }
    const trip = { ...fixtureTrip, status, expense_memo: memo };
    return Response.json(path.search ? { trips: match ? [trip] : [] } : trip);
  };
  const provider = () => new UberGuestProvider(config, { store, fetch: fetcher });
  return { store, calls, config, fetcher, provider, clock: (value: number) => { now = value; }, status: (value: string) => { status = value; }, uncertain: () => { uncertain = true; }, reject: () => { reject = true; }, match: () => { match = true; } };
}

test('Uber bridge gates sandbox use, rejects unrelated coarse routes, and exposes no quote passenger information', async () => {
  const f = setup();
  for (const override of [{ enabled: false }, { demoMode: false }, { guestId: '' }, { apiFamily: 'riders' }]) {
    await assert.rejects(new UberGuestProvider({ ...f.config, ...override }, { store: f.store, fetch: f.fetcher }).quote(query));
  }
  await assert.rejects(f.provider().quote({ ...query, originZone: 'another city' }));
  assert.equal(f.calls.length, 0);
  const q = await f.provider().quote({ ...query, phone: 'do-not-forward', pickup: { lat: 1, lng: 2 } } as typeof query);
  assert.equal(q.cost, 7); assert.equal(q.quoteSource, 'simulated'); assert.equal(q.network?.manifest.operatorAnsId, null);
  assert.equal(q.network?.offer.cancellation.feeMinor, 700);
  assert.match(q.network!.offer.pickup.instructions, /no real charge/i);
  assert.deepEqual(f.calls[0].body, { pickup: { latitude: 37.229, longitude: -80.414 }, dropoff: { latitude: 37.221, longitude: -80.420 } });
  assert.ok(!JSON.stringify(q).includes('fixture-token'));
  const binding = await f.provider().journeyRideBinding(q.network!);
  assert.equal(binding?.pickupPermitted, true); assert.match(binding!.pickup.name, /simulated/i);
  assert.deepEqual(binding?.pickup.point, { lat: 37.229, lng: -80.414 });
  assert.equal(await f.provider().journeyRideBinding({ ...q.network!, offer: { ...q.network!.offer, quoteId: 'unissued' } }), null);
});

test('Uber bridge binds consent, exact synthetic endpoints and persisted fare before booking', async () => {
  const f = setup(), p = f.provider(), q = await p.quote(query), request = payload(q);
  for (const changed of [
    { ...request, pickup: { lat: 38, lng: -80 } },
    { ...request, destination: { lat: 38, lng: -80 } },
    { ...request, network: { ...request.network!, consentId: '' } },
    { ...request, network: { ...request.network!, offer: { ...request.network!.offer, price: { ...request.network!.offer.price, totalMinor: 1 } } } },
  ]) await assert.rejects(p.requestTrip(changed));
  assert.equal(f.calls.length, 1);
  const booked = await p.requestTrip(request);
  assert.equal(booked.status, 'waiting'); assert.equal(booked.details?.stage, 'assigned');
  assert.equal(booked.details?.pickupEtaSeconds, 180); assert.equal(booked.details?.vehicle?.licensePlate, 'TEST123');
  assert.equal(booked.payment?.state, 'authorized'); assert.equal(booked.payment?.amountMinor, 700);
  assert.ok(!JSON.stringify(booked).includes('do-not-forward'));
  const body = f.calls[1].body as Record<string, unknown>;
  assert.deepEqual(body.guest, { guest_id: 'synthetic-guest' }); assert.equal(body.fare_id, 'fare-1');
  assert.deepEqual(await f.provider().requestTrip(request), booked);
  await assert.rejects(f.provider().requestTrip({ ...request, network: { ...request.network!, consentId: 'different-consent' } }));
  assert.equal(f.calls.filter(c => c.method === 'POST' && !c.url.endsWith('/estimates')).length, 1);
  f.clock(time + 121_000);
  await assert.rejects(p.requestTrip({ ...request, tripId: 'stale-new-request' }));
});

test('Uber bridge never rebooks uncertain intent across restart or treats absent reconciliation as rejection', async () => {
  const f = setup(), p = f.provider(), request = payload(await p.quote(query)); f.uncertain();
  await assert.rejects(p.requestTrip(request), /BOOKING_UNCERTAIN/);
  await assert.rejects(f.provider().requestTrip(request), /BOOKING_UNCERTAIN/);
  await assert.rejects(f.provider().getRequestStatus(request.tripId), /BOOKING_UNCERTAIN/);
  assert.equal(f.calls.filter(c => c.method === 'POST' && !c.url.endsWith('/estimates')).length, 1);
  f.match();
  const reconciled = await f.provider().getRequestStatus(request.tripId);
  assert.equal(reconciled?.status, 'waiting'); assert.equal(reconciled?.payment?.amountMinor, 700);
});

test('Uber bridge cancellation settles the full simulated fare and terminal completion cannot be refunded or resurrected', async () => {
  const f = setup(), p = f.provider(), request = payload(await p.quote(query));
  const booked = await p.requestTrip(request), cancelled = await p.cancelTrip(booked.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.payment, { mode: 'simulated', currency: 'USD', amountMinor: 700, retainedMinor: 700, state: 'captured' });
  f.status('accepted'); assert.deepEqual(await f.provider().getStatus(booked.id), cancelled);
  const other = setup(), otherP = other.provider(), done = await otherP.requestTrip(payload(await otherP.quote(query)));
  other.status('completed');
  assert.equal((await otherP.getStatus(done.id)).payment?.retainedMinor, 700);
  const calls = other.calls.length;
  assert.equal((await otherP.cancelTrip(done.id)).payment?.state, 'captured'); assert.equal(other.calls.length, calls);
});

test('Uber bridge tombstones cancellation before booking and reports definite rejection without a phantom charge', async () => {
  const f = setup(), p = f.provider(), request = payload(await p.quote(query));
  assert.equal(await p.getRequestStatus('missing'), undefined);
  assert.equal((await p.cancelRequest(request.tripId)).status, 'cancelled');
  assert.equal((await f.provider().requestTrip(request)).status, 'cancelled');
  assert.equal(f.calls.length, 1);
  const other = setup(), otherP = other.provider(), otherRequest = payload(await otherP.quote(query)); other.reject();
  const declined = await otherP.requestTrip(otherRequest);
  assert.equal(declined.status, 'declined'); assert.equal(declined.payment?.state, 'voided');
  assert.equal((await other.provider().getRequestStatus(otherRequest.tripId))?.status, 'declined');
});

test('Uber bridge preserves unknown provider update time and maps status without inventing arrival', async () => {
  const f = setup(), p = f.provider(), request = payload(await p.quote(query));
  f.status('processing'); const booked = await p.requestTrip(request);
  assert.equal(booked.details?.stage, 'searching');
  assert.equal(booked.details?.updatedAt, undefined);
  f.status('arriving'); assert.equal((await p.getStatus(booked.id)).details?.stage, 'approaching');
  f.status('in_progress'); const inTrip = await p.getStatus(booked.id);
  assert.equal(inTrip.status, 'in_trip'); assert.equal(inTrip.details?.pickupEtaSeconds, undefined);
});

test('Uber bridge timeout and concurrent retry issue one POST, and cancellation during uncertainty survives restart', async () => {
  const f = setup(); let posts = 0;
  const stalled: typeof fetch = async (url, init) => {
    if (init?.method === 'POST' && !String(url).endsWith('/estimates')) { posts++; return new Promise<Response>(() => {}); }
    return f.fetcher(url, init);
  };
  const provider = () => new UberGuestProvider({ ...f.config, timeoutMs: 10 }, { store: f.store, fetch: stalled });
  const p = provider(), request = payload(await p.quote(query));
  const attempts = await Promise.allSettled([p.requestTrip(request), provider().requestTrip(request)]);
  assert.ok(attempts.every(a => a.status === 'rejected')); assert.equal(posts, 1);
  await assert.rejects(provider().cancelRequest(request.tripId), /BOOKING_UNCERTAIN/);
  await assert.rejects(provider().getRequestStatus(request.tripId), /BOOKING_UNCERTAIN/);
  assert.equal(posts, 1);
  const saved = await f.store.read();
  assert.equal(Object.values(saved.requests)[0].result, undefined, 'uncertain requests have no fabricated terminal settlement');
});

test('Uber bridge confirmed declines void only the simulated authorization and survive restart', async () => {
  for (const status of ['no_drivers_available', 'failed']) {
    const f = setup(), p = f.provider(), request = payload(await p.quote(query));
    const booked = await p.requestTrip(request); f.status(status);
    const declined = await p.getStatus(booked.id);
    assert.equal(declined.status, 'declined');
    assert.deepEqual(declined.payment, { mode: 'simulated', currency: 'USD', amountMinor: 700, retainedMinor: 0, state: 'voided' });
    assert.deepEqual(await f.provider().getRequestStatus(request.tripId), declined);
  }
});

test('Uber bridge terminal cancellation lets StudentAgent replan with the retained demo fare deducted once', async () => {
  const f = setup(), provider = f.provider(), store = new MemoryTripStore(), requests: JourneyRequest[] = [];
  const directory = new LocalDemoDirectory([provider.descriptor], true);
  const agent = new StudentAgent({
    store, demo: true, clock: () => time,
    directory: { discover: () => directory.discover(), verify: async descriptor => ({ ...await directory.verify(descriptor), validUntil: time + 60_000 }) },
    provider: () => provider,
    recommend: async plans => ({ selectedPlanId: plans[0].planId, reasonCodes: ['FIXTURE'], explanation: 'Fixture', evaluatedAt: new Date(time).toISOString() }),
    notify: async () => ({ id: 'fixture', simulated: true }),
    journeyRideBinding: network => provider.journeyRideBinding(network),
    getCompleteJourney: async request => {
      requests.push(structuredClone(request));
      return planJourney(request, {
        route: async (from, to, at) => {
          const meters = distanceMeters(from, to), seconds = meters > 400 ? 1800 : 60;
          return { routeId: 'fixture-route', from, to, geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [(from.lng + to.lng) / 2, (from.lat + to.lat) / 2], [to.lng, to.lat]] }, distanceMeters: meters, durationSeconds: seconds,
            instructions: [{ text: 'Fixture path', distanceMeters: meters, durationSeconds: seconds }], provider: 'fixture_only', capturedAt: at, validUntil: new Date(time + 300_000).toISOString() };
        },
        evidence: () => ({ blocked: false, validUntil: null, facts: [], unknowns: ['LIGHTING_UNKNOWN'] }),
      });
    },
  });
  const created = await agent.create('owner', { journeyContract: 'beacon-journey-v1', origin: { lat: 37.229, lng: -80.414 }, preferences: { home: { lat: 37.221, lng: -80.420 }, maxBudget: 10 } });
  const id = created.id;
  await agent.act(id, 'owner', 'discover'); await agent.act(id, 'owner', 'evaluate');
  const selected = await agent.journey(id, 'owner');
  assert.equal(selected.trip.selectedPlan?.providerId, provider.descriptor.id);
  await agent.act(id, 'owner', 'confirm', { journeyRevision: selected.journey.revision, planId: selected.trip.selectedPlan!.planId, quoteId: selected.journey.selectedOffer!.quoteId });
  await agent.act(id, 'owner', 'verify'); await agent.act(id, 'owner', 'request');
  await agent.act(id, 'owner', 'cancel-provider');
  assert.equal(requests.at(-1)?.objectiveVersion, 1);
  assert.equal(requests.at(-1)?.committedMinor, 700);
  assert.equal(requests.at(-1)?.remainingBudgetMinor, 300);
  const recovered = await store.read(id);
  assert.equal(recovered.pendingBooking, undefined); assert.equal(recovered.networkAction, undefined);
  assert.equal(recovered.networkAttempts?.length, 1); assert.equal(recovered.networkAttempts[0].payment.retainedMinor, 700);
  assert.equal((await agent.journey(id, 'owner')).trip.selectedPlan?.mode, 'walk');
});

test('Uber bridge preserves supported provider instructions without making a successful booking unreadable', async () => {
  const f = setup(), note = 'A'.repeat(500);
  const fetcher: typeof fetch = async (url, init) => {
    const response = await f.fetcher(url, init);
    if (String(url).endsWith('/estimates')) return response;
    const body = await response.json(); body.pickup.rider_wayfinding_note = note;
    return Response.json(body);
  };
  const p = new UberGuestProvider(f.config, { store: f.store, fetch: fetcher });
  const booked = await p.requestTrip(payload(await p.quote(query)));
  assert.equal(booked.details?.meetingInstructions, note);
});
