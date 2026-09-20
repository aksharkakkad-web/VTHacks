import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DemoProvider, demoDescriptors, providerHandler } from './demo-provider';
import { HttpProvider } from './http-provider';
import { parseProviderTrip, type TripRequest } from './contract';
import { hostedProvider, RedisBookingStore, type BookingStore, type StoredBooking } from './hosted-provider';
import { advanceDemoRide, cancelDemoBooking, type DemoRideEvent } from './demo-ride-simulation';

const token = 'demo-provider-test-token-1234';
const query = { originZone: 'Downtown Blacksburg', destinationZone: 'VT residential campus', maxBudget: 10, minimizeWalking: true, minimizeTransfers: true };
async function endpoint(options: { demoRideProgress?: boolean; token?: string; decline?: boolean; cancellationFeeMinor?: number; hosted?: boolean } = { demoRideProgress: true, token }) {
  let now = Date.now();
  const descriptor = { ...demoDescriptors[2], name: 'Beacon demo ride' };
  const providerOptions = { ...options, now: () => now };
  const demo = new DemoProvider(descriptor, providerOptions);
  const records = new Map<string, StoredBooking>();
  const store: BookingStore & { advance: (key: string, event: DemoRideEvent, at: number) => Promise<StoredBooking> } = {
    create: async (key, value) => { if (!records.has(key)) records.set(key, structuredClone(value)); },
    read: async key => { const value = records.get(key); return value && structuredClone(value); },
    revoke: async key => { cancelDemoBooking(records.get(key)!, now); },
    advance: async (key, event, at) => { const value = records.get(key)!; advanceDemoRide(value, event, at); return structuredClone(value); },
  };
  const server = createServer(options.hosted ? async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString(), path = req.url!;
    const request = new Request(`${descriptor.baseUrl}${path}`, { method: req.method, headers: { 'Content-Type': 'application/json', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) }, ...(body ? { body } : {}) });
    const response = await hostedProvider({ descriptor, store, ...providerOptions })(request, path);
    res.writeHead(response.status, { 'Content-Type': 'application/json' }); res.end(await response.text());
  } : providerHandler(demo)); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); descriptor.baseUrl = `http://127.0.0.1:${address.port}`;
  const client = new HttpProvider(descriptor, { token: options.token, allowLocalDemo: true });
  const post = (body: unknown, credential: string | null = options.token ?? null) => fetch(`${descriptor.baseUrl}/agent/demo-advance`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(body) });
  const book = async (tripId = 'fixture-request') => {
    const quote = await client.quote(query);
    const request: TripRequest = { tripId, pickup: { lat: 37.229, lng: -80.414 }, destination: { lat: 37.221, lng: -80.42 }, ...(quote.network ? { network: { offer: quote.network.offer, consentId: 'fixture-consent' } } : {}) };
    return { quote, request, trip: await client.requestTrip(request) };
  };
  return { demo, records, client, post, book, tick: (ms: number) => { now += ms; }, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

test('demo ride HTTP progression is authenticated, operator controlled, idempotent and settles completion', async () => {
  const f = await endpoint();
  try {
    const { quote, request, trip } = await f.book();
    assert.equal(quote.waitMinutes, 5); assert.equal(quote.travelMinutes, 10); assert.equal(quote.cost, 7);
    assert.equal(trip.status, 'waiting'); assert.equal(trip.details?.stage, 'assigned');
    assert.equal(trip.details?.driver?.displayName, 'Demo Driver'); assert.equal(trip.details?.vehicle?.licensePlate, 'DEMO-01');
    assert.equal(trip.details?.pickupEtaSeconds, 300); assert.match(trip.details!.meetingInstructions!, /operator/i);
    assert.match(trip.details!.meetingInstructions!, /simulat/i);
    assert.ok(trip.details?.updatedAt && Number.isFinite(Date.parse(trip.details.updatedAt)));
    f.tick(30_000); const countdown = await f.client.getStatus(trip.id);
    assert.equal(countdown.details?.stage, 'assigned', 'elapsed time cannot silently advance a judge-controlled ride');
    assert.equal(countdown.details?.pickupEtaSeconds, 270);
    assert.deepEqual(await f.client.requestTrip(request), countdown);
    const approaching = { trip_id: trip.id, stage: 'approaching', pickup_eta_seconds: 120 };
    assert.equal((await f.post(approaching, null)).status, 401);
    assert.equal((await f.post(approaching, 'wrong-token')).status, 401);
    assert.equal((await f.post({ trip_id: trip.id, stage: 'completed' })).status, 409);
    assert.equal((await f.post({ ...approaching, pickup_eta_seconds: -1 })).status, 400);
    assert.deepEqual(await f.client.getStatus(trip.id), countdown);
    let previousTime = trip.details!.updatedAt!;
    for (const stage of ['approaching', 'arrived', 'in_trip', 'completed']) {
      const response = await f.post({ trip_id: trip.id, stage, ...(stage === 'approaching' ? { pickup_eta_seconds: 120 } : {}) });
      assert.equal(response.status, 200);
      const advanced = parseProviderTrip(await response.json());
      assert.equal(advanced.details?.stage, stage); assert.ok(Date.parse(advanced.details!.updatedAt!) > Date.parse(previousTime)); previousTime = advanced.details!.updatedAt!;
      assert.equal(advanced.details?.pickupEtaSeconds, stage === 'approaching' ? 120 : stage === 'arrived' ? 0 : undefined);
      assert.equal(advanced.status, stage === 'in_trip' || stage === 'completed' ? stage : 'waiting');
      assert.deepEqual(await f.client.getStatus(trip.id), advanced);
      assert.deepEqual(parseProviderTrip(await (await f.post({ trip_id: trip.id, stage })).json()), advanced, 'repeated event must not advance or restamp');
    }
    const completed = await f.client.getStatus(trip.id);
    assert.equal(completed.payment?.state, 'captured'); assert.equal(completed.payment?.retainedMinor, 700);
    assert.equal(f.demo.hasSensitiveData(trip.id), false);
    assert.deepEqual(await f.client.cancelTrip(trip.id), completed);
    assert.deepEqual(await f.client.requestTrip(request), completed);
    assert.equal((await f.post(approaching)).status, 409);
  } finally { await f.close(); }
});

test('demo ride provider cancellation is terminal, clears location and settles the quoted fee', async () => {
  const f = await endpoint({ demoRideProgress: true, token, cancellationFeeMinor: 200 });
  try {
    const { trip, request } = await f.book();
    const response = await f.post({ trip_id: trip.id, stage: 'cancelled' }); assert.equal(response.status, 200);
    const cancelled = parseProviderTrip(await response.json());
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.details?.stage, 'cancelled'); assert.equal(cancelled.details?.pickupEtaSeconds, undefined);
    assert.equal(cancelled.payment?.state, 'captured'); assert.equal(cancelled.payment?.retainedMinor, 200);
    assert.equal(f.demo.hasSensitiveData(trip.id), false);
    f.tick(1_000_000); assert.deepEqual(await f.client.getRequestStatus(request.tripId), cancelled);
    assert.equal((await f.post({ trip_id: trip.id, stage: 'in_trip' })).status, 409);
    assert.deepEqual(await f.client.cancelRequest(request.tripId), cancelled);
    const second = await f.book('student-cancellation');
    const ordinary = await f.client.cancelTrip(second.trip.id);
    assert.equal(ordinary.details?.stage, 'cancelled'); assert.ok(Date.parse(ordinary.details!.updatedAt!) > Date.parse(second.trip.details!.updatedAt!));
  } finally { await f.close(); }
});

test('demo ride controls are disabled by default, require a configured token and cannot resurrect decline', async () => {
  for (const options of [{ token }, { demoRideProgress: true }, { demoRideProgress: true, token, decline: true }]) {
    const f = await endpoint(options);
    try {
      const { trip } = await f.book();
      const response = await f.post({ trip_id: trip.id, stage: 'approaching' });
      assert.equal(response.status, !options.demoRideProgress ? 404 : !options.token ? 401 : 409);
      if (!options.demoRideProgress) assert.equal(trip.details, undefined);
      if (options.decline) { assert.equal(trip.status, 'declined'); assert.equal(trip.payment?.state, 'voided'); assert.equal(f.demo.hasSensitiveData(trip.id), false); }
    } finally { await f.close(); }
  }
});

test('demo ride hosted HTTP preserves progression across handler restarts and duplicate bookings', async () => {
  const f = await endpoint({ demoRideProgress: true, token, hosted: true });
  try {
    const { trip, request } = await f.book();
    assert.equal(trip.details?.stage, 'assigned');
    assert.equal((await f.post({ trip_id: trip.id, stage: 'approaching' }, null)).status, 401);
    for (const stage of ['approaching', 'arrived', 'in_trip', 'completed']) {
      assert.equal((await f.post({ trip_id: trip.id, stage })).status, 200);
      assert.equal((await f.client.getStatus(trip.id)).details?.stage, stage);
      assert.equal((await f.client.requestTrip(request)).details?.stage, stage);
    }
    assert.equal(f.records.size, 1); assert.equal([...f.records.values()][0].sensitive, undefined);
    assert.equal((await f.client.cancelTrip(trip.id)).payment?.retainedMinor, 700);
    assert.equal((await f.post({ trip_id: trip.id, stage: 'cancelled' })).status, 409);
  } finally { await f.close(); }
});

test('demo ride shared store retries atomic progression without overwriting a concurrent cancellation', async t => {
  const rows = new Map<string, string>(); let cancelBeforeCompare = false;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const command = JSON.parse(String(init.body)) as (string | number)[];
    if (command[0] === 'GET') return Response.json({ result: rows.get(String(command[1])) ?? null });
    if (command[0] === 'SET') {
      if (!rows.has(String(command[1]))) rows.set(String(command[1]), String(command[2]));
      return Response.json({ result: 'OK' });
    }
    assert.equal(command[0], 'EVAL'); const key = String(command[3]);
    if (cancelBeforeCompare) {
      cancelBeforeCompare = false;
      const concurrent = JSON.parse(rows.get(key)!) as StoredBooking;
      cancelDemoBooking(concurrent); rows.set(key, JSON.stringify(concurrent));
    }
    const matches = rows.get(key) === command[4];
    if (matches) rows.set(key, String(command[5]));
    return Response.json({ result: matches ? 1 : 0 });
  });
  const store: BookingStore = new RedisBookingStore('https://store.example', 'fixture-only');
  const provider = new DemoProvider(demoDescriptors[2], { token, demoRideProgress: true });
  const booking = provider.newBooking('stored-trip', { sensitive: { tripId: 'request', pickup: { lat: 37.229, lng: -80.414 }, destination: { lat: 37.221, lng: -80.42 } }, amountMinor: 700, cancellationFeeMinor: 200 });
  await store.create('fixture', booking);
  assert.equal(typeof store.advance, 'function');
  await store.advance!('fixture', { tripId: 'stored-trip', stage: 'approaching', pickupEtaSeconds: 90 }, Date.now());
  assert.equal((await store.read('fixture'))?.result.details?.pickupEtaSeconds, 90);
  cancelBeforeCompare = true;
  await assert.rejects(store.advance!('fixture', { tripId: 'stored-trip', stage: 'arrived' }, Date.now()), { code: 'DEMO_RIDE_TERMINAL' });
  const cancelled = await store.read('fixture');
  assert.equal(cancelled?.result.status, 'cancelled'); assert.equal(cancelled?.result.details?.stage, 'cancelled');
  assert.equal(cancelled?.result.payment?.retainedMinor, 200); assert.equal(cancelled?.sensitive, undefined);
  await store.revoke('fixture'); assert.deepEqual(await store.read('fixture'), cancelled);
});

test('demo ride countdown uses elapsed seconds, accepts an operator delay and never invents pickup arrival', async () => {
  for (const hosted of [false, true]) {
    const f = await endpoint({ demoRideProgress: true, token, hosted });
    try {
      const { trip } = await f.book();
      f.tick(30_000);
      const approaching = parseProviderTrip(await (await f.post({ trip_id: trip.id, stage: 'approaching' })).json());
      assert.equal(approaching.details?.pickupEtaSeconds, 270, 'a stage event without a new estimate cannot reset the quote countdown');
      await f.post({ trip_id: trip.id, stage: 'approaching', pickup_eta_seconds: 90 });
      f.tick(30_000);
      const first = await f.client.getStatus(trip.id); assert.equal(first.details?.pickupEtaSeconds, 60);
      assert.deepEqual(await f.client.getStatus(trip.id), first, 'polling itself cannot reset the countdown');
      const delayed = parseProviderTrip(await (await f.post({ trip_id: trip.id, stage: 'approaching', pickup_eta_seconds: 120 })).json());
      assert.equal(delayed.details?.pickupEtaSeconds, 120);
      f.tick(30_000);
      const retried = parseProviderTrip(await (await f.post({ trip_id: trip.id, stage: 'approaching', pickup_eta_seconds: 120 })).json());
      assert.equal(retried.details?.pickupEtaSeconds, 90, 'duplicate delay event cannot restart the ETA');
      f.tick(120_000); const due = await f.client.getStatus(trip.id);
      assert.equal(due.details?.pickupEtaSeconds, 0); assert.equal(due.details?.stage, 'approaching'); assert.equal(due.status, 'waiting');
      const arrived = parseProviderTrip(await (await f.post({ trip_id: trip.id, stage: 'arrived' })).json());
      assert.equal(arrived.details?.stage, 'arrived'); assert.ok(Date.parse(arrived.details!.updatedAt!) > Date.parse(due.details!.updatedAt!));
    } finally { await f.close(); }
  }
});
