import type { CandidatePlan } from "../../types/provider";
import type { PlanSignals } from "../decision-client/decision";
import { routeConditions } from "./catalog";
import { isCurrentWeather } from "./evidence";

/** Attach route facts only when the candidate cites this exact mapped path version. */
export function applyPublicRouteEvidence(plans: CandidatePlan[], input: Record<string, PlanSignals>, now: number, read = routeConditions) {
  const signals = { ...input };
  for (const plan of plans) {
    const facts = signals[plan.planId];
    if (plan.mode !== "walk" || facts?.source !== "mapped" || !facts.corridorId || !facts.validUntil || !Number.isFinite(Date.parse(facts.validUntil))) continue;
    try {
      const evidence = read(facts.corridorId, now);
      if (evidence.geometryStatus !== "supported" || evidence.route?.source_version !== facts.dataVersion) continue;
      const weather = evidence.weather, closure = evidence.closures;
      let deadline = Date.parse(facts.validUntil);
      const additions: Partial<PlanSignals> = {};
      if (isCurrentWeather(weather, now)) {
        additions.weather = weather.condition;
        if (weather.activeOfficialAlert) additions.activeOfficialAlert = true;
        deadline = Math.min(deadline, Date.parse(weather.validUntil));
      }
      if (closure.blocked === true && closure.validUntil) {
        additions.walkingPathClosed = true;
        deadline = Math.min(deadline, Date.parse(closure.validUntil));
      }
      signals[plan.planId] = { ...facts, ...additions, validUntil: new Date(deadline).toISOString() };
    } catch { /* Existing evidence remains intact; no fabricated source or all-clear. */ }
  }
  return signals;
}
