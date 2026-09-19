import type { CandidatePlan } from "../../types/provider";
import type { Recommendation } from "../../types/recommendation";

export type DecisionPriority = "balanced" | "lowest_cost" | "less_exposed";
export type PolicyVersion = "beacon-v1" | "beacon-v2";
export type SignalSource = "simulated" | "scheduled" | "live" | "mapped";
export type PlanSignals = {
  source: SignalSource;
  collectedAt?: string;
  validUntil?: string;
  dataVersion?: string;
  corridorId?: string;
  serviceAvailable?: boolean;
  transfersKnown?: boolean;
  observedReliability?: number;
  reliabilityObservedAt?: string;
  weather?: "clear" | "rain" | "severe" | "unknown";
  walkingPathClosed?: boolean;
  activeOfficialAlert?: boolean;
  lighting?: "verified_lit" | "verified_unlit" | "unknown";
  historicalReports?: { count: number; lookbackDays: number; sourceUrl: string };
  contextVersion?: string;
};
export type DecisionContext = {
  maxBudget: number;
  minimizeWalking?: boolean;
  minimizeTransfers?: boolean;
  maxWalkingMinutes?: number;
  priority?: DecisionPriority;
  excludedProviderIds?: string[];
  evaluatedAt?: string;
  policyVersion?: PolicyVersion;
  evaluationId?: string;
  objectiveVersion?: number;
  emergency?: boolean;
};
export type ScoreComponents = {
  waitAndTravel: number; walking: number; cost: number; transfers: number;
  reliability: number; unlitWalking: number;
};
export type RankedPlan = {
  planId: string; score: number; scoreUnits: number; cost: number;
  walkingMinutes: number; totalMinutes: number; transfers: number;
  source: SignalSource | "unknown"; reasons: string[]; components: ScoreComponents;
  evidence: PlanSignals | null;
};
type Metadata = {
  engine: "local" | "local_fallback" | "databricks" | "boundary";
  policyVersion: PolicyVersion; evaluatedAt: string; evaluationId: string;
  objectiveVersion: number; warnings: string[]; auditPersisted: boolean;
  statementId?: string; fallbackReason?: string;
};
export type DecisionResult = Metadata & (
  | { status: "RECOMMENDED"; recommendation: Recommendation; ranked: RankedPlan[];
      rejected: Record<string, string[]>; cheapestPlanId: string; leastWalkingPlanId: string;
      /** Compatibility alias: this means least walking, NOT measured crime risk. */
      lessExposedPlanId: string }
  | { status: "NO_FEASIBLE_PLAN"; ranked: []; rejected: Record<string, string[]> }
  | { status: "EMERGENCY"; ranked: []; rejected: Record<string, string[]> }
);

export type NormalizedPlan = {
  planId: string; providerId: string | null; mode: CandidatePlan["mode"];
  costCents: number; waitSeconds: number; travelSeconds: number; walkingSeconds: number;
  totalSeconds: number; transfers: number; reliabilityBasisPoints: number;
  reliabilityKnown: boolean; baseRejections: string[]; facts: PlanSignals | null;
};
export type PreparedDecision = {
  context: DecisionContext & { evaluatedAt: string; evaluationId: string; objectiveVersion: number; policyVersion: PolicyVersion };
  plans: NormalizedPlan[]; rejected: Record<string, string[]>; walkingWeight: number; transferWeight: number;
};
const identifier = /^[A-Za-z0-9_.:-]{1,128}$/;
const isId = (value: unknown): value is string => typeof value === "string" && identifier.test(value);
const finite = (value: unknown, maximum = 1440): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
const cents = (value: number) => Math.round(value * 100);
const seconds = (value: number) => Math.round(value * 60);
const validMoney = (value: unknown): value is number => finite(value, 10000) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
const date = (value: unknown) => typeof value === "string" ? Date.parse(value) : NaN;

/** Reject request ambiguity once; reject a malformed individual quote without losing good quotes. */
export function prepareDecision(candidates: CandidatePlan[], input: DecisionContext, signals: Record<string, PlanSignals> = {}): PreparedDecision {
  if (!input || !validMoney(input.maxBudget)) throw new Error("Budget must be nonnegative dollars with at most two decimal places");
  if (!Array.isArray(candidates) || candidates.length > 16) throw new Error("At most 16 candidate plans are supported");
  if (input.maxWalkingMinutes !== undefined && !finite(input.maxWalkingMinutes)) throw new Error("Invalid walking limit");
  if (input.priority !== undefined && !["balanced", "lowest_cost", "less_exposed"].includes(input.priority)) throw new Error("Invalid priority");
  if (input.policyVersion !== undefined && !["beacon-v1", "beacon-v2"].includes(input.policyVersion)) throw new Error("Invalid policy version");
  if (input.objectiveVersion !== undefined && (!Number.isSafeInteger(input.objectiveVersion) || input.objectiveVersion < 0)) throw new Error("Invalid objective version");
  if (input.evaluationId !== undefined && !isId(input.evaluationId)) throw new Error("Invalid evaluation ID");
  if (input.excludedProviderIds && (!Array.isArray(input.excludedProviderIds) || input.excludedProviderIds.length > 16 || !input.excludedProviderIds.every(isId))) throw new Error("Invalid provider exclusions");
  for (const flag of [input.minimizeWalking, input.minimizeTransfers, input.emergency]) if (flag !== undefined && typeof flag !== "boolean") throw new Error("Invalid preference");
  const now = input.evaluatedAt === undefined ? Date.now() : date(input.evaluatedAt);
  if (!Number.isFinite(now)) throw new Error("Invalid evaluation time");
  const context = { ...input, evaluatedAt: new Date(now).toISOString(), evaluationId: input.evaluationId ?? crypto.randomUUID(), objectiveVersion: input.objectiveVersion ?? 0, policyVersion: input.policyVersion ?? "beacon-v2" as PolicyVersion };
  const rejected: Record<string, string[]> = Object.create(null);
  const plans: NormalizedPlan[] = [];
  const seen = new Set<string>();
  const excluded = new Set(input.excludedProviderIds ?? []);
  for (const plan of candidates) {
    if (!plan || !isId(plan.planId) || seen.has(plan.planId)) throw new Error("Missing, invalid, or duplicate plan ID");
    seen.add(plan.planId);
    const reasons: string[] = [];
    if (!validMoney(plan.cost) || ![plan.waitMinutes, plan.travelMinutes, plan.walkingMinutes, plan.totalMinutes].every((x) => finite(x))) reasons.push("INVALID_VALUES");
    if (!(plan.providerId === null || isId(plan.providerId)) || typeof plan.providerName !== "string" || !plan.providerName.trim() || plan.providerName.length > 120 || !["walk", "transit", "campus_ride", "independent_ride"].includes(plan.mode) || typeof plan.available !== "boolean" || typeof plan.requiresProviderVerification !== "boolean") reasons.push("INVALID_PLAN");
    if (plan.transfers !== undefined && (!Number.isInteger(plan.transfers) || !finite(plan.transfers, 20))) reasons.push("INVALID_TRANSFERS");
    if (!reasons.length && Math.abs(seconds(plan.totalMinutes) - seconds(plan.waitMinutes) - seconds(plan.travelMinutes) - seconds(plan.walkingMinutes)) > 1) reasons.push("INVALID_TOTAL");
    if (reasons.length) { rejected[plan.planId] = reasons; continue; }
    const facts = signals[plan.planId] ?? null;
    if (facts && (!["simulated", "scheduled", "live", "mapped"].includes(facts.source) || (facts.corridorId !== undefined && !isId(facts.corridorId)))) reasons.push("INVALID_EVIDENCE");
    if (facts?.source === "mapped" && (plan.mode !== "walk" || !facts.dataVersion || !facts.validUntil)) reasons.push("INVALID_MAP_EVIDENCE");
    if (facts?.weather !== undefined && !["clear", "rain", "severe", "unknown"].includes(facts.weather)) reasons.push("INVALID_EVIDENCE");
    if (facts?.lighting !== undefined && !["verified_lit", "verified_unlit", "unknown"].includes(facts.lighting)) reasons.push("INVALID_EVIDENCE");
    if (!plan.available || facts?.serviceAvailable === false) reasons.push("UNAVAILABLE");
    if (plan.providerId && excluded.has(plan.providerId)) reasons.push("PROVIDER_EXCLUDED");
    if (cents(plan.cost) > cents(input.maxBudget)) reasons.push("OVER_BUDGET");
    if (input.maxWalkingMinutes !== undefined && seconds(plan.walkingMinutes) > seconds(input.maxWalkingMinutes)) reasons.push("TOO_MUCH_WALKING");
    if (facts?.validUntil !== undefined && (!Number.isFinite(date(facts.validUntil)) || date(facts.validUntil) <= now)) reasons.push("QUOTE_EXPIRED");
    if (facts?.source === "live") {
      if (!facts.collectedAt || !facts.validUntil) reasons.push("MISSING_QUOTE_FRESHNESS");
      else if (!Number.isFinite(date(facts.collectedAt)) || date(facts.collectedAt) > now || now - date(facts.collectedAt) >= 120000) reasons.push("QUOTE_STALE");
    }
    if (facts?.source === "scheduled" && (!facts.validUntil || facts.serviceAvailable !== true || (plan.mode === "transit" && (facts.transfersKnown !== true || plan.transfers === undefined)))) reasons.push("UNVERIFIED_SCHEDULE");
    const observedFresh = facts?.reliabilityObservedAt && Number.isFinite(date(facts.reliabilityObservedAt)) && date(facts.reliabilityObservedAt) <= now && now - date(facts.reliabilityObservedAt) <= 86400000;
    const reliability = observedFresh ? facts?.observedReliability : facts?.source === "simulated" ? plan.reliability : undefined;
    const reliabilityKnown = finite(reliability, 1);
    plans.push({ planId: plan.planId, providerId: plan.providerId, mode: plan.mode, costCents: cents(plan.cost), waitSeconds: seconds(plan.waitMinutes), travelSeconds: seconds(plan.travelMinutes), walkingSeconds: seconds(plan.walkingMinutes), totalSeconds: seconds(plan.totalMinutes), transfers: plan.transfers ?? 0, reliabilityBasisPoints: reliabilityKnown ? Math.round(reliability * 10000) : 5000, reliabilityKnown, baseRejections: [...new Set(reasons)], facts });
  }
  return { context, plans, rejected, walkingWeight: input.priority === "less_exposed" ? 6 : input.minimizeWalking ? 4 : 1, transferWeight: input.minimizeTransfers ? 8 : 4 };
}

export function scorePlan(plan: NormalizedPlan, prepared: PreparedDecision): { scoreUnits: number; components: ScoreComponents } {
  const advanced = prepared.context.policyVersion === "beacon-v2";
  const rainFactor = advanced && plan.facts?.weather === "rain" ? 1.5 : 1;
  const units = {
    waitAndTravel: 100 * (plan.waitSeconds + plan.travelSeconds),
    walking: 100 * prepared.walkingWeight * rainFactor * plan.walkingSeconds,
    cost: 120 * plan.costCents,
    transfers: 6000 * prepared.transferWeight * plan.transfers,
    reliability: plan.mode === "walk" ? 0 : 12 * (10000 - plan.reliabilityBasisPoints),
    unlitWalking: advanced && plan.facts?.lighting === "verified_unlit" ? 300 * plan.walkingSeconds : 0,
  };
  return { scoreUnits: Object.values(units).reduce((a, b) => a + b, 0), components: Object.fromEntries(Object.entries(units).map(([key, value]) => [key, value / 6000])) as ScoreComponents };
}

export function evaluateCandidates(candidates: CandidatePlan[], input: DecisionContext, signals: Record<string, PlanSignals> = {}): DecisionResult {
  const prepared = prepareDecision(candidates, input, signals);
  const { context } = prepared;
  const metadata: Metadata = { engine: "local", policyVersion: context.policyVersion, evaluatedAt: context.evaluatedAt, evaluationId: context.evaluationId, objectiveVersion: context.objectiveVersion, warnings: [], auditPersisted: false };
  const rejected = prepared.rejected;
  if (context.emergency) return { ...metadata, engine: "boundary", status: "EMERGENCY", ranked: [], rejected, warnings: ["Use the app's emergency-help flow; no transport provider has been contacted."] };
  const ranked: RankedPlan[] = [];
  for (const plan of prepared.plans) {
    const facts = plan.facts;
    const why = [...plan.baseRejections];
    if (facts?.walkingPathClosed && plan.walkingSeconds > 0) why.push("WALKING_PATH_CLOSED");
    if (facts?.weather === "severe" && plan.mode === "walk") why.push("SEVERE_WEATHER");
    if (why.length) { rejected[plan.planId] = why; continue; }
    const reasons = ["WITHIN_BUDGET"];
    if (facts?.weather === "rain" && context.policyVersion === "beacon-v2") reasons.push("RAIN_INCREASES_WALKING_COST");
    if (facts?.activeOfficialAlert) { reasons.push("OFFICIAL_ALERT_REVIEW"); metadata.warnings.push(`Official alert relevant to ${plan.planId}; review source before travel.`); }
    if (facts?.historicalReports) reasons.push("HISTORICAL_REPORTS_CONTEXT_ONLY");
    if (facts?.lighting === "verified_unlit" && context.policyVersion === "beacon-v2") reasons.push("VERIFIED_UNLIT_WALKING");
    if (!plan.reliabilityKnown && plan.mode !== "walk") reasons.push("RELIABILITY_UNKNOWN");
    if (!facts) reasons.push("SOURCE_UNKNOWN");
    const scored = scorePlan(plan, prepared);
    ranked.push({ planId: plan.planId, scoreUnits: scored.scoreUnits, score: scored.scoreUnits / 6000, components: scored.components, cost: plan.costCents / 100, walkingMinutes: plan.walkingSeconds / 60, totalMinutes: plan.totalSeconds / 60, transfers: plan.transfers, source: facts?.source ?? "unknown", reasons, evidence: facts });
  }
  const ordinal = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const byScore = (a: RankedPlan, b: RankedPlan) => a.scoreUnits - b.scoreUnits || a.walkingMinutes - b.walkingMinutes || a.cost - b.cost || a.totalMinutes - b.totalMinutes || ordinal(a.planId, b.planId);
  ranked.sort(byScore);
  if (!ranked.length) return { ...metadata, status: "NO_FEASIBLE_PLAN", ranked: [], rejected };
  const cheapest = [...ranked].sort((a, b) => a.cost - b.cost || byScore(a, b))[0];
  const leastWalking = [...ranked].sort((a, b) => a.walkingMinutes - b.walkingMinutes || byScore(a, b))[0];
  const best = context.priority === "lowest_cost" ? cheapest : ranked[0];
  const runnerUp = ranked.find((p) => p.planId !== best.planId);
  const original = candidates.find((p) => p.planId === best.planId)!;
  const reasonCodes = [...best.reasons, context.priority === "lowest_cost" ? "LOWEST_COST" : "LOWEST_POLICY_SCORE"];
  if (runnerUp && best.walkingMinutes < runnerUp.walkingMinutes) reasonCodes.push("LESS_WALKING_THAN_RUNNER_UP");
  if (runnerUp && best.transfers < runnerUp.transfers) reasonCodes.push("FEWER_TRANSFERS_THAN_RUNNER_UP");
  if (context.excludedProviderIds?.length) reasonCodes.push("REPLANNED_AFTER_PROVIDER_FAILURE");
  if (best.source === "scheduled") reasonCodes.push("SCHEDULED_TRANSIT");
  const explanation = `${original.providerName} costs $${best.cost.toFixed(2)} and involves ${Number(best.walkingMinutes.toFixed(2))} minute${best.walkingMinutes === 1 ? "" : "s"} of walking. ${context.priority === "lowest_cost" ? "It is the lowest-cost available choice within your limits." : "It has the best overall score for your settings."}`;
  return { ...metadata, status: "RECOMMENDED", recommendation: { selectedPlanId: best.planId, ...(runnerUp ? { runnerUpPlanId: runnerUp.planId } : {}), reasonCodes, explanation, evaluatedAt: context.evaluatedAt }, ranked, rejected, cheapestPlanId: cheapest.planId, leastWalkingPlanId: leastWalking.planId, lessExposedPlanId: leastWalking.planId };
}
