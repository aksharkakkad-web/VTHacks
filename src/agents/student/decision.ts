import type { CandidatePlan } from "../../types/provider";
import type { Recommendation } from "../../types/recommendation";
import type { TripContext } from "../../lib/trip-state/model";

/** Temporary track-boundary mock until Akshar's adapter is available. No live data claim. */
export async function demoRecommendation(plans: CandidatePlan[], context: TripContext): Promise<Recommendation> {
  const ordered = plans.filter((p) => p.available && p.cost <= context.maxBudget).sort((a, b) => {
    const walkWeight = context.minimizeWalking || context.hasBeenDrinking || context.exhausted ? 10 : 1;
    return (a.walkingMinutes - b.walkingMinutes) * walkWeight + (a.cost - b.cost) * 2 + (a.totalMinutes - b.totalMinutes);
  });
  if (!ordered.length) throw new Error("No feasible plan");
  return { selectedPlanId: ordered[0].planId, runnerUpPlanId: ordered[1]?.planId, reasonCodes: ["DEMO_EVALUATION", "WITHIN_BUDGET"], explanation: `${ordered[0].providerName} fits your budget. Advanced context temporarily unavailable; local demo evaluation.`, evaluatedAt: new Date().toISOString() };
}
