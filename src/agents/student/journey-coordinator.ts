import type { CandidatePlan } from '../../types/provider';
import type { NetworkOffer } from '../provider-manifest';
import type { Journey, JourneyRequest, JourneyResult, JourneyRide } from '../../lib/decision-client/journey-types';
import type { Point } from '../contract';
import { paymentLiability } from '../../lib/payments/simulated';
import { TripError, type TripRecord } from '../../lib/trip-state/model';
import { remainingBudgetMinor } from './coordination';
import { digest } from '../../lib/planner/validation';

/** An authoritative local/provider sidecar, never a browser assertion. Receives
 * only admitted coarse quotes; no student coordinates, contact or credentials. */
export type JourneyRideBinding = Omit<JourneyRide, 'offer'>;
export type JourneyCoordinatorDependencies = {
  getCompleteJourney?: (request: JourneyRequest) => Promise<JourneyResult>;
  journeyRideBinding?: (network: NetworkOffer) => Promise<JourneyRideBinding | null>;
};

export function journeyOrigin(r: TripRecord, now: number): Point | undefined {
  const latest = r.trip.lastKnownLocation;
  return latest && Date.parse(latest.recordedAt) >= now - 120000
    ? { lat: latest.lat, lng: latest.lng } : r.private?.origin;
}

export async function evaluateCompleteJourney(r: TripRecord, deps: JourneyCoordinatorDependencies, now: number) {
  const origin = journeyOrigin(r, now);
  if (!origin || !r.private || !deps.getCompleteJourney) throw new TripError('JOURNEY_UNAVAILABLE', 'Complete journey planning is unavailable', 503);
  const rides: JourneyRide[] = [];
  let unboundOffers = 0;
  for (const network of Object.values(r.networkOffers ?? {}).slice(0, 8)) {
    if (r.excluded.includes(network.offer.providerId)) continue;
    if (!deps.journeyRideBinding) { unboundOffers++; continue; }
    let binding: JourneyRideBinding | null;
    try { binding = await deps.journeyRideBinding(structuredClone(network)); } catch { unboundOffers++; continue; }
    if (!binding) { unboundOffers++; continue; }
    const { manifest, offer } = network;
    // Compatibility was admitted during quote collection; pickup permission is
    // a separate assertion supplied explicitly by the authoritative sidecar.
    rides.push({ ...binding, offer: {
      operatorId: offer.providerId, serviceId: offer.serviceId, quoteId: offer.quoteId, offerVersion: offer.profileVersion,
      displayName: manifest.operatorName, mode: manifest.mode, source: 'simulated', available: offer.available,
      issuedAt: offer.issuedAt, expiresAt: offer.expiresAt,
      admission: { serviceAreaMatch: manifest.serviceArea.originZones.includes(r.originZone) && manifest.serviceArea.destinationZones.includes(r.destinationZone),
        authSupported: manifest.authorization === 'beacon-hmac-v1', paymentSupported: manifest.payment === 'simulated-usd-v1' },
      price: { currency: offer.price.currency, kind: offer.price.kind, totalMinor: offer.price.totalMinor, includesAllFees: offer.price.feesIncluded },
      waitMinutes: offer.waitMinutes, travelMinutes: offer.travelMinutes, walkingMinutes: offer.walkingMinutes,
      ...(offer.transfers === undefined ? {} : { transfers: offer.transfers }),
    } });
  }
  const attempts = new Map((r.networkAttempts ?? []).map(a => [a.requestId, a]));
  const committedMinor = [...attempts.values()].reduce((sum, a) => sum + paymentLiability(a.payment), 0);
  const request: JourneyRequest = {
    objectiveVersion: r.replanCount, origin: { id: 'current-origin', name: 'Current location', point: origin },
    destination: { id: 'confirmed-home', name: 'Home', point: { ...r.private.home } }, evaluatedAt: new Date(now).toISOString(),
    budgetMinor: Math.floor(r.context.maxBudget * 100 + 1e-8), committedMinor, remainingBudgetMinor: remainingBudgetMinor(r),
    minimizeWalking: r.context.minimizeWalking || r.context.hasBeenDrinking === true, tired: r.context.exhausted === true,
    cannotWalk: r.context.cannotWalk, maxWalkingMinutes: r.context.maxWalkingMinutes,
    rides, excludedServices: r.excludedJourneyServices ?? [],
    ...(r.demoScenarioVariant ? { demoScenarioVariant: r.demoScenarioVariant } : {}),
  };
  const result = await deps.getCompleteJourney(request);
  if (unboundOffers) result.warnings = [...new Set([...result.warnings, 'PROVIDER_LOCATION_BINDINGS_UNAVAILABLE'])];
  if (result.journeyVersion !== 'beacon-journey-v1' || result.objectiveVersion !== r.replanCount
      || result.remainingBudgetMinor !== remainingBudgetMinor(r) || result.committedMinor !== committedMinor) {
    throw new TripError('INVALID_JOURNEY', 'Journey does not match the current objective and budget', 502);
  }
  const candidate = (journey: Journey): CandidatePlan => {
    const binding = journey.offerBinding;
    let original: CandidatePlan | undefined;
    if (journey.kind === 'ride') {
      const ride = rides.find(x => binding && x.offer.operatorId === binding.operatorId && x.offer.serviceId === binding.serviceId
        && x.offer.quoteId === binding.quoteId && x.offer.offerVersion === binding.offerVersion);
      const entry = Object.entries(r.networkOffers ?? {}).find(([, n]) => binding && n.offer.providerId === binding.operatorId
        && n.offer.serviceId === binding.serviceId && n.offer.quoteId === binding.quoteId && n.offer.profileVersion === binding.offerVersion);
      original = r.trip.candidates.find(p => p.planId === entry?.[0]);
      if (!ride || !original || ride.pickupPermitted !== true || binding?.maximumCostMinor !== ride.offer.price.totalMinor
          || journey.costMinor !== binding.maximumCostMinor || digest(journey.offerLocationBinding) !== digest({ pickup: ride.pickup, dropoff: ride.dropoff, pickupAt: ride.pickupAt, arrivalAt: ride.arrivalAt })) {
        throw new TripError('INVALID_JOURNEY_BINDING', 'Journey no longer matches the admitted provider quote', 502);
      }
    } else if (binding || journey.offerLocationBinding) throw new TripError('INVALID_JOURNEY_BINDING', 'Public journeys cannot carry booking authority', 502);
    if (!Number.isSafeInteger(journey.costMinor) || journey.costMinor < 0 || journey.costMinor > remainingBudgetMinor(r)
      || !Number.isFinite(journey.durationSeconds) || journey.durationSeconds < 0) throw new TripError('INVALID_JOURNEY', 'Journey violates the approved constraints', 502);
    return {
      planId: original?.planId ?? `journey:${journey.journeyId}`, providerId: original?.providerId ?? null,
      providerName: original?.providerName ?? (journey.kind === 'bus' ? 'Scheduled transit' : 'Walking'),
      mode: original?.mode ?? (journey.kind === 'bus' ? 'transit' : 'walk'), available: true,
      cost: journey.costMinor / 100, waitMinutes: journey.waitingSeconds / 60, walkingMinutes: journey.walkingSeconds / 60,
      travelMinutes: Math.max(0, journey.durationSeconds - journey.waitingSeconds - journey.walkingSeconds) / 60,
      totalMinutes: journey.durationSeconds / 60, ...(original?.transfers !== undefined ? { transfers: original.transfers } : journey.kind !== 'ride' ? { transfers: 0 } : {}),
      requiresProviderVerification: journey.kind === 'ride',
    };
  };
  const selected = result.selected ? candidate(result.selected) : null;
  const alternatives = result.alternatives.map(candidate);
  r.completeJourney = structuredClone(result);
  r.completeJourneyOrigin = { ...origin };
  r.journeyLegIndex = 0;
  r.journeyLegStartedAt = now;
  return { result, selected, candidates: selected ? [selected, ...alternatives.filter(p => p.planId !== selected.planId)] : [] };
}
