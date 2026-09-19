import { test } from "node:test";
import { strict as assert } from "node:assert";
import { StudentAgent } from "./student/service";
import { MemoryTripStore } from "../lib/trip-state/store";
import { demoDescriptors } from "./demo-provider";
import { LocalDemoDirectory } from "../integrations/ans/directory";
import { normalizeQuote, type ProviderAgent, type ProviderTripStatus, type TripRequest } from "./contract";
import type { CandidatePlan } from "../types/provider";

function setup() {
  let now = 10_000; let sends = 0; const released: TripRequest[] = [];
  const control = { cancelFails: false, requestFails: false, cancellations: 0, status: "waiting" as ProviderTripStatus, quoteTtl: 120_000 };
  const store = new MemoryTripStore();
  const providers = demoDescriptors.filter((p) => p.mode !== "transit");
  const agent = new StudentAgent({ store, directory: new LocalDemoDirectory(providers, true), demo: true, clock: () => now,
    provider: (descriptor): ProviderAgent => ({ descriptor,
      quote: async () => normalizeQuote({ provider_id: descriptor.id, available: true, cost: descriptor.id === "campus_ride" ? 0 : 7, pickup_eta_minutes: 8, travel_time_minutes: 11, walking_minutes: 1, expires_at: new Date(now + control.quoteTtl).toISOString() }, descriptor, now),
      requestTrip: async (request) => { released.push(request); if (control.requestFails) throw new Error("Response lost"); return { id: descriptor.id + "-booking", status: "waiting" }; },
      getStatus: async () => ({ id: descriptor.id + "-booking", status: control.status }),
      cancelTrip: async () => { control.cancellations++; if (control.cancelFails) throw new Error("Provider unavailable"); },
    }),
    recommend: async (plans: CandidatePlan[]) => ({ selectedPlanId: plans.find((p) => p.mode === "campus_ride")?.planId ?? plans.find((p) => p.mode === "independent_ride")?.planId ?? plans[0].planId, reasonCodes: ["DEMO"], explanation: "Demo evaluator", evaluatedAt: new Date(now).toISOString() }),
    notify: async () => { sends++; return { id: "demo-message", simulated: true }; },
    graceMinutes: 5,
  });
  return { agent, store, released, control, sends: () => sends, advance: (ms: number) => { now += ms; } };
}
const input = { origin: { lat: 37.229, lng: -80.414 }, preferences: { home: { lat: 37.221, lng: -80.420 }, maxBudget: 10, walkingPreference: "minimize", trustedContact: { name: "Maya", phone: "+15555550100", consent: true, shareLocation: true } } };
async function start(s: ReturnType<typeof setup>) {
  let trip = await s.agent.create("owner", input);
  trip = await s.agent.act(trip.id, "owner", "discover");
  trip = await s.agent.act(trip.id, "owner", "evaluate");
  return trip;
}
test("confirmation + ANS + policy gate precede any precise release", async () => {
  const s = setup(); const trip = await start(s);
  assert.equal(trip.state, "SELECTED");
  await assert.rejects(s.agent.act(trip.id, "owner", "request"));
  await assert.rejects(s.agent.act(trip.id, "owner", "verify"));
  assert.equal(s.released.length, 0);
  await s.agent.act(trip.id, "owner", "confirm");
  await s.agent.act(trip.id, "owner", "verify");
  const [a, b] = await Promise.all([s.agent.act(trip.id, "owner", "request"), s.agent.act(trip.id, "owner", "request")]);
  assert.equal(a.state, "WAITING_FOR_PICKUP"); assert.equal(b.state, a.state);
  assert.equal(s.released.length, 1);
  assert.equal(a.providerVerified, false, "local pretrust must not masquerade as ANS verification");
  assert.equal(a.sensitiveDataReleased, true);
  assert.ok(!JSON.stringify(s.released).includes("Maya"));
});
test("trip ownership blocks cross-session reads and mutations", async () => {
  const s = setup(); const trip = await start(s);
  await assert.rejects(s.agent.read(trip.id, "someone-else"));
  await assert.rejects(s.agent.act(trip.id, "someone-else", "confirm"));
});
test("cancellation autonomously recollects, reevaluates, verifies, and books replacement", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  const replacement = await s.agent.act(trip.id, "owner", "cancel-provider");
  assert.equal(replacement.selectedPlan?.mode, "independent_ride");
  assert.equal(replacement.state, "WAITING_FOR_PICKUP");
  assert.equal(s.released.length, 2);
  assert.ok(!replacement.candidates.some((p) => p.providerId === "campus_ride"));
});
test("arrival geofence removes private state and prevents overdue alerts", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  const arrived = await s.agent.act(trip.id, "owner", "location", { ...input.preferences.home, recordedAt: new Date(10_000).toISOString() });
  assert.equal(arrived.state, "ARRIVED");
  assert.equal(arrived.sensitiveDataReleased, false);
  assert.equal(arrived.lastKnownLocation, undefined);
  s.advance(2_000_000); await s.agent.monitor();
  assert.equal(s.sends(), 0);
  assert.equal((await s.store.read(trip.id)).private, undefined);
  await assert.rejects(s.agent.act(trip.id, "owner", "request"));
});
test("overdue alert has consent, is exactly-once under overlapping monitor ticks, and demo is labeled", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  s.advance(2_000_000); await Promise.all([s.agent.monitor(), s.agent.monitor()]);
  assert.equal(s.sends(), 1);
  const overdue = await s.agent.read(trip.id, "owner");
  assert.equal(overdue.state, "OVERDUE");
  assert.equal(overdue.alertSent, false, "a simulated notification is not a real SMS");
});
test("out-of-order, malformed, emergency, stale and future location input is rejected", async () => {
  const s = setup(); const trip = await s.agent.create("owner", input);
  await assert.rejects(s.agent.act(trip.id, "owner", "confirm"));
  await assert.rejects(s.agent.create("owner", { ...input, temporary_context: { immediate_danger: true } }));
  await assert.rejects(s.agent.create("owner", { ...input, origin: { lat: NaN, lng: 0 } }));
  await assert.rejects(s.agent.act(trip.id, "owner", "location", { lat: 37, lng: -80, recordedAt: "3000-01-01T00:00:00Z" }));
});

test("arrival erases local private data and retries provider cleanup after an outage", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  s.control.cancelFails = true;
  const arrived = await s.agent.act(trip.id, "owner", "arrive");
  assert.equal(arrived.state, "ARRIVED");
  assert.equal((await s.store.read(trip.id)).private, undefined);
  assert.match(arrived.statusMessage!, /cleanup.*pending/i);
  s.control.cancelFails = false; s.advance(60_000);
  await s.agent.monitor();
  assert.equal(s.control.cancellations, 2);
  assert.equal((await s.agent.read(trip.id, "owner")).sensitiveDataReleased, false);
  assert.equal(s.sends(), 0);
});

test("confirmed cancellation replans even when provider cleanup is temporarily unavailable", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  s.control.cancelFails = true; s.control.status = "cancelled";
  await s.agent.monitor();
  assert.equal((await s.agent.read(trip.id, "owner")).selectedPlan?.mode, "independent_ride");
  assert.equal(s.released.length, 2);
});

test("recovery uses the student's fresh latest pickup location", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  const latest = { lat: 37.228, lng: -80.416 };
  await s.agent.act(trip.id, "owner", "location", latest);
  await s.agent.act(trip.id, "owner", "cancel-provider");
  assert.deepEqual(s.released[1].pickup, latest);
});

test("provider completion is still observed after a trip becomes overdue", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  s.advance(2_000_000); await s.agent.monitor();
  s.control.status = "completed"; await s.agent.monitor();
  assert.equal((await s.agent.read(trip.id, "owner")).state, "ARRIVED");
  assert.equal((await s.store.read(trip.id)).private, undefined);
  assert.equal(s.sends(), 1);
});

test("provider-specific quote expiry blocks both late confirmation and late booking", async () => {
  const s = setup(); s.control.quoteTtl = 1000; const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm");
  await s.agent.act(trip.id, "owner", "verify");
  s.advance(5000);
  await assert.rejects(s.agent.act(trip.id, "owner", "request"), { code: "QUOTE_EXPIRED" });
  assert.equal(s.released.length, 0);
  const late = await start(s); s.advance(5000);
  await assert.rejects(s.agent.act(late.id, "owner", "confirm"), { code: "QUOTE_EXPIRED" });
});

test("cleaning an old provider does not erase an unresolved replacement disclosure", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  s.control.cancelFails = true; s.control.status = "cancelled"; s.control.requestFails = true;
  await s.agent.monitor();
  assert.equal(s.released.length, 2);
  assert.equal((await s.agent.read(trip.id, "owner")).sensitiveDataReleased, true);
  s.control.cancelFails = false; s.advance(60_000); await s.agent.monitor();
  const unresolved = await s.agent.read(trip.id, "owner");
  assert.equal(unresolved.state, "FAILED");
  assert.equal(unresolved.sensitiveDataReleased, true, "lost booking response is not proof the replacement deleted data");
});
