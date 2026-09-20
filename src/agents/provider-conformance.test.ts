import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import { hostedProvider, type BookingStore, type StoredBooking } from "./hosted-provider";
import { DemoProvider, providerHandler, demoDescriptors, cancelDemoBooking, networkToken } from "./demo-provider";
import { HttpProvider } from "./http-provider";
import { parseProviderTrip, type ProviderDescriptor, type ProviderAgent } from "./contract";
import { bookingPayloadHash, issueBookingGrant } from "../lib/authorization/booking-grant";
import { operatorEndpoint } from "./operator-profile";
import { normalizeNetworkQuote, networkProfile } from "./provider-manifest";
import type { ProviderOffer } from "./provider-manifest";

const token = "test-provider-secret-at-least-16";
const query = { originZone: "Downtown Blacksburg", destinationZone: "VT residential campus", maxBudget: 10, minimizeWalking: true, minimizeTransfers: true };
const coordinates = { pickup: { lat: 37.23, lng: -80.41 }, destination: { lat: 37.22, lng: -80.42 } };
function memory() {
  const records = new Map<string, StoredBooking>();
  const store: BookingStore = {
    create: async (key, value) => { if (!records.has(key)) records.set(key, structuredClone(value)); },
    read: async key => { const value = records.get(key); return value && structuredClone(value); },
    revoke: async key => {
      const booking = records.get(key); if (!booking) throw new Error("Missing booking");
      cancelDemoBooking(booking);
    },
  };
  return { records, store };
}
function wire(offer: ProviderOffer, requestId = "one-attempt") {
  const now = Date.now();
  const grant = issueBookingGrant({ version: 1, issuer: "beacon", audience: offer.providerId, scope: "book_trip", requestId, quoteId: offer.quoteId, payloadHash: bookingPayloadHash({ requestId, quoteId: offer.quoteId, ...coordinates }), amountMinor: offer.price.totalMinor, currency: "USD", issuedAt: now, expiresAt: now + 30_000, simulated: true }, token);
  return { trip_id: requestId, ...coordinates, offer, grant };
}
async function endpoint(id = "independent_ride", options: { cancellationFeeMinor?: number; decline?: boolean } = {}) {
  const descriptor: ProviderDescriptor = { ...demoDescriptors[id === "campus_ride" ? 1 : 2], id, serviceId: id, profileVersion: "beacon-mobility-v2" };
  const f = memory(); const seen: { path: string; authorization?: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString(); const path = req.url!;
    seen.push({ path, authorization: req.headers.authorization, body });
    const request = new Request(`${descriptor.baseUrl}${path}`, { method: req.method, headers: { "Content-Type": "application/json", ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, ...(body ? { body } : {}) });
    const result = await hostedProvider({ descriptor, store: f.store, token, ...options })(request, path);
    res.writeHead(result.status, { "Content-Type": "application/json" }); res.end(await result.text());
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  descriptor.baseUrl = `http://127.0.0.1:${address.port}`;
  return { ...f, descriptor, seen, client: new HttpProvider(descriptor, { allowLocalDemo: true, token }) as ProviderAgent,
    post: (path: string, value: unknown, auth = token) => fetch(`${descriptor.baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` }, body: JSON.stringify(value) }),
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

test("network conformance: three configured HTTP services include two services with the same mode", async () => {
  const endpoints = await Promise.all([endpoint("campus_ride"), endpoint(), endpoint("evening_shuttle")]);
  try {
    for (const e of endpoints) {
      const quote = await e.client.quote({ ...query, ...coordinates } as typeof query);
      assert.ok(quote.network, "network quote is negotiated");
      assert.equal(quote.cost, e.descriptor.mode === "campus_ride" ? 0 : 7); assert.equal(quote.network.manifest.operatorName, "Beacon demo operator");
      assert.equal(e.seen[0].authorization, undefined); assert.ok(!e.seen[0].body.includes("37.23"));
      const payload = { tripId: `request-${e.descriptor.id}`, ...coordinates, network: { offer: quote.network.offer, consentId: "private-confirmation-reference" } };
      const first = await e.client.requestTrip(payload);
      assert.equal(first.payment?.state, "authorized"); assert.equal(first.payment.amountMinor, quote.cost * 100);
      assert.deepEqual(await e.client.requestTrip(payload), first); assert.equal(e.records.size, 1);
      assert.ok(!e.seen.find(call => call.path === "/agent/request-trip")!.body.includes("private-confirmation-reference"));
      const canceled = await e.client.cancelTrip(first.id);
      assert.equal(canceled?.payment?.state, "voided");
      assert.deepEqual(await e.client.getRequestStatus!(payload.tripId), canceled);
      assert.equal([...e.records.values()][0].sensitive, undefined);
    }
  } finally { await Promise.all(endpoints.map(e => e.close())); }
});

test("Lyft-style developer example uses the real HTTP lifecycle with simulated payment and no affiliation", async () => {
  const e = await endpoint("lyft-demo");
  try {
    const quote = await e.client.quote(query); assert.ok(quote.network);
    assert.equal(quote.network.manifest.operatorName, "Beacon demo team");
    assert.equal(quote.network.manifest.executionMode, "simulated");
    assert.equal(quote.network.offer.serviceId, "lyft-demo");
    const payload = { tripId: "lyft-example-attempt", ...coordinates, network: { offer: quote.network.offer, consentId: "confirmed" } };
    const booked = await e.client.requestTrip(payload);
    assert.equal(booked.payment?.state, "authorized");
    assert.deepEqual(await e.client.getStatus(booked.id), booked);
    assert.deepEqual(await e.client.requestTrip(payload), booked);
    const cancelled = await e.client.cancelTrip(booked.id);
    assert.equal(cancelled?.status, "cancelled");
    assert.deepEqual(await e.client.getRequestStatus!(payload.tripId), cancelled);
    assert.equal([...e.records.values()][0].sensitive, undefined);
  } finally { await e.close(); }
});

test("network conformance: booking requires trusted offer, matching grant and persistent request fingerprint", async () => {
  const e = await endpoint();
  try {
    const quote = await e.client.quote(query); assert.ok(quote.network);
    const payload = wire(quote.network.offer);
    for (const invalid of [
      { ...payload, grant: payload.grant.slice(0, -3) + "abc" },
      { ...payload, trip_id: "another-attempt" },
      { ...payload, pickup: { lat: 38, lng: -80 } },
      { ...payload, offer: { ...payload.offer, price: { ...payload.offer.price, totalMinor: 1 } } },
      { ...payload, offer: { ...payload.offer, cancellation: { feeMinor: 1 } } },
    ]) assert.equal((await e.post("/agent/request-trip", invalid)).status, 400);
    assert.equal((await e.post("/agent/request-trip", payload, "wrong-secret")).status, 401);
    const expiredBody = JSON.parse(Buffer.from(payload.grant.split(".")[1], "base64url").toString());
    expiredBody.issuedAt = Date.now() - 60_000; expiredBody.expiresAt = Date.now() - 1;
    const signedPart = `beacon-hmac-v1.${Buffer.from(JSON.stringify(expiredBody)).toString("base64url")}`;
    const expired = `${signedPart}.${createHmac("sha256", token).update(signedPart).digest("base64url")}`;
    assert.equal((await e.post("/agent/request-trip", { ...payload, grant: expired })).status, 400);
    assert.equal(e.records.size, 0);
    assert.equal((await e.post("/agent/request-trip", payload)).status, 200);
    const another = await e.client.quote(query); assert.ok(another.network);
    assert.equal((await e.post("/agent/request-trip", wire(another.network.offer))).status, 409);
    assert.equal(e.records.size, 1);
    assert.equal((await e.post("/agent/request-trip", payload)).status, 200);
  } finally { await e.close(); }
});

test("network conformance: tombstone survives handler restart and completed cleanup preserves capture", async () => {
  const e = await endpoint();
  try {
    const quote = await e.client.quote(query); assert.ok(quote.network);
    const canceled = await e.client.cancelRequest!("delayed-request");
    assert.equal(canceled?.payment?.state, "voided");
    const late = await e.post("/agent/request-trip", wire(quote.network.offer, "delayed-request"));
    assert.equal((await late.json()).status, "cancelled");
    assert.equal([...e.records.values()][0].sensitive, undefined);
    const booked = await e.client.requestTrip({ tripId: "complete-request", ...coordinates, network: { offer: quote.network.offer, consentId: "hidden" } });
    const stored = [...e.records.values()].find(value => value.result.id === booked.id)!;
    stored.result.status = "completed"; stored.result.payment = { mode: "simulated", currency: "USD", amountMinor: 700, retainedMinor: 700, state: "captured" };
    const cleanup = await e.client.cancelTrip(booked.id);
    assert.equal(cleanup?.status, "completed"); assert.equal(cleanup.payment?.state, "captured"); assert.equal(stored.sensitive, undefined);
  } finally { await e.close(); }
});

test("network conformance: returned payment is allowlisted and malformed payment is rejected", () => {
  const payment = { mode: "simulated", currency: "USD", amountMinor: 700, retainedMinor: 0, state: "authorized", secret: "must-strip" };
  assert.deepEqual(parseProviderTrip({ id: "trip", status: "waiting", payment }), { id: "trip", status: "waiting", payment: { mode: "simulated", currency: "USD", amountMinor: 700, retainedMinor: 0, state: "authorized" } });
  assert.throws(() => parseProviderTrip({ id: "trip", status: "waiting", payment: { ...payment, retainedMinor: 999 } }));
});


test("network conformance: cancellation fees and payment decline are explicit and idempotent", async () => {
  const fee = await endpoint("fee_service", { cancellationFeeMinor: 200 });
  const declined = await endpoint("declined_service", { decline: true });
  try {
    const quote = await fee.client.quote(query); assert.ok(quote.network);
    assert.equal(quote.network.offer.cancellation.feeMinor, 200);
    const booked = await fee.client.requestTrip({ tripId: "with-fee", ...coordinates, network: { offer: quote.network.offer, consentId: "private" } });
    const canceled = await fee.client.cancelTrip(booked.id);
    assert.equal(canceled?.payment?.retainedMinor, 200); assert.equal(canceled?.payment?.state, "captured");
    assert.deepEqual(await fee.client.cancelTrip(booked.id), canceled);
    assert.deepEqual(await fee.client.cancelRequest!("with-fee"), canceled);
    const unavailable = await declined.client.quote(query); assert.ok(unavailable.network);
    const result = await declined.client.requestTrip({ tripId: "declined", ...coordinates, network: { offer: unavailable.network.offer, consentId: "private" } });
    assert.equal(result.status, "declined"); assert.equal(result.payment?.state, "voided");
    assert.equal([...declined.records.values()][0].sensitive, undefined);
  } finally { await fee.close(); await declined.close(); }
});

test("network conformance: expired offer cannot be revived by a fresh grant", async t => {
  const e = await endpoint();
  try {
    const quote = await e.client.quote(query); assert.ok(quote.network);
    const realNow = Date.now(); t.mock.method(Date, "now", () => realNow + 121_000);
    assert.equal((await e.post("/agent/request-trip", wire(quote.network.offer))).status, 400);
    assert.equal(e.records.size, 0);
  } finally { await e.close(); }
});

test("network conformance: local DemoProvider enforces signed intent and never downgrades v2", async () => {
  const descriptor: ProviderDescriptor = { ...demoDescriptors[1], profileVersion: networkProfile };
  const provider = new DemoProvider(descriptor, { token }); const server = createServer(providerHandler(provider));
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string"); descriptor.baseUrl = `http://127.0.0.1:${address.port}`;
  const client = new HttpProvider(descriptor, { allowLocalDemo: true, token });
  try {
    const quote = await client.quote(query); assert.ok(quote.network);
    const booking = await client.requestTrip({ tripId: "local-attempt", ...coordinates, network: { offer: quote.network.offer, consentId: "private" } });
    assert.equal(booking.payment?.amountMinor, 0);
    await assert.rejects(() => client.requestTrip({ tripId: "unsigned", ...coordinates }), /Invalid network booking/);
    await assert.rejects(() => new HttpProvider(descriptor, { allowLocalDemo: true }).quote(query), /authorization/);
    await assert.rejects(() => new HttpProvider(descriptor, { allowLocalDemo: true, token: "short" }).quote(query), /authorization/);
    const canceled = await client.cancelRequest("local-attempt"); assert.equal(canceled.payment?.state, "voided");
    assert.equal(provider.hasSensitiveData(booking.id), false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("network conformance: registered v1 service can negotiate v2 without inventing operator identity", () => {
  const descriptor: ProviderDescriptor = { ...demoDescriptors[1], source: "ans", ansId: "registered-operator", id: "registered-operator:campus_ride", baseUrl: "https://operator.example/api/demo/providers/campus_ride", agentHost: "operator.example", profileVersion: "beacon-mobility-v1" };
  const provider = new DemoProvider(descriptor, { token });
  const envelope = provider.handle("POST", "/agent/quote", { origin_zone: query.originZone, destination_zone: query.destinationZone, constraints: { max_budget: 10 } });
  const result = normalizeNetworkQuote(envelope, descriptor, query);
  assert.equal(result.network.manifest.operatorAnsId, descriptor.ansId);
  assert.equal(result.network.manifest.operatorName, "Beacon demo operator");
  const extra = { ...demoDescriptors[2], id: "evening_shuttle", serviceId: "evening_shuttle" };
  const profile = operatorEndpoint("https://operator.example", networkProfile, [...demoDescriptors, extra]);
  assert.ok(profile.functions.some(fn => fn.id === "evening_shuttle.request_trip" && fn.tags.includes("service:evening_shuttle")));
  assert.ok(operatorEndpoint("https://operator.example").functions.every(fn => fn.tags.includes("beacon-mobility-v1")));
});


test("network conformance: legacy registered quote-only transit negotiates the honest capability subset", () => {
  const descriptor: ProviderDescriptor = { ...demoDescriptors[0], source: "ans", ansId: "registered-operator", id: "registered-operator:transit", baseUrl: "https://operator.example/api/demo/providers/transit", agentHost: "operator.example", profileVersion: "beacon-mobility-v1", functions: ["quote_trip"] };
  const hostedDescriptor = { ...descriptor, functions: demoDescriptors[0].functions };
  const provider = new DemoProvider(hostedDescriptor, { token });
  const raw = provider.handle("POST", "/agent/quote", { origin_zone: query.originZone, destination_zone: query.destinationZone, constraints: { max_budget: 10 } });
  assert.deepEqual(normalizeNetworkQuote(raw, descriptor, query).network.manifest.capabilities, ["quote_trip"]);
});


test("network conformance: malformed configured credentials cannot activate the network profile", () => {
  for (const value of ["short", " abcdefghijklmnop", "abcdefghijklmnop ", "abcdefgh ijklmnop", "abcdefgh\nijklmnop"]) assert.equal(networkToken(value), false);
  assert.equal(networkToken(token), true);
});
