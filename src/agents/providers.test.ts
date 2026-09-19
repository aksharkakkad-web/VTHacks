import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as transport from "../integrations/ans/transport";
import { createServer } from "node:http";
import { once } from "node:events";
import { normalizeQuote, coarseQuote, type ProviderDescriptor } from "./contract";
import { HttpProvider } from "./http-provider";
import { DemoProvider, providerHandler } from "./demo-provider";
import { collectCandidates } from "./discovery";
import { scopedProviderToken } from "./provider-credentials";

const request = { originZone: "Downtown Blacksburg", destinationZone: "VT residential campus", maxBudget: 10, minimizeWalking: true, minimizeTransfers: true };
const provider: ProviderDescriptor = { id: "campus_ride", name: "Campus Ride", mode: "campus_ride", baseUrl: "http://127.0.0.1", agentHost: "localhost", functions: ["quote_trip", "request_trip", "trip_status", "cancel_trip"], source: "demo" };
const raw = { provider_id: "campus_ride", provider_name: "Campus Ride", available: true, cost: 0, pickup_eta_minutes: 8, travel_time_minutes: 11, walking_minutes: 1 };

test("quote serialization strips exact locations, identity, and unrelated preferences", () => {
  const body = coarseQuote({ ...request, pickup: { lat: 37, lng: -80 }, trustedContact: "Maya", tripId: "secret" });
  assert.deepEqual(body, { origin_zone: request.originZone, destination_zone: request.destinationZone, constraints: { max_budget: 10, minimize_walking: true, minimize_transfers: true } });
});

test("normalizes real provider wire format into the frozen CandidatePlan", () => {
  const plan = normalizeQuote(raw, provider, 1000);
  assert.equal(plan.totalMinutes, 20);
  assert.equal(plan.mode, "campus_ride");
  assert.equal(plan.requiresProviderVerification, true);
  assert.equal(plan.providerId, provider.id);
});

test("rejects untrusted malformed, stale, mismatched and impossible quotes", () => {
  for (const change of [{ cost: -1 }, { cost: "free" }, { cost: Infinity }, { available: "yes" }, { provider_id: "attacker" }, { walking_minutes: -1 }, { expires_at: "1970-01-01T00:00:00.000Z" }, { expires_at: "invalid" }]) {
    assert.throws(() => normalizeQuote({ ...raw, ...change }, provider, 1000));
  }
});

test("provider HTTP lifecycle is real, idempotent, and releases data on cancellation", async () => {
  const demo = new DemoProvider(provider);
  const server = createServer(providerHandler(demo));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = new HttpProvider({ ...provider, baseUrl: `http://127.0.0.1:${address.port}` }, { allowLocalDemo: true });
  try {
    const plan = await client.quote(request);
    assert.equal(plan.totalMinutes, 20);
    const payload = { tripId: "trip-one", pickup: { lat: 37.23, lng: -80.41 }, destination: { lat: 37.22, lng: -80.42 } };
    const trip = await client.requestTrip(payload);
    assert.deepEqual(await client.requestTrip(payload), trip);
    assert.equal((await client.getStatus(trip.id)).status, "waiting");
    await client.cancelTrip(trip.id);
    assert.equal((await client.getStatus(trip.id)).status, "cancelled");
    assert.equal(demo.hasSensitiveData(trip.id), false);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("discovery isolates provider failure and excludes failed providers and over-budget quotes", async () => {
  const okay = { descriptor: provider, quote: async () => normalizeQuote(raw, provider) };
  const broken = { descriptor: { ...provider, id: "broken" }, quote: async () => { throw new Error("offline"); } };
  const results = await collectCandidates([okay, broken], request, new Set());
  assert.equal(results.candidates.length, 2);
  assert.equal(results.failures.length, 1);
  assert.equal(results.candidates.find((p) => p.mode === "walk")?.providerId, null);
  assert.equal((await collectCandidates([okay], request, new Set([provider.id]))).candidates.length, 1);
  assert.equal((await collectCandidates([{ ...okay, quote: async () => ({ ...await okay.quote(), cost: 20 }) }], request, new Set())).candidates.length, 1);
});

test("untrusted HTTP and private provider endpoints are blocked outside explicit demo", () => {
  for (const baseUrl of ["http://example.com", "http://127.0.0.1", "https://127.0.0.1", "https://localhost", "https://user:password@example.com", "https://example.com:8443"]) {
    assert.throws(() => new HttpProvider({ ...provider, source: "ans", baseUrl }));
  }
});

test("public quotes never receive provider credentials", async (t) => {
  const headers: unknown[] = [];
  t.mock.method(transport, "publicJson", async (_url: string, options: { headers?: unknown }) => {
    headers.push(options.headers); return { value: raw };
  });
  const live = { ...provider, source: "ans" as const, baseUrl: "https://provider.example", agentHost: "provider.example" };
  await new HttpProvider(live, { token: "fixture-secret" }).quote(request);
  assert.deepEqual(headers, [{}]);
});

test("live provider credentials require verified identity and an exact configured endpoint", () => {
  const live = { ...provider, source: "ans" as const, baseUrl: "https://operator.example/api/demo/providers/campus_ride", agentHost: "operator.example" };
  const identity = { providerId: live.id, host: live.agentHost, baseUrl: live.baseUrl, source: "ans" as const, validUntil: Date.now() + 60_000, serverFingerprint: "SHA256:" + "ab".repeat(32) };
  const configuration = JSON.stringify({ [live.id]: { baseUrl: live.baseUrl, token: "fixture-specific-token" } });
  assert.equal(scopedProviderToken(live, identity, configuration), "fixture-specific-token");
  assert.equal(scopedProviderToken(live, undefined, configuration), undefined);
  assert.equal(scopedProviderToken({ ...live, baseUrl: "https://attacker.example" }, identity, configuration), undefined);
  assert.equal(scopedProviderToken(live, { ...identity, providerId: "other" }, configuration), undefined);
  assert.equal(scopedProviderToken(live, { ...identity, source: "local-demo" }, configuration), undefined);
});
