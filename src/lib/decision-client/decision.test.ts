import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCandidates, type PlanSignals } from "./decision";
import type { CandidatePlan } from "../../types/provider";

const candidates: CandidatePlan[] = [
  { planId: "campus", providerId: "campus_ride", providerName: "Campus Ride", mode: "campus_ride", available: true, cost: 0, waitMinutes: 8, travelMinutes: 11, walkingMinutes: 1, totalMinutes: 20, reliability: 0.98, requiresProviderVerification: true },
  { planId: "independent", providerId: "independent_ride", providerName: "Independent Ride", mode: "independent_ride", available: true, cost: 7, waitMinutes: 5, travelMinutes: 10, walkingMinutes: 1, totalMinutes: 16, reliability: 0.94, requiresProviderVerification: true },
  { planId: "transit", providerId: "transit", providerName: "Transit", mode: "transit", available: true, cost: 0, waitMinutes: 15, travelMinutes: 14, walkingMinutes: 5, totalMinutes: 34, reliability: 0.94, requiresProviderVerification: true },
  { planId: "walk", providerId: null, providerName: "Walk", mode: "walk", available: true, cost: 0, waitMinutes: 0, travelMinutes: 0, walkingMinutes: 22, totalMinutes: 22, requiresProviderVerification: false },
];
const signals: Record<string, PlanSignals> = Object.fromEntries(candidates.map((p) => [p.planId, { source: "simulated" }]));
const context = { maxBudget: 10, minimizeWalking: true, evaluatedAt: "2026-09-19T23:00:00.000Z" };

test("baseline, cancellation, and tighter budget choose different options", () => {
  const first = evaluateCandidates(candidates, context, signals);
  assert.equal(first.status, "RECOMMENDED");
  if (first.status !== "RECOMMENDED") return;
  assert.equal(first.recommendation.selectedPlanId, "campus");
  assert.deepEqual(first.ranked.map((x) => x.score), [23.4, 34.2, 50.2, 88]);
  const second = evaluateCandidates(candidates, { ...context, excludedProviderIds: ["campus_ride"] }, signals);
  assert.equal(second.status, "RECOMMENDED");
  if (second.status !== "RECOMMENDED") return;
  assert.equal(second.recommendation.selectedPlanId, "independent");
  const third = evaluateCandidates(candidates, { ...context, maxBudget: 6, excludedProviderIds: ["campus_ride"] }, signals);
  assert.equal(third.status, "RECOMMENDED");
  if (third.status !== "RECOMMENDED") return;
  assert.equal(third.recommendation.selectedPlanId, "transit");
});

test("price view and walking view stay distinct", () => {
  const result = evaluateCandidates(candidates, { ...context, excludedProviderIds: ["campus_ride"] }, signals);
  assert.equal(result.status, "RECOMMENDED");
  if (result.status !== "RECOMMENDED") return;
  assert.equal(result.cheapestPlanId, "transit");
  assert.equal(result.lessExposedPlanId, "independent");
});

test("closed path and quote expiry remove options; impossible constraint returns no plan", () => {
  const result = evaluateCandidates(candidates, { ...context, maxWalkingMinutes: 0 }, signals);
  assert.equal(result.status, "NO_FEASIBLE_PLAN");
  const changed = evaluateCandidates(candidates, context, { ...signals, campus: { source: "live", collectedAt: "2026-09-19T22:59:00.000Z", validUntil: "2026-09-19T22:59:00.000Z" }, walk: { source: "simulated", walkingPathClosed: true } });
  assert.equal(changed.status, "RECOMMENDED");
  if (changed.status !== "RECOMMENDED") return;
  assert.equal(changed.recommendation.selectedPlanId, "independent");
  assert.deepEqual(changed.rejected.campus, ["QUOTE_EXPIRED"]);
  assert.deepEqual(changed.rejected.walk, ["WALKING_PATH_CLOSED"]);
});

test("historical reports are context, not a fabricated crime probability", () => {
  const result = evaluateCandidates(candidates, context, { ...signals, campus: { source: "simulated", historicalReports: { count: 2, lookbackDays: 90, sourceUrl: "https://police.vt.edu" } } });
  assert.equal(result.status, "RECOMMENDED");
  if (result.status !== "RECOMMENDED") return;
  assert.equal(result.recommendation.selectedPlanId, "campus");
  assert.ok(result.ranked[0].reasons.includes("HISTORICAL_REPORTS_CONTEXT_ONLY"));
});

test("budget equality, malformed quotes, and duplicate request IDs", () => {
  const exact = evaluateCandidates([candidates[1]], { ...context, maxBudget: 7 }, signals);
  assert.equal(exact.status, "RECOMMENDED");
  const malformed = evaluateCandidates([{ ...candidates[0], cost: NaN }, { ...candidates[1], transfers: -1 }, candidates[2]], context, signals);
  assert.equal(malformed.status, "RECOMMENDED");
  assert.deepEqual(malformed.rejected.campus, ["INVALID_VALUES"]);
  assert.deepEqual(malformed.rejected.independent, ["INVALID_TRANSFERS"]);
  assert.throws(() => evaluateCandidates([candidates[0], candidates[0]], context, signals), /duplicate/);
  assert.throws(() => evaluateCandidates(candidates, { maxBudget: 1.001 }), /decimal/);
});

test("integer scoring, ordinal ties, and input ordering are deterministic", () => {
  const twins = [{ ...candidates[0], planId: "z" }, { ...candidates[0], planId: "A" }];
  const facts: Record<string, PlanSignals> = { A: { source: "simulated" }, z: { source: "simulated" } };
  const a = evaluateCandidates(twins, context, facts);
  const b = evaluateCandidates([...twins].reverse(), context, facts);
  assert.deepEqual(a.ranked, b.ranked);
  assert.equal(a.ranked[0].planId, "A");
  assert.equal(a.ranked[0].scoreUnits, 140400);
});

test("v2 uses rain/unlit walking; v1 scoring stays frozen; severe weather excludes walking", () => {
  const enriched = { ...signals, campus: { source: "simulated" as const, weather: "rain" as const, lighting: "verified_unlit" as const }, walk: { source: "simulated" as const, weather: "severe" as const } };
  const v2 = evaluateCandidates(candidates, context, enriched);
  const v1 = evaluateCandidates(candidates, { ...context, policyVersion: "beacon-v1" }, enriched);
  assert.equal(v2.ranked.find((p) => p.planId === "campus")?.score, 28.4);
  assert.equal(v1.ranked.find((p) => p.planId === "campus")?.score, 23.4);
  assert.deepEqual(v2.rejected.walk, ["SEVERE_WEATHER"]);
});

test("live evidence requires freshness and ignores provider-claimed reliability", () => {
  const missing = evaluateCandidates([candidates[0]], context, { campus: { source: "live" } });
  assert.equal(missing.status, "NO_FEASIBLE_PLAN");
  const fresh = { source: "live" as const, collectedAt: "2026-09-19T22:59:30.000Z", validUntil: "2026-09-19T23:01:30.000Z" };
  const result = evaluateCandidates([candidates[0]], context, { campus: fresh });
  assert.equal(result.ranked[0].score, 33);
  assert.ok(result.ranked[0].reasons.includes("RELIABILITY_UNKNOWN"));
  const observed = evaluateCandidates([candidates[0]], context, { campus: { ...fresh, observedReliability: 0.9, reliabilityObservedAt: context.evaluatedAt } });
  assert.equal(observed.ranked[0].score, 25);
});

test("scheduled data needs verified service and transfer information", () => {
  const result = evaluateCandidates([candidates[2]], context, { transit: { source: "scheduled", validUntil: "2026-09-20T23:00:00Z" } });
  assert.deepEqual(result.rejected.transit, ["UNVERIFIED_SCHEDULE"]);
});

test("price priority chooses cheapest feasible option and preserves alternatives", () => {
  const result = evaluateCandidates(candidates, { ...context, excludedProviderIds: ["campus_ride"], priority: "lowest_cost" }, signals);
  assert.equal(result.status, "RECOMMENDED");
  if (result.status !== "RECOMMENDED") return;
  assert.equal(result.recommendation.selectedPlanId, "transit");
  assert.equal(result.leastWalkingPlanId, "independent");
  assert.ok(result.recommendation.reasonCodes.includes("LOWEST_COST"));
  assert.ok(!result.recommendation.reasonCodes.includes("LOWEST_POLICY_SCORE"));
});

test("raising cost cannot improve the option's score; emergency never chooses a plan", () => {
  const first = evaluateCandidates([candidates[1]], context, signals);
  const second = evaluateCandidates([{ ...candidates[1], cost: 8 }], context, signals);
  assert.ok(second.ranked[0].scoreUnits > first.ranked[0].scoreUnits);
  assert.equal(evaluateCandidates(candidates, { ...context, emergency: true }, signals).status, "EMERGENCY");
});
