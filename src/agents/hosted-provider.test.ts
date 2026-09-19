import { test } from "node:test";
import { strict as assert } from "node:assert";
import { hostedProvider, type BookingStore, type StoredBooking } from "./hosted-provider";
import { demoDescriptors } from "./demo-provider";

function fixture() {
  const records = new Map<string, StoredBooking>();
  const store: BookingStore = {
    create: async (key, booking) => { if (!records.has(key)) records.set(key, structuredClone(booking)); },
    read: async (key) => { const value = records.get(key); return value && structuredClone(value); },
    revoke: async (key) => { const value = records.get(key); if (!value) throw new Error("Missing"); delete value.sensitive; value.result.status = "cancelled"; },
  };
  const descriptor = { ...demoDescriptors[1], id: "registration:campus_ride", baseUrl: "https://operator.example/api/demo/providers/campus_ride" };
  return { records, store, descriptor };
}
function request(path: string, data?: unknown, token?: string) {
  return new Request(`https://operator.example${path}`, { method: data === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
const body = { trip_id: "trip-request-1", pickup: { lat: 37.229, lng: -80.414 }, destination: { lat: 37.221, lng: -80.420 } };

test("hosted provider exposes only public metadata and coarse quotes without authentication", async () => {
  const f = fixture(); const handle = hostedProvider({ descriptor: f.descriptor });
  const quote = await handle(request("/agent/quote", { origin_zone: "downtown", destination_zone: "campus", constraints: { max_budget: 10 } }), "/agent/quote");
  assert.equal(quote.status, 200); assert.equal((await quote.json()).provider_id, f.descriptor.id);
  const card = await handle(request("/.well-known/agent-card.json"), "/.well-known/agent-card.json");
  assert.equal((await card.json()).simulated, true);
  assert.equal((await handle(request("/agent/request-trip", body), "/agent/request-trip")).status, 503);
});

test("hosted booking survives handler instances, is idempotent, and cannot restore revoked data", async () => {
  const f = fixture(); const options = { ...f, token: "fixture-token" };
  const first = hostedProvider(options); const second = hostedProvider(options);
  assert.equal((await first(request("/agent/request-trip", body), "/agent/request-trip")).status, 401);
  const book = async (handle: typeof first) => handle(request("/agent/request-trip", body, "fixture-token"), "/agent/request-trip");
  const accepted = await book(first); assert.equal(accepted.status, 200); const trip = await accepted.json();
  assert.deepEqual(await (await book(second)).json(), trip); assert.equal(f.records.size, 1);
  assert.ok(!JSON.stringify(trip).includes("37.229"));
  const status = `/agent/trip-status/${trip.id}`;
  assert.equal((await second(request(status), status)).status, 401);
  assert.equal((await (await second(request(status, undefined, "fixture-token"), status)).json()).status, "waiting");
  assert.equal((await second(request("/agent/cancel-trip", { trip_id: trip.id }, "fixture-token"), "/agent/cancel-trip")).status, 200);
  assert.equal([...f.records.values()][0].sensitive, undefined);
  assert.equal((await (await book(first)).json()).status, "cancelled");
  assert.equal([...f.records.values()][0].sensitive, undefined);
});

test("hosted provider rejects invalid coordinates and does not retain extra private profile fields", async () => {
  const f = fixture(); const handle = hostedProvider({ ...f, token: "fixture-token" });
  assert.equal((await handle(request("/agent/request-trip", { ...body, pickup: { lat: 999, lng: 0 } }, "fixture-token"), "/agent/request-trip")).status, 400);
  assert.equal(f.records.size, 0);
  await handle(request("/agent/request-trip", { ...body, trustedContact: "must-not-store" }, "fixture-token"), "/agent/request-trip");
  assert.ok(!JSON.stringify([...f.records.values()]).includes("must-not-store"));
});
