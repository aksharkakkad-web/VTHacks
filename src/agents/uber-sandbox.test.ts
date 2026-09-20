import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuestRidesSandboxClient, UberSandboxError, prepareBooking,
  type BookingJournal, type BookingRecord, type SandboxAuthorization,
} from '../integrations/uber/guest-rides-sandbox';

const route = { pickup: { latitude: 37.766192, longitude: -122.400745 }, dropoff: { latitude: 37.752030, longitude: -122.422065 } };
const now = 1_800_000_000_000;
const auth: SandboxAuthorization = { identityVerified: true, preciseLocationAuthorized: true, userConfirmed: true };
const config = { enabled: true, apiFamily: 'guest-rides' as const, accessToken: 'fixture-secret', organizationId: 'test-org', now: () => now };
const estimate = { etas_unavailable: false, fares_unavailable: false, product_estimates: [{ product: { product_id: 'product-1', parent_product_type_id: 'parent-1', display_name: 'UberX', upfront_fare_enabled: true, cancellation: { min_cancellation_fee: 5 } }, estimate_info: { fare_id: 'fare-1', pickup_estimate: 4, trip: { duration_estimate: 927 }, fare: { fare_id: 'fare-1', currency_code: 'USD', value: 11.96, expires_at: now / 1000 + 120 } } }] };
const trip = { request_id: 'request-1', status: 'accepted', expense_memo: 'beacon:00000000-0000-4000-8000-000000000001', guest: { guest_id: 'sandbox-guest' }, product: { product_id: 'product-1' }, pickup: { ...route.pickup, eta: 3 }, destination: { ...route.dropoff, eta: 18 }, driver: { id: 'driver-1', name: 'Test Driver', phone_number: 'must-not-leak' }, vehicle: { make: 'Toyota', model: 'Prius', vehicle_color_name: 'White', license_plate: 'TEST123' } };
const key = '00000000-0000-4000-8000-000000000001';
function journal(): BookingJournal {
  const records = new Map<string, BookingRecord>();
  return {
    async claim(record) { if (records.has(record.bookingKey)) return false; records.set(record.bookingKey, structuredClone(record)); return true; },
    async read(k) { const value = records.get(k); return value && structuredClone(value); },
    async save(record) { records.set(record.bookingKey, structuredClone(record)); },
  };
}
function client(fetcher: typeof fetch, records = journal()) { return new GuestRidesSandboxClient(config, { fetch: fetcher, journal: records }); }
async function booking(records = journal()) {
  const quote = (await client(async () => Response.json(estimate), records).estimates('run-1', route, auth))[0];
  return prepareBooking({ bookingKey: key, quote, guestId: 'sandbox-guest', approvedAmountMinor: 1196 }, now);
}
const errorCode = (code: string) => (error: unknown) => error instanceof UberSandboxError && error.code === code;

test('Uber sandbox is disabled by default and rejects missing credentials or wrong API family before HTTP', async () => {
  let requests = 0;
  const fetcher: typeof fetch = async () => { requests++; throw Error('must not call'); };
  for (const [options, code] of [[{}, 'DISABLED'], [{ enabled: true, apiFamily: 'riders', accessToken: 'secret' }, 'UNSUPPORTED_API_FAMILY'], [{ enabled: true, apiFamily: 'guest-rides' }, 'MISSING_CREDENTIALS']] as const) {
    await assert.rejects(new GuestRidesSandboxClient(options, { fetch: fetcher }).getRun('run-1'), errorCode(code));
  }
  assert.equal(requests, 0);
});

test('Uber sandbox run workflow pins host, headers and sanitized access results', async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const c = client(async (url, init) => { requests.push({ url: String(url), init }); return Response.json(requests.length === 1 ? { run_id: 'run-1' } : { run_id: 'run-1', driver_ids: ['driver-1'] }); });
  assert.deepEqual(await c.createRun({ ...route, parentProductTypeId: 'parent-1' }, auth), { runId: 'run-1' });
  assert.deepEqual(await c.checkAccess('run-1'), { status: 'available', apiFamily: 'guest-rides', sandbox: true });
  assert.equal(requests[0].url, 'https://sandbox-api.uber.com/v1/guests/sandbox/run');
  assert.equal(requests[0].init?.redirect, 'error');
  assert.equal(new Headers(requests[0].init?.headers).get('authorization'), 'Bearer fixture-secret');
  assert.equal(new Headers(requests[0].init?.headers).get('x-uber-organizationuuid'), 'test-org');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { pickup_location: route.pickup, dropoff_location: route.dropoff, driver_locations: [{}], parent_product_type_id: 'parent-1' });
  const denied = await client(async () => new Response('fixture-secret and personal data', { status: 403 })).checkAccess('run-1');
  assert.deepEqual(denied, { status: 'unavailable', reason: 'ACCESS_DENIED', apiFamily: 'guest-rides', sandbox: true });
});

test('Uber sandbox estimates require all disclosure gates and preserve validated fare binding', async () => {
  let requests = 0;
  const c = client(async (url, init) => { requests++; assert.equal(String(url), 'https://sandbox-api.uber.com/v1/guests/trips/estimates'); assert.equal(new Headers(init?.headers).get('x-uber-sandbox-runuuid'), 'run-1'); assert.deepEqual(JSON.parse(String(init?.body)), route); return Response.json(estimate); });
  for (const field of ['identityVerified', 'preciseLocationAuthorized', 'userConfirmed'] as const) await assert.rejects(c.estimates('run-1', route, { ...auth, [field]: false }), errorCode('AUTHORIZATION_REQUIRED'));
  assert.equal(requests, 0);
  const [quote] = await c.estimates('run-1', route, auth);
  assert.equal(quote.amountMinor, 1196); assert.equal(quote.pickupEtaMinutes, 4); assert.equal(quote.travelSeconds, 927); assert.equal(quote.expiresAt, now + 120_000); assert.equal(quote.source, 'uber_guest_rides_sandbox');
  assert.deepEqual(quote.route, route);
  assert.equal(quote.cancellationFeeMaximumMinor, null, 'minimum fee is not a maximum liability');
});

test('Uber sandbox never invents usable offers from missing fare, ETA, unavailable cars or expired fares', async () => {
  for (const modify of [
    (e: typeof estimate) => { e.fares_unavailable = true; },
    (e: typeof estimate) => { e.etas_unavailable = true; },
    (e: typeof estimate) => { e.product_estimates[0].estimate_info.fare.expires_at = now / 1000; },
    (e: typeof estimate) => { Object.assign(e.product_estimates[0].estimate_info, { no_cars_available: true }); },
    (e: typeof estimate) => { Object.assign(e.product_estimates[0].estimate_info, { pickup_estimate: null }); },
  ]) {
    const fixture = structuredClone(estimate); modify(fixture);
    assert.deepEqual(await client(async () => Response.json(fixture)).estimates('run-1', route, auth), []);
  }
  await assert.rejects(client(async () => Response.json({ product_estimates: 'bad' })).estimates('run-1', route, auth), errorCode('MALFORMED_RESPONSE'));
});

test('Uber sandbox creates once from a persisted booking intent, keeps tokens and guest contact out of results', async () => {
  const records = journal(); const record = await booking(records); let posts = 0;
  const c = client(async (_url, init) => { posts++; const body = JSON.parse(String(init?.body)); assert.equal(body.expense_memo, trip.expense_memo); assert.deepEqual(body.guest, { guest_id: 'sandbox-guest' }); assert.equal(body.fare_id, 'fare-1'); assert.equal(body.product_id, 'product-1'); return Response.json(trip); }, records);
  const [first, duplicate] = await Promise.all([c.createTrip(record, auth), c.createTrip(record, auth)]);
  assert.equal(first.state, 'confirmed'); assert.ok(['confirmed', 'uncertain'].includes(duplicate.state)); assert.equal(posts, 1);
  if (first.state === 'confirmed') { assert.equal(first.trip.status, 'accepted'); assert.equal(first.trip.driver?.name, 'Test Driver'); assert.equal(first.trip.vehicle?.licensePlate, 'TEST123'); assert.equal(first.trip.pickupEtaMinutes, 3); assert.ok(!JSON.stringify(first).includes('must-not-leak')); }
  assert.equal((await records.read(key))?.requestId, 'request-1');
});

test('Uber sandbox uncertain booking is not retried and reconciliation requires matching local identity', async () => {
  const records = journal(); const record = await booking(records); let posts = 0;
  const c = client(async (_url, init) => { if (init?.method === 'POST') { posts++; throw new Error('network fixture-secret'); } return Response.json({ trips: [{ ...trip, expense_memo: 'another-booking' }], next_key: '' }); }, records);
  assert.deepEqual(await c.createTrip(record, auth), { state: 'uncertain', bookingKey: key });
  assert.deepEqual(await c.createTrip(record, auth), { state: 'uncertain', bookingKey: key }); assert.equal(posts, 1);
  assert.deepEqual(await c.reconcile(key), { state: 'uncertain', bookingKey: key });
  const reconciled = await client(async () => Response.json({ trips: [trip], next_key: '' }), records).reconcile(key);
  assert.equal(reconciled.state, 'confirmed');
  assert.equal((await records.read(key))?.requestId, 'request-1');
});

test('Uber sandbox treats malformed success and server errors after POST as uncertain, but rejects explicit denied access', async () => {
  for (const response of [Response.json({ request_id: 'request-1', status: 'surprise' }), new Response('secret', { status: 503 })]) {
    assert.equal((await client(async () => response).createTrip(await booking(), auth)).state, 'uncertain');
  }
  assert.equal((await client(async () => new Response('secret', { status: 403 })).createTrip(await booking(), auth)).state, 'rejected');
  await assert.rejects(new GuestRidesSandboxClient(config, { fetch: async () => Response.json(trip) }).createTrip(await booking(), auth), errorCode('JOURNAL_REQUIRED'));
});

test('Uber sandbox status preserves terminal states and rejects mismatched IDs or unknown states', async () => {
  for (const [status, want] of [['processing', 'processing'], ['arriving', 'arriving'], ['in_progress', 'in_progress'], ['completed', 'completed'], ['driver_canceled', 'cancelled'], ['rider_canceled', 'cancelled'], ['no_drivers_available', 'declined']] as const) {
    const result = await client(async () => Response.json({ ...trip, status, driver: null, vehicle: null })).getTrip('request-1');
    assert.equal(result.status, want); assert.equal(result.driver, null); assert.equal(result.vehicle, null);
  }
  await assert.rejects(client(async () => Response.json({ ...trip, request_id: 'other' })).getTrip('request-1'), errorCode('MALFORMED_RESPONSE'));
});

test('Uber sandbox cancel requires readback and driver advancement rejects skipped and terminal stages', async () => {
  const seen: string[] = [];
  const c = client(async (url, init) => { seen.push(`${init?.method} ${url}`); if (init?.method === 'DELETE' || init?.method === 'POST') return new Response(null, { status: 204 }); return Response.json({ ...trip, status: 'rider_canceled' }); });
  assert.equal((await c.cancelTrip('request-1')).status, 'cancelled');
  assert.equal(seen.length, 2);
  await assert.rejects(c.advanceDriver({ runId: 'run-1', driverId: 'driver-1', from: 'ACCEPT', to: 'DROPOFF' }), errorCode('INVALID_TRANSITION'));
  await assert.rejects(c.advanceDriver({ runId: 'run-1', driverId: 'driver-1', from: 'DROPOFF', to: 'BEGIN_TRIP' }), errorCode('INVALID_TRANSITION'));
  await c.advanceDriver({ runId: 'run-1', driverId: 'driver-1', from: 'ARRIVED', to: 'BEGIN_TRIP' });
  assert.equal(seen.at(-1), 'POST https://sandbox-api.uber.com/v1/guests/sandbox/driver-state');
});

test('Uber sandbox enforces finite timeout, including an unresponsive body, and sanitizes HTTP failures', async () => {
  const c = new GuestRidesSandboxClient({ ...config, timeoutMs: 10 }, { fetch: async () => new Response(new ReadableStream({ start() {} })) });
  await assert.rejects(c.getRun('run-1'), errorCode('TIMEOUT'));
  const denied = client(async () => new Response('fixture-secret', { status: 401 }));
  await assert.rejects(denied.getTrip('request-1'), error => errorCode('ACCESS_DENIED')(error) && !String(error).includes('fixture-secret'));
  await assert.rejects(client(async () => new Response(null, { status: 302 })).getRun('run-1'), errorCode('REDIRECT_REJECTED'));
});

test('Uber sandbox rejects stale or over-budget booking preparation', async () => {
  const [quote] = await client(async () => Response.json(estimate)).estimates('run-1', route, auth);
  assert.throws(() => prepareBooking({ bookingKey: key, quote, guestId: 'sandbox-guest', approvedAmountMinor: 1000 }, now), errorCode('INVALID_BOOKING'));
  assert.throws(() => prepareBooking({ bookingKey: key, quote, guestId: 'sandbox-guest', approvedAmountMinor: 1196 }, quote.expiresAt), errorCode('INVALID_BOOKING'));
});

test('Uber sandbox synthetic authorization accepts only the fixed public demo corridor', async () => {
  let requests = 0;
  const c = client(async () => { requests++; return Response.json(estimate); });
  const synthetic = { kind: 'synthetic_demo' as const, demoMode: true };
  await assert.rejects(c.estimates('run-1', route, synthetic), errorCode('AUTHORIZATION_REQUIRED'));
  const publicRoute = { pickup: { latitude: 37.229, longitude: -80.414 }, dropoff: { latitude: 37.221, longitude: -80.420 } };
  await assert.rejects(c.estimates('run-1', publicRoute, { ...synthetic, demoMode: false }), errorCode('AUTHORIZATION_REQUIRED'));
  assert.equal(requests, 0);
  assert.equal((await c.estimates('run-1', publicRoute, synthetic)).length, 1);
});

test('Uber sandbox rejects edited quote bindings before booking HTTP', async () => {
  const record = await booking(); record.route.pickup.latitude = 0;
  let requests = 0;
  await assert.rejects(client(async () => { requests++; return Response.json(trip); }).createTrip(record, auth), errorCode('INVALID_BOOKING'));
  assert.equal(requests, 0);
});

test('Uber sandbox never confirms ambiguous reconciliation or incomplete paginated absence', async () => {
  for (const fixture of [
    { trips: [trip, { ...trip, request_id: 'request-2' }], next_key: '' },
    { trips: [{ ...trip, guest: { guest_id: 'other-guest' } }], next_key: '' },
    { trips: [trip], next_key: 'more-pages' },
  ]) {
    const records = journal(); await records.claim(await booking());
    const result = await client(async () => Response.json(fixture), records).reconcile(key);
    assert.deepEqual(result, { state: 'uncertain', bookingKey: key });
  }
});

test('Uber sandbox journal failure prevents any booking HTTP and failed readback never asserts cancellation', async () => {
  let requests = 0;
  const records = journal(); records.claim = async () => { throw Error('private storage details'); };
  await assert.rejects(client(async () => { requests++; return Response.json(trip); }, records).createTrip(await booking(), auth), errorCode('JOURNAL_UNAVAILABLE'));
  assert.equal(requests, 0);
  await assert.rejects(client(async (_url, init) => init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response('secret', { status: 503 })).cancelTrip('request-1'), errorCode('UPSTREAM_UNAVAILABLE'));
});

test('Uber sandbox ambiguous HTTP conflict after booking remains uncertain', async () => {
  const result = await client(async () => new Response('undocumented conflict with private data', { status: 409 })).createTrip(await booking(), auth);
  assert.equal(result.state, 'uncertain');
});

test('Uber sandbox follow-up bookings cannot masquerade as terminal cancellation', async () => {
  await assert.rejects(client(async () => Response.json({ ...trip, status: 'driver_canceled', follow_up_trip_details: { trip_uuid: 'another-trip' } })).getTrip('request-1'), errorCode('UNSUPPORTED_FOLLOWUP'));
});

test('Uber sandbox rejects malformed availability flags and does not offer unsupported reserve rides', async () => {
  await assert.rejects(client(async () => Response.json({ ...estimate, fares_unavailable: 'true' })).estimates('run-1', route, auth), errorCode('MALFORMED_RESPONSE'));
  const fixture = structuredClone(estimate); Object.assign(fixture.product_estimates[0].product, { advance_booking_type: 'RESERVE' });
  assert.deepEqual(await client(async () => Response.json(fixture)).estimates('run-1', route, auth), []);
});

test('Uber sandbox booking response cannot confirm a different guest or product', async () => {
  for (const fixture of [{ ...trip, guest: { guest_id: 'another-guest' } }, { ...trip, product_id: 'another-product' }]) {
    assert.equal((await client(async () => Response.json(fixture)).createTrip(await booking(), auth)).state, 'uncertain');
  }
});
