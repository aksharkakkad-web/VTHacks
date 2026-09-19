import type { CandidatePlan } from "../../types/provider";
import type { Recommendation } from "../../types/recommendation";
import type { DecisionContext, DecisionResult, PlanSignals } from "../../lib/decision-client/decision";
import { TripError, type TripContext } from "../../lib/trip-state/model";
import { isCurrentWeather, type WeatherEvidence } from "../../lib/campus-evidence/evidence";
import type { WalkingAlternative } from "../../lib/decision-client/trip-options";
import type { RouteEvidence } from "../../lib/decision-client/route-evidence";
import type { SafetyEvidence } from "../../lib/decision-client/safety-evidence";
import type { Explanation } from "../../integrations/databricks/explain";

export type TripDecisionEvidence = { decision: DecisionResult; route: RouteEvidence | null; explanation: Explanation; warnings: string[]; routeStatementId?: string; safetyEvidence?: SafetyEvidence };

/** Internal metadata; never adds fields to the shared CandidatePlan contract. */
export type DecisionHandoff = {
  quoteDeadline: number;
  quoteExpirations: Record<string, number>;
  simulatedPlanIds: string[];
  excludedProviderIds: string[];
  weatherEvidence?: WeatherEvidence;
  planSignals?: Record<string, PlanSignals>;
  corridorId?: string;
  walkingAlternative?: WalkingAlternative;
  onEvidence?: (evidence: TripDecisionEvidence) => void;
};
type Evaluate = (plans: CandidatePlan[], context: DecisionContext, signals: Record<string, PlanSignals>) => Promise<DecisionResult>;
type Intelligence = (plans: CandidatePlan[], context: DecisionContext, signals: Record<string, PlanSignals>, options?: { corridorId?: string; walkingAlternative?: WalkingAlternative }) => Promise<TripDecisionEvidence>;

export function decisionRecommendation(evaluate: Evaluate, intelligence?: Intelligence) {
  return async (plans: CandidatePlan[], context: TripContext, handoff: DecisionHandoff): Promise<Recommendation> => {
    const now = Date.parse(context.currentTime);
    const fresh = plans.filter(plan => Math.min(handoff.quoteDeadline, handoff.quoteExpirations[plan.planId] ?? Infinity) > now);
    const signals: Record<string, PlanSignals> = {};
    for (const plan of fresh) {
      // ANS identity does not prove that a transportation quote is live.
      // Only an explicit simulation flag is carried across this boundary.
      if (handoff.planSignals?.[plan.planId]) signals[plan.planId] = { ...handoff.planSignals[plan.planId] };
      else if (handoff.simulatedPlanIds.includes(plan.planId)) signals[plan.planId] = {
        source: "simulated",
        validUntil: new Date(Math.min(handoff.quoteDeadline, handoff.quoteExpirations[plan.planId] ?? Infinity)).toISOString(),
      };
      if (signals[plan.planId]) signals[plan.planId].validUntil = new Date(Math.min(handoff.quoteDeadline, handoff.quoteExpirations[plan.planId] ?? Infinity, signals[plan.planId].validUntil ? Date.parse(signals[plan.planId].validUntil!) : Infinity)).toISOString();
      const weather = handoff.weatherEvidence;
      if (signals[plan.planId] && isCurrentWeather(weather, now)) {
        signals[plan.planId] = { ...signals[plan.planId], weather: weather.condition,
          ...(weather.activeOfficialAlert ? { activeOfficialAlert: true } : {}),
          validUntil: new Date(Math.min(Date.parse(signals[plan.planId].validUntil!), Date.parse(weather.validUntil))).toISOString() };
      }
    }
    const decisionContext: DecisionContext = {
      maxBudget: context.maxBudget,
      minimizeWalking: context.minimizeWalking || context.hasBeenDrinking === true || context.exhausted === true,
      minimizeTransfers: context.minimizeTransfers,
      excludedProviderIds: handoff.excludedProviderIds,
      evaluatedAt: context.currentTime,
      // Trip objectives are immutable in this API. Replanning preserves them.
      objectiveVersion: 0,
    };
    const evaluated = intelligence ? await intelligence(fresh, decisionContext, signals, { corridorId: handoff.corridorId, walkingAlternative: handoff.walkingAlternative }) : await evaluate(fresh, decisionContext, signals);
    const result = "decision" in evaluated ? evaluated.decision : evaluated;
    if (result.objectiveVersion !== 0) throw new TripError("STALE_RECOMMENDATION", "Recommendation does not match the current objective");
    if ("decision" in evaluated) handoff.onEvidence?.(evaluated);
    if (result.status !== "RECOMMENDED") throw new TripError("NO_FEASIBLE_PLAN", "No available plan fits your current constraints");
    const simulated = handoff.simulatedPlanIds.includes(result.recommendation.selectedPlanId);
    const database = result.engine === "databricks";
    const selectedSource = result.ranked.find(p => p.planId === result.recommendation.selectedPlanId)?.source;
    const sourceDescription = simulated ? "Transportation data is simulated." : selectedSource === "mapped" ? "Walking follows dated campus map geometry; entrance connections and current conditions are not fully verified." : selectedSource === "scheduled" ? "Bus timing is scheduled, not live; stop-access walking times are labeled demo estimates." : "Transportation data source is unverified.";
    return {
      ...result.recommendation,
      reasonCodes: [...new Set([...result.recommendation.reasonCodes, database ? "DATABRICKS_EVALUATION" : "LOCAL_POLICY_FALLBACK", ...(simulated ? ["SIMULATED_TRANSPORT"] : [])])],
      explanation: `${result.recommendation.explanation} ${database ? "Evaluated by Databricks." : "Advanced campus context temporarily unavailable; local policy used."} ${sourceDescription}`,
    };
  };
}
