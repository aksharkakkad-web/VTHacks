import type { CandidatePlan } from "../types/provider";
import type { ProviderAgent, QuoteRequest } from "./contract";

export async function collectCandidates(providers: Pick<ProviderAgent, "descriptor" | "quote">[], request: QuoteRequest, excluded: Set<string>, walkingMinutes = 22, now = Date.now()) {
  const active = providers.filter((p) => !excluded.has(p.descriptor.id));
  const results = await Promise.allSettled(active.map((p) => p.quote(request)));
  const candidates: CandidatePlan[] = []; const failures: string[] = []; const quoteExpirations: Record<string, number> = {};
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.available && result.value.cost <= request.maxBudget && (result.value.quoteExpiresAt ?? now + 120_000) > now) {
      const { quoteExpiresAt, ...candidate } = result.value;
      candidates.push(candidate);
      quoteExpirations[candidate.planId] = Math.min(now + 120_000, quoteExpiresAt ?? Infinity);
    }
    else failures.push(active[index].descriptor.id);
  });
  candidates.push({ planId: `walk-${Date.now()}`, providerId: null, providerName: "Walk", mode: "walk", available: true, cost: 0, waitMinutes: 0, travelMinutes: 0, walkingMinutes, totalMinutes: walkingMinutes, transfers: 0, requiresProviderVerification: false });
  return { candidates, failures, quoteExpirations };
}
