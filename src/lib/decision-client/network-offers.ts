import { createHash } from 'node:crypto';
import type { CandidatePlan } from '../../types/provider';
import type { FullTransitSource } from '../../integrations/databricks/full-transit-query';
import { prepareDecision, type DecisionContext, type DecisionResult, type PlanSignals } from './decision';

/** Data-side adapter input, NOT a provider wire protocol or authorization grant.
 * Mahin maps authenticated/admitted offers here on the server. No raw credentials,
 * precise locations or passenger fields belong in this contract. */
export type NetworkOffer = {
  operatorId: string; serviceId: string; quoteId: string; offerVersion: string;
  displayName: string; mode: CandidatePlan['mode']; source: PlanSignals['source'];
  available: boolean; issuedAt: string; expiresAt: string;
  admission: { serviceAreaMatch: boolean; authSupported: boolean; paymentSupported: boolean };
  price: { currency: string; kind: 'fixed' | 'capped' | 'estimate'; totalMinor: number | null; maximumMinor?: number; includesAllFees: boolean };
  waitMinutes: number; travelMinutes: number; walkingMinutes: number; transfers?: number;
};
export type NetworkRecovery = {
  /** Mahin supplies deduplicated charges + outstanding authorizations + fees.
   * Pending refunds do not restore this budget. Never sum the same liability twice. */
  committedMinor?: number;
  excludedServices?: { operatorId: string; serviceId: string }[];
};
export type OfferBinding = { operatorId: string; serviceId: string; quoteId: string; offerVersion: string;
  expiresAt: string; maximumCostMinor: number; priceKind: NetworkOffer['price']['kind']; source: PlanSignals['source'] };
export type NetworkAdmission = { rejected: Record<string, string[]>; warnings: string[] };
/** Trusted server-side results from the public map/timetable adapters, not browser JSON. */
export type PublicNetworkOption = { candidate: CandidatePlan; signals: PlanSignals; source?: FullTransitSource; statementId?: string; warnings?: string[] };
type Evaluate = (plans: CandidatePlan[], context: DecisionContext, signals: Record<string, PlanSignals>, admission: NetworkAdmission) => Promise<DecisionResult>;
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const money = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000000;
const instant = (v: unknown) => typeof v === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;

export function prepareNetworkOffers(offers: readonly NetworkOffer[], input: DecisionContext, recovery: NetworkRecovery = {}) {
  // Reuse existing context/limits validation. Never weaken the frozen legacy policy.
  const normalized = prepareDecision([], input).context;
  const now = Date.parse(normalized.evaluatedAt), committed = recovery.committedMinor ?? 0;
  if (!money(committed)) throw new Error('Invalid outstanding trip cost');
  if (!Array.isArray(offers) || offers.length > 16) throw new Error('At most 16 network offers are supported');
  if (recovery.excludedServices && (!Array.isArray(recovery.excludedServices) || recovery.excludedServices.length > 16 || !recovery.excludedServices.every(s => s && id(s.operatorId) && id(s.serviceId)))) throw new Error('Invalid service exclusions');
  const context = { ...normalized, maxBudget: Math.max(0, Math.round(input.maxBudget * 100) - committed) / 100 };
  const candidates: CandidatePlan[] = [], signals: Record<string, PlanSignals> = Object.create(null);
  const bindings: Record<string, OfferBinding> = Object.create(null), rejectedOffers: Record<string, string[]> = Object.create(null);
  const seen = new Set<string>(), warnings = ['ROUTE_LIGHTING_AND_PICKUP_COVERAGE_MAY_BE_UNKNOWN'];
  for (const o of offers) {
    if (!o || ![o.operatorId, o.serviceId, o.quoteId, o.offerVersion].every(id)) throw new Error('Invalid network offer identity');
    const identity = JSON.stringify([o.operatorId, o.serviceId, o.quoteId, o.offerVersion]);
    if (seen.has(identity)) throw new Error('Duplicate network offer identity');
    seen.add(identity);
    const planId = `network:${createHash('sha256').update(identity).digest('hex').slice(0, 40)}`;
    const reasons: string[] = [];
    if (!o.admission || o.admission.serviceAreaMatch !== true || o.admission.authSupported !== true || o.admission.paymentSupported !== true) reasons.push('INCOMPATIBLE_SERVICE');
    if (recovery.excludedServices?.some(s => s.operatorId === o.operatorId && s.serviceId === o.serviceId)) reasons.push('SERVICE_EXCLUDED');
    if (o.available !== true) reasons.push('UNAVAILABLE');
    if (!['simulated', 'live', 'scheduled', 'mapped'].includes(o.source)) reasons.push('UNKNOWN_SOURCE');
    if (o.source === 'scheduled' && o.mode !== 'transit') reasons.push('INVALID_SCHEDULED_MODE');
    const issued = instant(o.issuedAt), expires = instant(o.expiresAt);
    const deadline = Math.min(expires, o.source === 'live' || o.source === 'simulated' ? issued + 120000 : Infinity);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= issued || deadline <= now) reasons.push('OFFER_EXPIRED_OR_INVALID');
    const price = o.price;
    let maximum: number | null = null;
    if (!price || price.currency !== 'USD' || price.includesAllFees !== true) reasons.push('UNSUPPORTED_OR_INCOMPLETE_PRICE');
    else if (price.kind === 'fixed' && money(price.totalMinor)) maximum = price.totalMinor;
    else if (price.kind === 'capped' && money(price.maximumMinor) && (price.totalMinor === null || money(price.totalMinor) && price.totalMinor <= price.maximumMinor)) maximum = price.maximumMinor;
    else reasons.push('UNBOUNDED_OR_INVALID_PRICE');
    if (typeof o.displayName !== 'string' || !o.displayName.trim() || o.displayName.length > 120) reasons.push('INVALID_DISPLAY_NAME');
    if (reasons.length) { rejectedOffers[planId] = reasons; continue; }
    const candidate: CandidatePlan = {
      planId, providerId: o.mode === 'walk' ? null : o.operatorId, providerName: o.displayName,
      mode: o.mode, available: true, cost: maximum! / 100,
      waitMinutes: o.waitMinutes, travelMinutes: o.travelMinutes, walkingMinutes: o.walkingMinutes,
      totalMinutes: o.waitMinutes + o.travelMinutes + o.walkingMinutes,
      ...(o.transfers === undefined ? {} : { transfers: o.transfers }),
      requiresProviderVerification: o.mode !== 'walk',
    };
    const evidence: PlanSignals = { source: o.source, collectedAt: new Date(issued).toISOString(), validUntil: new Date(deadline).toISOString(),
      dataVersion: `offer:${createHash('sha256').update(identity).digest('hex')}`, serviceAvailable: true,
      transfersKnown: o.transfers !== undefined, lighting: 'unknown' };
    // Mapped provider offers without source-bound geometry cannot masquerade as actual maps.
    if (o.source === 'mapped') { rejectedOffers[planId] = ['USE_MAPPED_ROUTE_ADAPTER']; continue; }
    const checked = prepareDecision([candidate], context, { [planId]: evidence });
    const rejected = checked.rejected[planId] ?? checked.plans[0]?.baseRejections ?? [];
    if (rejected.length) { rejectedOffers[planId] = rejected; continue; }
    candidates.push(candidate); signals[planId] = evidence;
    bindings[planId] = { operatorId: o.operatorId, serviceId: o.serviceId, quoteId: o.quoteId, offerVersion: o.offerVersion,
      expiresAt: evidence.validUntil!, maximumCostMinor: maximum!, priceKind: price.kind, source: o.source };
    if (price.kind === 'capped') warnings.push('CAPPED_OFFER_RANKED_AT_MAXIMUM_COST');
  }
  return { candidates, signals, bindings, rejectedOffers, context, committedMinor: committed, warnings: [...new Set(warnings)] };
}

/** The returned binding is SERVER-ONLY. Caller must recheck identity, current quote,
 * consent and expiry immediately before booking. This function issues no grant. */
export async function evaluateNetworkOffers(offers: readonly NetworkOffer[], context: DecisionContext, recovery: NetworkRecovery, evaluate: Evaluate, publicOptions: readonly PublicNetworkOption[] = []) {
  const prepared = prepareNetworkOffers(offers, context, recovery);
  if (!Array.isArray(publicOptions) || publicOptions.length + offers.length > 16) throw new Error('Invalid public option count');
  const publicIds = new Set<string>();
  for (const option of publicOptions) {
    const { candidate, signals } = option;
    if (candidate.planId.startsWith('network:') || publicIds.has(candidate.planId)
      || !(candidate.mode === 'walk' && signals.source === 'mapped' || candidate.mode === 'transit' && signals.source === 'scheduled')) throw new Error('Invalid public option identity or source');
    prepareDecision([candidate], prepared.context, { [candidate.planId]: signals });
    publicIds.add(candidate.planId);
    prepared.candidates.push(candidate); prepared.signals[candidate.planId] = signals;
  }
  const decision = await evaluate(prepared.candidates, prepared.context, prepared.signals, { rejected: prepared.rejectedOffers, warnings: prepared.warnings });
  const selectedOffer = decision.status === 'RECOMMENDED' ? prepared.bindings[decision.recommendation.selectedPlanId] : undefined;
  if (decision.status === 'RECOMMENDED' && !selectedOffer && !publicIds.has(decision.recommendation.selectedPlanId)) throw new Error('Decision selected an unmapped network offer');
  decision.rejected = { ...prepared.rejectedOffers, ...decision.rejected };
  decision.warnings = [...new Set([...decision.warnings, ...prepared.warnings])];
  const publicOptionEvidence = publicOptions.map(option => ({
    planId: option.candidate.planId, sourceKind: option.signals.source,
    walkingSource: option.candidate.mode === 'walk' ? 'mapped' : option.source?.walkingSource ?? 'unknown',
    source: option.source ?? null, statementId: option.statementId ?? null,
    warnings: [...(option.warnings ?? []), ...(option.candidate.mode === 'transit' && !option.source
      ? ['Stop-access provenance is unknown; walking times are not verified routes.'] : [])],
  }));
  return { decision, selectedOffer: selectedOffer ?? null, remainingBudgetMinor: Math.round(prepared.context.maxBudget * 100),
    committedMinor: prepared.committedMinor, publicOptionEvidence };
}
