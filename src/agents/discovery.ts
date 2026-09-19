import type { CandidatePlan } from "../types/provider";
import type { ProviderAgent, QuoteRequest } from "./contract";

export async function collectCandidates(providers: Pick<ProviderAgent, "descriptor" | "quote">[], request: QuoteRequest, excluded: Set<string>, walkingMinutes = 22) {
  const active = providers.filter((p) => !excluded.has(p.descriptor.id));
  const results = await Promise.allSettled(active.map((p) => p.quote(request)));
  const candidates: CandidatePlan[] = []; const failures: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.available && result.value.cost <= request.maxBudget) candidates.push(result.value);
    else failures.push(active[index].descriptor.id);
  });
  candidates.push({ planId: `walk-${Date.now()}`, providerId: null, providerName: "Walk", mode: "walk", available: true, cost: 0, waitMinutes: 0, travelMinutes: 0, walkingMinutes, totalMinutes: walkingMinutes, transfers: 0, requiresProviderVerification: false });
  return { candidates, failures };
}
