import type { CandidatePlan } from "../../types/provider";
import type { Recommendation } from "../../types/recommendation";
import type { DecisionContext, DecisionResult, PlanSignals } from "../../lib/decision-client/decision";
import { TripError, type TripContext } from "../../lib/trip-state/model";

/** Internal metadata; never adds fields to the shared CandidatePlan contract. */
export type DecisionHandoff = {
  quoteDeadline: number;
  quoteExpirations: Record<string, number>;
  simulatedPlanIds: string[];
  excludedProviderIds: string[];
};
type Evaluate = (plans: CandidatePlan[], context: DecisionContext, signals: Record<string, PlanSignals>) => Promise<DecisionResult>;

export function decisionRecommendation(evaluate: Evaluate) {
  return async (plans: CandidatePlan[], context: TripContext, handoff: DecisionHandoff): Promise<Recommendation> => {
    const now = Date.parse(context.currentTime);
    const fresh = plans.filter(plan => Math.min(handoff.quoteDeadline, handoff.quoteExpirations[plan.planId] ?? Infinity) > now);
    const signals: Record<string, PlanSignals> = {};
    for (const plan of fresh) {
      // ANS identity does not prove that a transportation quote is live.
      // Only an explicit simulation flag is carried across this boundary.
      if (handoff.simulatedPlanIds.includes(plan.planId)) signals[plan.planId] = {
        source: "simulated",
        validUntil: new Date(Math.min(handoff.quoteDeadline, handoff.quoteExpirations[plan.planId] ?? Infinity)).toISOString(),
      };
    }
    const result = await evaluate(fresh, {
      maxBudget: context.maxBudget,
      minimizeWalking: context.minimizeWalking || context.hasBeenDrinking === true || context.exhausted === true,
      minimizeTransfers: context.minimizeTransfers,
      excludedProviderIds: handoff.excludedProviderIds,
      evaluatedAt: context.currentTime,
      // Trip objectives are immutable in this API. Replanning preserves them.
      objectiveVersion: 0,
    }, signals);
    if (result.objectiveVersion !== 0) throw new TripError("STALE_RECOMMENDATION", "Recommendation does not match the current objective");
    if (result.status !== "RECOMMENDED") throw new TripError("NO_FEASIBLE_PLAN", "No available plan fits your current constraints");
    const simulated = handoff.simulatedPlanIds.includes(result.recommendation.selectedPlanId);
    const database = result.engine === "databricks";
    return {
      ...result.recommendation,
      reasonCodes: [...new Set([...result.recommendation.reasonCodes, database ? "DATABRICKS_EVALUATION" : "LOCAL_POLICY_FALLBACK", ...(simulated ? ["SIMULATED_TRANSPORT"] : [])])],
      explanation: `${result.recommendation.explanation} ${database ? "Evaluated by Databricks." : "Advanced campus context temporarily unavailable; local policy used."} ${simulated ? "Transportation data is simulated." : "Transportation data source is unverified."}`,
    };
  };
}
