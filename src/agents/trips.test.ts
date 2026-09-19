import { test } from "node:test";
import { strict as assert } from "node:assert";
import { StudentAgent, type Dependencies } from "./student/service";
import { decisionRecommendation } from "./student/databricks";
import { runDecision } from "../integrations/databricks/evaluate";
import { MemoryTripStore } from "../lib/trip-state/store";
import { demoDescriptors } from "./demo-provider";
import { LocalDemoDirectory } from "../integrations/ans/directory";
import { normalizeQuote, type ProviderAgent, type ProviderTripStatus, type TripRequest } from "./contract";
import type { CandidatePlan } from "../types/provider";
import type { TripRecord } from "../lib/trip-state/model";

function setup(recommend?: Dependencies["recommend"], campusWeather?: Dependencies["campusWeather"]) {
  let now = 10_000; let sends = 0; const released: TripRequest[] = [];
  const control = { cancelFails: false, requestFails: false, requestMissing: false, evaluationFails: false, evaluationDelay: 0, canReconcile: true, cancellations: 0, status: "waiting" as ProviderTripStatus, quoteTtl: 120_000 };
  const store = new MemoryTripStore();
  const providers = demoDescriptors.filter((p) => p.mode !== "transit");
  const agent = new StudentAgent({ store, directory: new LocalDemoDirectory(providers, true), demo: true, clock: () => now,
    provider: (descriptor): ProviderAgent => ({ descriptor,
      quote: async () => normalizeQuote({ provider_id: descriptor.id, available: true, simulated: true, cost: descriptor.id === "campus_ride" ? 0 : 7, pickup_eta_minutes: 8, travel_time_minutes: 11, walking_minutes: 1, expires_at: new Date(now + control.quoteTtl).toISOString() }, descriptor, now),
      requestTrip: async (request) => { released.push(request); if (control.requestFails) throw new Error("Response lost"); return { id: descriptor.id + "-booking", status: "waiting" }; },
      getStatus: async () => ({ id: descriptor.id + "-booking", status: control.status }),
      cancelTrip: async () => { control.cancellations++; if (control.cancelFails) throw new Error("Provider unavailable"); },
      getRequestStatus: control.canReconcile ? async (id) => { if (control.requestFails) throw new Error("Provider unavailable"); return !control.requestMissing && released.some((r) => r.tripId === id) ? { id: descriptor.id + "-booking", status: control.status } : undefined; } : undefined,
      cancelRequest: control.canReconcile ? async () => { control.cancellations++; if (control.cancelFails) throw new Error("Provider unavailable"); } : undefined,
    }),
    recommend: recommend ?? (async (plans: CandidatePlan[]) => { if (control.evaluationFails) throw new Error("Evaluator unavailable"); now += control.evaluationDelay; return { selectedPlanId: plans.find((p) => p.mode === "campus_ride")?.planId ?? plans.find((p) => p.mode === "independent_ride")?.planId ?? plans[0].planId, reasonCodes: ["DEMO"], explanation: "Demo evaluator", evaluatedAt: new Date(now).toISOString() }; }),
    notify: async () => { sends++; return { id: "demo-message", simulated: true }; },
    graceMinutes: 5, campusWeather,
  });
  return { agent, store, released, control, sends: () => sends, advance: (ms: number) => { now += ms; } };
}
const input = { origin: { lat: 37.229, lng: -80.414 }, preferences: { home: { lat: 37.221, lng: -80.420 }, maxBudget: 10, walkingPreference: "minimize", trustedContact: { name: "Maya", telegramChatId: "123456789", consent: true, shareLocation: true } } };

test('explicit walking limits are stored as hard preferences and malformed limits are rejected', async () => {
  const s = setup();
  const trip = await s.agent.create('owner', { ...input, preferences: { ...input.preferences, cannotWalk: true, maxWalkingMinutes: 0 } });
  const context = (await s.store.read(trip.id)).context;
  assert.equal(context.cannotWalk, true); assert.equal(context.maxWalkingMinutes, 0);
  assert.equal((await s.store.read(trip.id)).journeyContract, 'beacon-journey-v1');
  for (const maxWalkingMinutes of [-1, '5', Infinity]) await assert.rejects(s.agent.create('owner', { ...input, preferences: { ...input.preferences, maxWalkingMinutes } }));
  await assert.rejects(s.agent.create('owner', { ...input, preferences: { ...input.preferences, cannotWalk: 'yes' } }));
});
test("campus weather stays private, affects recommendation, and expires before confirmation", async () => {
  const calls: unknown[] = [];
  const s = setup(decisionRecommendation(runDecision), (at) => {
    calls.push(at);
    return { status: "current", condition: "rain", issuedAt: new Date(at - 1000).toISOString(), validUntil: new Date(at + 1000).toISOString(), sourceUrl: "https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly" };
  });
  const trip = await start(s);
  assert.deepEqual(calls, [10000], "research receives only a clock, no GPS or student identity");
  assert.ok(trip.recommendation?.reasonCodes.includes("RAIN_INCREASES_WALKING_COST"));
  assert.equal((await s.agent.evidence(trip.id, "owner")).weather.condition, "rain");
  await assert.rejects(s.agent.evidence(trip.id, "another-owner"), { code: "TRIP_NOT_FOUND" });
  s.advance(1001);
  await assert.rejects(s.agent.act(trip.id, "owner", "confirm"), { code: "QUOTE_EXPIRED" });
  assert.equal((await s.agent.evidence(trip.id, "owner")).weather.status, "unknown");
});

test("campus forecast is not attached to trips outside its supported area", async () => {
  const s = setup(decisionRecommendation(runDecision), () => { throw new Error("Must not be called"); });
  const trip = await s.agent.create("owner", { ...input, origin: { lat: 38.9, lng: -77 } });
  await s.agent.act(trip.id, "owner", "discover");
  await s.agent.act(trip.id, "owner", "evaluate");
  assert.equal((await s.agent.evidence(trip.id, "owner")).weather.status, "unknown");
});

test("weather expiry after verification releases the selection so the user can refresh", async () => {
  const s = setup(decisionRecommendation(runDecision), (at) => ({ status: "current", condition: "rain", issuedAt: new Date(at - 1000).toISOString(), validUntil: new Date(at + 1000).toISOString(), sourceUrl: "https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly" }));
  const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm");
  await s.agent.act(trip.id, "owner", "verify");
  s.advance(1001);
  await assert.rejects(s.agent.act(trip.id, "owner", "request"), { code: "QUOTE_EXPIRED" });
  assert.equal((await s.agent.read(trip.id, "owner")).state, "COLLECTING_QUOTES");
  assert.equal(s.released.length, 0);
  await s.agent.act(trip.id, "owner", "discover");
  await s.agent.act(trip.id, "owner", "evaluate");
  await assert.rejects(s.agent.act(trip.id, "owner", "request"), { code: "CONFIRMATION_REQUIRED" });
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  assert.equal(s.released.length, 1);
});
test("teammate decision policy integrates with confirmation and autonomous replacement", async () => {
  const s = setup(decisionRecommendation(runDecision));
  const trip = await start(s);
  assert.equal(trip.selectedPlan?.mode, "campus_ride");
  assert.ok(trip.recommendation?.reasonCodes.includes("LOCAL_POLICY_FALLBACK"));
  assert.ok(trip.recommendation?.reasonCodes.includes("SIMULATED_TRANSPORT"));
  assert.equal(s.released.length, 0);
  assert.ok(trip.candidates.every(p => !("quoteSource" in p) && !("quoteExpiresAt" in p)));
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  const replacement = await s.agent.act(trip.id, "owner", "cancel-provider");
  assert.equal(replacement.selectedPlan?.mode, "independent_ride");
  assert.ok(replacement.recommendation?.reasonCodes.includes("REPLANNED_AFTER_PROVIDER_FAILURE"));
  assert.equal(s.released.length, 2);
});

test("a quote expiring while the evaluator awaits never reaches selected or booking", async () => {
  const s = setup();
  s.control.quoteTtl = 1000;
  s.control.evaluationDelay = 1001;
  const trip = await s.agent.create("owner", input);
  await s.agent.act(trip.id, "owner", "discover");
  await assert.rejects(s.agent.act(trip.id, "owner", "evaluate"), { code: "QUOTE_EXPIRED" });
  assert.equal(s.released.length, 0);
  assert.equal((await s.agent.read(trip.id, "owner")).selectedPlan, undefined);
  assert.equal((await s.agent.read(trip.id, "owner")).state, "COLLECTING_QUOTES");
  s.control.evaluationDelay = 0;
  await s.agent.act(trip.id, "owner", "discover");
  assert.equal((await s.agent.act(trip.id, "owner", "evaluate")).state, "SELECTED");
});

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
test("confirmation rejects a different plan than the one currently displayed", async () => {
  const s = setup(); const trip = await start(s);
  await assert.rejects(s.agent.act(trip.id, "owner", "confirm", { planId: "an-old-displayed-plan" }), { code: "SELECTION_CHANGED" });
  assert.equal((await s.store.read(trip.id)).confirmed, false);
  assert.equal(s.released.length, 0);
  await s.agent.act(trip.id, "owner", "confirm", { planId: trip.selectedPlan!.planId });
  assert.equal((await s.store.read(trip.id)).confirmed, true);
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
  const first = await s.agent.act(trip.id, "owner", "location", { ...input.preferences.home, accuracyMeters: 10, recordedAt: new Date(10_000).toISOString() });
  assert.equal(first.state, "WAITING_FOR_PICKUP");
  s.advance(15_000);
  await s.agent.act(trip.id, "owner", "location", { ...input.preferences.home, accuracyMeters: 10, recordedAt: new Date(25_000).toISOString() });
  s.advance(15_000);
  const arrived = await s.agent.act(trip.id, "owner", "location", { ...input.preferences.home, accuracyMeters: 10, recordedAt: new Date(40_000).toISOString() });
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
  assert.equal(overdue.alertSent, false, "a simulated notification is not a real Telegram message");
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
  assert.equal((await s.agent.read(trip.id, "owner")).state, "OVERDUE");
  assert.equal((await s.agent.journey(trip.id, "owner")).ride?.stage, "completed");
  assert.ok((await s.store.read(trip.id)).private, "ride completion does not prove arrival home");
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

test("a lost booking response is reconciled without sending a second precise request", async () => {
  const s = setup(); const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm"); await s.agent.act(trip.id, "owner", "verify");
  s.control.requestFails = true;
  await assert.rejects(s.agent.act(trip.id, "owner", "request"), { code: "BOOKING_UNCERTAIN" });
  assert.equal(s.released.length, 1);
  s.control.requestFails = false; s.advance(60_000);
  await Promise.all([s.agent.monitor(), s.agent.monitor()]);
  assert.equal((await s.agent.read(trip.id, "owner")).state, "WAITING_FOR_PICKUP");
  assert.equal((await s.store.read(trip.id)).pendingBooking, undefined);
  assert.equal(s.released.length, 1, "lookup must not resend coordinates or create a second booking");
});

test("arrival during an uncertain booking preserves request cancellation until it succeeds", async () => {
  const s = setup(); const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm"); await s.agent.act(trip.id, "owner", "verify");
  s.control.requestFails = true; s.control.cancelFails = true;
  await assert.rejects(s.agent.act(trip.id, "owner", "request"));
  const arrived = await s.agent.act(trip.id, "owner", "arrive");
  assert.equal(arrived.state, "ARRIVED"); assert.equal(arrived.sensitiveDataReleased, true);
  assert.equal((await s.store.read(trip.id)).private, undefined);
  s.control.cancelFails = false; s.advance(60_000); await s.agent.monitor();
  assert.equal((await s.agent.read(trip.id, "owner")).sensitiveDataReleased, false);
  assert.equal(s.released.length, 1);
});

test("an absent booking is replaced only after request cancellation succeeds", async () => {
  const s = setup(); const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm"); await s.agent.act(trip.id, "owner", "verify");
  s.control.requestFails = true;
  await assert.rejects(s.agent.act(trip.id, "owner", "request"));
  s.control.requestFails = false; s.control.requestMissing = true; s.control.cancelFails = true;
  await s.agent.monitor();
  assert.equal(s.released.length, 1, "a failed cancellation cannot authorize a replacement");
  assert.ok((await s.store.read(trip.id)).pendingBooking);
  s.control.cancelFails = false; s.advance(60_000); await s.agent.monitor();
  const replacement = await s.agent.read(trip.id, "owner");
  assert.equal(replacement.state, "WAITING_FOR_PICKUP");
  assert.equal(replacement.selectedPlan?.mode, "independent_ride");
  assert.equal(s.control.cancellations, 2); assert.equal(s.released.length, 2);
});

test("an uncertain booking keeps its original deadline and overdue alert through reconciliation", async () => {
  const s = setup(); const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm"); await s.agent.act(trip.id, "owner", "verify");
  s.control.requestFails = true;
  await assert.rejects(s.agent.act(trip.id, "owner", "request"));
  const deadline = (await s.agent.read(trip.id, "owner")).alertDeadlineAt;
  assert.ok(deadline); s.advance(2_000_000); await s.agent.monitor();
  assert.equal(s.sends(), 1);
  s.control.requestFails = false; s.advance(60_000); await s.agent.act(trip.id, "owner", "request");
  const reconciled = await s.agent.read(trip.id, "owner");
  assert.equal(reconciled.state, "OVERDUE"); assert.equal(reconciled.alertDeadlineAt, deadline);
  assert.equal(s.released.length, 1); assert.equal(s.sends(), 1);
});

test("reconciliation observes provider completion but waits for home arrival", async () => {
  const s = setup(); const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm"); await s.agent.act(trip.id, "owner", "verify");
  s.control.requestFails = true;
  await assert.rejects(s.agent.act(trip.id, "owner", "request"));
  s.control.requestFails = false; s.control.status = "completed"; await s.agent.monitor();
  const completed = await s.store.read(trip.id);
  assert.equal(completed.trip.state, "NAVIGATING"); assert.ok(completed.private);
  assert.equal(completed.pendingBooking, undefined); assert.equal(completed.trip.sensitiveDataReleased, true);
  assert.equal(s.released.length, 1);
});

test("completed rides still trigger exactly one overdue alert without home arrival", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  s.control.status = "completed";
  await s.agent.monitor();
  assert.equal((await s.agent.read(trip.id, "owner")).state, "NAVIGATING");
  s.advance(2_000_000);
  await s.agent.monitor(); await s.agent.monitor();
  assert.equal((await s.agent.read(trip.id, "owner")).state, "OVERDUE");
  assert.equal(s.sends(), 1);
});

test("providers without request reconciliation never trigger an unconfirmed replacement", async () => {
  const s = setup(); const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm"); await s.agent.act(trip.id, "owner", "verify");
  s.control.requestFails = true; s.control.canReconcile = false;
  await assert.rejects(s.agent.act(trip.id, "owner", "request"));
  s.control.requestFails = false; await s.agent.monitor();
  assert.equal(s.released.length, 1); assert.ok((await s.store.read(trip.id)).pendingBooking);
  const arrived = await s.agent.act(trip.id, "owner", "arrive");
  assert.equal(arrived.state, "ARRIVED"); assert.equal(arrived.sensitiveDataReleased, true);
  const record = await s.store.read(trip.id);
  assert.equal(record.private, undefined); assert.equal(record.pendingBooking, undefined);
  assert.equal(record.cleanup?.[0].requestId, s.released[0].tripId);
});

test("replacement outages retain the deadline and resume without losing recovery intent", async () => {
  const s = setup(); const trip = await start(s);
  await s.agent.act(trip.id, "owner", "confirm"); await s.agent.act(trip.id, "owner", "verify");
  s.control.requestFails = true;
  await assert.rejects(s.agent.act(trip.id, "owner", "request"));
  s.control.requestFails = false; s.control.requestMissing = true; s.control.evaluationFails = true;
  await s.agent.monitor();
  assert.equal((await s.agent.read(trip.id, "owner")).state, "FAILED");
  assert.equal(s.released.length, 1); assert.equal(s.control.cancellations, 1);
  s.advance(2_000_000); await s.agent.monitor();
  assert.equal(s.sends(), 1, "replacement failure must not disable the original deadline");
  s.control.evaluationFails = false; s.advance(60_000); await s.agent.monitor();
  const replaced = await s.agent.read(trip.id, "owner");
  assert.equal(replaced.state, "WAITING_FOR_PICKUP"); assert.equal(replaced.selectedPlan?.mode, "independent_ride");
  assert.equal(s.released.length, 2); assert.equal(s.control.cancellations, 1);
});

test("a persisted replacement checkpoint resumes after an interrupted cancellation flow", async () => {
  const s = setup(); const trip = await start(s);
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  let interrupted: TripRecord | undefined;
  const checkpoint = s.store.checkpoint.bind(s.store);
  s.store.checkpoint = async (record) => {
    await checkpoint(record);
    if (record.trip.state === "PROVIDER_FAILED") { interrupted = structuredClone(record); throw new Error("Process interrupted"); }
  };
  await assert.rejects(s.agent.act(trip.id, "owner", "cancel-provider"), /Process interrupted/);
  assert.ok(interrupted?.pendingReplacement); assert.equal(interrupted.booking, undefined);
  s.store.checkpoint = checkpoint;
  await s.store.create(interrupted); // Restore exactly the last durable checkpoint.
  await s.agent.monitor();
  const resumed = await s.store.read(trip.id);
  assert.equal(resumed.trip.state, "WAITING_FOR_PICKUP"); assert.equal(resumed.trip.selectedPlan?.mode, "independent_ride");
  assert.equal(resumed.pendingReplacement, undefined); assert.equal(resumed.replanCount, 1);
  assert.equal(s.released.length, 2); assert.equal(s.control.cancellations, 1);
});
