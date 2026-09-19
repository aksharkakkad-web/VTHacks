import { test } from "node:test";
import { strict as assert } from "node:assert";
import { StudentAgent } from "./student/service";
import { MemoryTripStore } from "../lib/trip-state/store";
import { demoDescriptors } from "./demo-provider";
import { LocalDemoDirectory } from "../integrations/ans/directory";
import type { ProviderAgent, TripRequest } from "./contract";
import type { CandidatePlan } from "../types/provider";

function setup() {
  let now = 10_000; let sends = 0; const released: TripRequest[] = [];
  const store = new MemoryTripStore();
  const providers = demoDescriptors.filter((p) => p.mode !== "transit");
  const agent = new StudentAgent({ store, directory: new LocalDemoDirectory(providers, true), demo: true, clock: () => now,
    provider: (descriptor): ProviderAgent => ({ descriptor,
      quote: async () => ({ planId: descriptor.id + now, providerId: descriptor.id, providerName: descriptor.name, mode: descriptor.mode, available: true, cost: descriptor.id === "campus_ride" ? 0 : 7, waitMinutes: 8, travelMinutes: 11, walkingMinutes: 1, totalMinutes: 20, requiresProviderVerification: true }),
      requestTrip: async (request) => { released.push(request); return { id: descriptor.id + "-booking", status: "waiting" }; },
      getStatus: async () => ({ id: descriptor.id + "-booking", status: "waiting" }), cancelTrip: async () => {},
    }),
    recommend: async (plans: CandidatePlan[]) => ({ selectedPlanId: plans.find((p) => p.mode === "campus_ride")?.planId ?? plans.find((p) => p.mode === "independent_ride")?.planId ?? plans[0].planId, reasonCodes: ["DEMO"], explanation: "Demo evaluator", evaluatedAt: new Date(now).toISOString() }),
    notify: async () => { sends++; return { id: "demo-message", simulated: true }; },
    graceMinutes: 5,
  });
  return { agent, store, released, sends: () => sends, advance: (ms: number) => { now += ms; } };
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
