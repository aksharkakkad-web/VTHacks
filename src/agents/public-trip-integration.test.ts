import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseTripInput } from "./student/input";
import { StudentAgent } from "./student/service";
import { decisionRecommendation } from "./student/databricks";
import { MemoryTripStore } from "../lib/trip-state/store";
import { LocalDemoDirectory } from "../integrations/ans/directory";
import { demoDescriptors } from "./demo-provider";
import { normalizeQuote } from "./contract";
import { evaluateCandidates, type PlanSignals } from "../lib/decision-client/decision";
import { collectPublicTripOptions, publicCorridorEndpoints, readPublicRoute } from "../lib/decision-client/trip-options";
import { walkingOption, runIntelligence } from "../integrations/databricks/intelligence";
import { selectScheduledTransit } from "../lib/decision-client/transit";

const route = readPublicRoute("eggleston-pritchard")!;
const time = Math.max(Date.parse("2026-09-19T15:00:00.000Z"), Date.parse(route.captured_at) + 1, route.construction_avoidance ? Date.parse(route.construction_avoidance.evaluated_at) + 1 : 0), at = new Date(time).toISOString();

test("named demo routes use public endpoints; default downtown stays unchanged and mismatches fail locally", () => {
  const standard = parseTripInput({}, true, time);
  assert.equal(standard.originZone, "Downtown Blacksburg");
  assert.equal(standard.corridorId, undefined);
  const named = parseTripInput({ corridorId: "eggleston-pritchard" }, true, time);
  assert.deepEqual(named.private.origin, publicCorridorEndpoints("eggleston-pritchard").origin);
  assert.equal(named.originZone, "VT academic campus");
  assert.throws(() => parseTripInput({ corridorId: "downtown-pritchard" }, true, time), { code: "UNSUPPORTED_CORRIDOR" });
  assert.throws(() => parseTripInput({ corridorId: "eggleston-pritchard", origin: { lat: 37.229, lng: -80.414 } }, true, time), { code: "CORRIDOR_ENDPOINT_MISMATCH" });
  const endpoints = publicCorridorEndpoints("newman-pritchard");
  assert.equal(parseTripInput({ corridorId: "newman-pritchard", origin: endpoints.origin, preferences: { home: endpoints.home, maxBudget: 10 } }, false, time).corridorId, "newman-pritchard");
});

test("real scheduled departure keeps explicit demo access estimates; production cannot invent stop walks", async () => {
  const readers = {
    walking: async () => ({ ...walkingOption(route, at)!, route, source: "local_snapshot" as const }),
    transit: async (request: Parameters<typeof selectScheduledTransit>[1]) => selectScheduledTransit([{ corridor_id: "eggleston-pritchard", trip_id: "public-trip", route_id: "CAS", route_name: "Campus Shuttle", service_date: at.slice(0, 10), departure_at: new Date(time + 600000).toISOString(), arrival_at: new Date(time + 900000).toISOString(), travel_minutes: 5, from_stop_id: "1143", to_stop_id: "1146", source_id: "bt-gtfs", source_version: "test-public-snapshot" }], request),
  };
  const demo = await collectPublicTripOptions("eggleston-pritchard", true, at, readers);
  assert.equal(demo.candidates.length, 2);
  const bus = demo.candidates.find(p => p.mode === "transit")!;
  assert.equal(bus.walkingMinutes, 6);
  assert.equal(bus.waitMinutes, 7);
  assert.equal(demo.signals[bus.planId].source, "scheduled");
  assert.match(bus.providerName, /demo stop walks/);
  assert.equal(demo.transit.walkingSource, "demo_estimate");
  assert.equal(demo.walkingAlternative?.source, "local_snapshot");
  const production = await collectPublicTripOptions("eggleston-pritchard", false, at, { ...readers, transit: async () => { throw new Error("Must not fetch with unverified access paths"); } });
  assert.equal(production.transit.status, "access_unverified");
  assert.deepEqual(production.candidates.map(p => p.mode), ["walk"]);
});

test("supplied local route produces a grounded briefing without a managed route query", async () => {
  const walk = walkingOption(route, at)!;
  const result = await runIntelligence([walk.candidate], { maxBudget: 0, evaluatedAt: at }, { [walk.candidate.planId]: walk.signals }, { corridorId: "eggleston-pritchard", loadedRoute: { evidence: route, source: "local_snapshot" }, fetch: async () => { throw new Error("No workspace should query"); } });
  assert.equal(result.decision.status, "RECOMMENDED");
  assert.equal(result.route?.corridor_id, "eggleston-pritchard");
  assert.ok(result.warnings.includes("LOCAL_ROUTE_SNAPSHOT"));
  assert.ok(result.explanation.facts.some(f => f.id === "route" && /walking alternative/.test(f.text)));
  assert.equal(result.routeStatementId, undefined);
});

test("construction-aware walking expires with its public source and never renews itself from a new request clock", () => {
  const constructed = { ...route, construction_avoidance: { algorithm_version: "official-network-construction-avoidance-v1" as const, status: "applied" as const, evaluated_at: at, valid_until: new Date(time + 5000).toISOString(), source_snapshot_captured_at: at, source_snapshot_version: "test", excluded_area_ids: [], sources: [], reason: null } };
  assert.equal(walkingOption(constructed, at)?.signals.validUntil, new Date(time + 5000).toISOString());
  assert.equal(walkingOption(constructed, new Date(time + 5000).toISOString()), null);
  assert.equal(walkingOption(constructed, new Date(time - 1).toISOString()), null);
  assert.equal(walkingOption({ ...constructed, construction_avoidance: { ...constructed.construction_avoidance, status: "unavailable", valid_until: null } }, at), null);
});

function setup(closed = false) {
  let now = time, calls = 0;
  const store = new MemoryTripStore();
  const providers = demoDescriptors.filter(p => p.mode !== "transit");
  const agent = new StudentAgent({ store, directory: new LocalDemoDirectory(providers, true), demo: true, clock: () => now,
    provider: descriptor => ({ descriptor,
      quote: async () => normalizeQuote({ provider_id: descriptor.id, available: true, simulated: true, cost: descriptor.id === "campus_ride" ? 0 : 7, pickup_eta_minutes: 8, travel_time_minutes: 11, walking_minutes: 1, expires_at: new Date(now + 120000).toISOString() }, descriptor, now),
      requestTrip: async () => ({ id: `${descriptor.id}-booking`, status: "waiting" }),
      getStatus: async () => ({ id: `${descriptor.id}-booking`, status: "waiting" }), cancelTrip: async () => {},
    }),
    recommend: decisionRecommendation(async () => { throw new Error("Basic evaluation must not also run"); }, async (plans, context, signals, options) => {
      calls++;
      assert.ok(!JSON.stringify({ context, signals, options }).includes('"lat"'), "no precise student coordinates reach the intelligence boundary");
      return runIntelligence(plans, context, signals, { corridorId: options?.corridorId, ...(options?.walkingAlternative ? { loadedRoute: { evidence: options.walkingAlternative.route, source: options.walkingAlternative.source } } : {}) });
    }),
    publicTripOptions: async (id, demo, evaluatedAt) => collectPublicTripOptions(id, demo, evaluatedAt, {
      walking: async () => { const option = walkingOption(route, evaluatedAt)!; return { ...option, signals: { ...option.signals, walkingPathClosed: closed, validUntil: new Date(now + 3000).toISOString() }, route, source: "local_snapshot" }; }, transit: async () => null,
    }),
    notify: async () => ({ id: "unused", simulated: true }),
  });
  return { agent, store, calls: () => calls, advance: (ms: number) => { now += ms; } };
}

test("trip flow keeps mapped evidence, owner protection and source expiry through confirmation", async () => {
  const s = setup();
  const trip = await s.agent.create("owner", { corridorId: "eggleston-pritchard", preferences: { maxBudget: 0, walkingPreference: "normal" } });
  const discovered = await s.agent.act(trip.id, "owner", "discover");
  assert.ok(discovered.candidates.some(p => p.planId === "mapped:eggleston-pritchard"));
  assert.ok(!discovered.candidates.some(p => p.planId.startsWith("walk-")));
  const selected = await s.agent.act(trip.id, "owner", "evaluate");
  assert.equal(selected.selectedPlan?.mode, "walk");
  assert.equal(s.calls(), 1);
  assert.match(selected.recommendation!.explanation, /dated campus map/);
  assert.ok(!selected.recommendation!.reasonCodes.includes("SIMULATED_TRANSPORT"));
  const evidence = await s.agent.evidence(trip.id, "owner");
  assert.equal(evidence.options?.walkingAlternative?.route.corridor_id, "eggleston-pritchard");
  assert.equal(evidence.intelligence?.explanation.engine, "template");
  assert.equal(evidence.selectionCurrent, true);
  await assert.rejects(s.agent.evidence(trip.id, "other"), { code: "TRIP_NOT_FOUND" });
  s.advance(3001);
  await assert.rejects(s.agent.act(trip.id, "owner", "confirm"), { code: "QUOTE_EXPIRED" });
  assert.equal((await s.agent.evidence(trip.id, "owner")).selectionCurrent, false);
});

test("closed mapped walking stays excluded and cancellation reruns intelligence without failed provider", async () => {
  const s = setup(true);
  const trip = await s.agent.create("owner", { corridorId: "eggleston-pritchard" });
  await s.agent.act(trip.id, "owner", "discover");
  const initial = await s.agent.act(trip.id, "owner", "evaluate");
  assert.equal(initial.selectedPlan?.providerId, "campus_ride");
  const evidence = await s.agent.evidence(trip.id, "owner");
  assert.ok(evidence.intelligence?.decision.rejected["mapped:eggleston-pritchard"].includes("WALKING_PATH_CLOSED"));
  for (const action of ["confirm", "verify", "request"] as const) await s.agent.act(trip.id, "owner", action);
  const replacement = await s.agent.act(trip.id, "owner", "cancel-provider");
  assert.equal(replacement.selectedPlan?.providerId, "independent_ride");
  assert.equal(s.calls(), 2);
  assert.ok(!replacement.candidates.some(p => p.providerId === "campus_ride"));
  assert.ok(replacement.recommendation?.reasonCodes.includes("REPLANNED_AFTER_PROVIDER_FAILURE"));
});

test("mapped sidecar stays mapped through the decision handoff", async () => {
  const option = walkingOption(route, at)!;
  let accepted: PlanSignals | undefined;
  const recommend = decisionRecommendation(async (plans, context, signals) => { accepted = signals[option.candidate.planId]; return evaluateCandidates(plans, context, signals); });
  await recommend([option.candidate], { maxBudget: 0, minimizeWalking: false, minimizeTransfers: false, currentTime: at }, { quoteDeadline: time + 120000, quoteExpirations: {}, simulatedPlanIds: [], excludedProviderIds: [], planSignals: { [option.candidate.planId]: { ...option.signals, validUntil: new Date(time + 500).toISOString() } } });
  assert.equal(accepted?.source, "mapped");
  assert.equal(accepted?.validUntil, new Date(time + 500).toISOString());
});
