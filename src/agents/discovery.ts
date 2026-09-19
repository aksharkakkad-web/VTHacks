import type { CandidatePlan } from "../types/provider";
import type { ProviderAgent, QuoteRequest } from "./contract";

export async function collectCandidates(providers: Pick<ProviderAgent, "descriptor" | "quote">[], request: QuoteRequest, excluded: Set<string>, walkingMinutes = 22, now = Date.now()) {
  const eligible = providers.filter((p) => !excluded.has(p.descriptor.id)).sort((a, b) => a.descriptor.id < b.descriptor.id ? -1 : a.descriptor.id > b.descriptor.id ? 1 : 0);
  // The shared evaluator supports 16 plans. Reserve one for the walking option.
  const active = eligible.slice(0, 15);
  const results = await Promise.allSettled(active.map((p) => p.quote(request)));
  const candidates: CandidatePlan[] = []; const failures: string[] = []; const quoteExpirations: Record<string, number> = {}; const simulatedPlanIds: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.available && result.value.cost <= request.maxBudget && (result.value.quoteExpiresAt ?? now + 120_000) > now) {
      const { quoteExpiresAt, quoteSource, ...candidate } = result.value;
      candidates.push(candidate);
      if (quoteSource === "simulated") simulatedPlanIds.push(candidate.planId);
      quoteExpirations[candidate.planId] = Math.min(now + 120_000, quoteExpiresAt ?? Infinity);
    }
    else failures.push(active[index].descriptor.id);
  });
  candidates.push({ planId: `walk-${Date.now()}`, providerId: null, providerName: "Walk", mode: "walk", available: true, cost: 0, waitMinutes: 0, travelMinutes: 0, walkingMinutes, totalMinutes: walkingMinutes, transfers: 0, requiresProviderVerification: false });
  // This fixed walking duration is a fixture, not a routing measurement.
  simulatedPlanIds.push(candidates[candidates.length - 1].planId);
  return { candidates, failures, quoteExpirations, simulatedPlanIds, omittedProviderCount: eligible.length - active.length };
}
