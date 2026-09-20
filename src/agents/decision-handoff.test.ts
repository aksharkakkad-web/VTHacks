import { test } from "node:test";
import { strict as assert } from "node:assert";
import { decisionRecommendation, type DecisionHandoff } from "./student/databricks";
import { runDecision } from "../integrations/databricks/evaluate";
import { evaluateCandidates } from "../lib/decision-client/decision";
import type { CandidatePlan } from "../types/provider";
import type { TripContext } from "../lib/trip-state/model";

const now = Date.now();
const plans: CandidatePlan[] = [
  { planId: "campus-quote", providerId: "campus", providerName: "Campus Ride", mode: "campus_ride", available: true, cost: 0, waitMinutes: 8, travelMinutes: 11, walkingMinutes: 1, totalMinutes: 20, reliability: 0.98, transfers: 0, requiresProviderVerification: true },
  { planId: "independent-quote", providerId: "independent", providerName: "Independent Ride", mode: "independent_ride", available: true, cost: 7, waitMinutes: 5, travelMinutes: 10, walkingMinutes: 1, totalMinutes: 16, reliability: 0.94, transfers: 0, requiresProviderVerification: true },
];
const context: TripContext = { maxBudget: 10, minimizeWalking: true, minimizeTransfers: false, currentTime: new Date(now).toISOString(), hasBeenDrinking: true };
const handoff: DecisionHandoff = { quoteDeadline: now + 120000, quoteExpirations: Object.fromEntries(plans.map(p => [p.planId, now + 120000])), simulatedPlanIds: plans.map(p => p.planId), excludedProviderIds: [] };

test("decision handoff uses the teammate policy and exposes fallback and simulation", async () => {
  const recommend = decisionRecommendation(runDecision);
  const first = await recommend(plans, context, handoff);
  assert.equal(first.selectedPlanId, "campus-quote");
  assert.ok(first.reasonCodes.includes("LOCAL_POLICY_FALLBACK"));
  assert.ok(first.reasonCodes.includes("SIMULATED_TRANSPORT"));
  assert.match(first.explanation, /local policy/i);
  const replacement = await recommend(plans, context, { ...handoff, excludedProviderIds: ["campus"] });
  assert.equal(replacement.selectedPlanId, "independent-quote");
});

test("decision handoff passes only ranking context and keeps expiry and provenance", async () => {
  const recommend = decisionRecommendation(async (candidates, input, signals) => {
    assert.deepEqual(Object.keys(input).sort(), ["evaluatedAt", "excludedProviderIds", "maxBudget", "minimizeTransfers", "minimizeWalking", "objectiveVersion"].sort());
    assert.equal(input.minimizeWalking, true);
    assert.equal(input.objectiveVersion, 0);
    assert.equal(signals["campus-quote"].source, "simulated");
    assert.equal(signals["campus-quote"].validUntil, new Date(handoff.quoteDeadline).toISOString());
    const result = evaluateCandidates(candidates, input, signals);
    return { ...result, engine: "databricks", statementId: "unit-test-only", auditPersisted: true };
  });
  const result = await recommend(plans, { ...context, minimizeWalking: false }, handoff);
  assert.ok(result.reasonCodes.includes("DATABRICKS_EVALUATION"));
  assert.ok(!result.reasonCodes.includes("LOCAL_POLICY_FALLBACK"));
  assert.match(result.explanation, /simulated/i);
});

test("decision handoff excludes expired quotes and reports no feasible result", async () => {
  const recommend = decisionRecommendation(runDecision);
  const expired = { ...handoff, quoteExpirations: { ...handoff.quoteExpirations, "campus-quote": now - 1 } };
  assert.equal((await recommend(plans, context, expired)).selectedPlanId, "independent-quote");
  await assert.rejects(recommend(plans, { ...context, maxBudget: 0 }, expired), { code: "NO_FEASIBLE_PLAN" });
});

test("unknown transportation provenance is never promoted to live", async () => {
  const result = await decisionRecommendation(runDecision)(plans, context, { ...handoff, simulatedPlanIds: [] });
  assert.ok(result.reasonCodes.includes("SOURCE_UNKNOWN"));
  assert.ok(!result.reasonCodes.includes("SIMULATED_TRANSPORT"));
  assert.match(result.explanation, /source is unverified/i);
});

test("decision handoff rejects an evaluation for a different objective", async () => {
  const recommend = decisionRecommendation(async (candidates, input, signals) => ({ ...evaluateCandidates(candidates, input, signals), objectiveVersion: 1 }));
  await assert.rejects(recommend(plans, context, handoff), { code: "STALE_RECOMMENDATION" });
});

test("imported current weather affects scoring without changing transport provenance", async () => {
  const recommend = decisionRecommendation(async (candidates, input, signals) => {
    assert.equal(signals["campus-quote"].weather, "rain");
    assert.equal(signals["campus-quote"].source, "simulated");
    assert.equal(signals["campus-quote"].validUntil, new Date(now + 10000).toISOString());
    assert.equal(signals["independent-quote"], undefined, "an unknown transport source must stay unknown");
    return evaluateCandidates(candidates, input, signals);
  });
  const result = await recommend(plans, context, { ...handoff, simulatedPlanIds: ["campus-quote"], weatherEvidence: { status: "current", condition: "rain", issuedAt: new Date(now - 1000).toISOString(), validUntil: new Date(now + 10000).toISOString(), sourceUrl: "https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly" } });
  assert.ok(result.reasonCodes.includes("RAIN_INCREASES_WALKING_COST"));
});

test("expired or future weather cannot affect recommendations", async () => {
  const recommend = decisionRecommendation(async (candidates, input, signals) => {
    assert.equal(signals["campus-quote"].weather, undefined);
    return evaluateCandidates(candidates, input, signals);
  });
  for (const times of [{ issuedAt: now - 1000, validUntil: now - 1 }, { issuedAt: now + 1, validUntil: now + 1000 }]) {
    await recommend(plans, context, { ...handoff, weatherEvidence: { status: "current", condition: "severe", issuedAt: new Date(times.issuedAt).toISOString(), validUntil: new Date(times.validUntil).toISOString(), sourceUrl: "https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly" } });
  }
});
