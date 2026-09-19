import { digest } from '../planner/validation';
import type { TripRecord } from '../trip-state/model';
import { remainingBudgetMinor } from '../../agents/student/coordination';
import { journeyOrigin } from '../../agents/student/journey-coordinator';
import type { JourneyLeg, JourneySnapshot } from './contracts';

export function syncJourney(r: TripRecord, now: number): JourneySnapshot {
  const p = r.trip.selectedPlan, network = p ? r.networkOffers?.[p.planId] : undefined;
  const route = p?.mode === 'walk' ? r.optionEvidence?.walkingAlternative?.route : undefined;
  const selected = p && !['ARRIVED','FAILED','OBJECTIVE_RECEIVED','DISCOVERING','COLLECTING_QUOTES','PROVIDER_FAILED','REPLANNING'].includes(r.trip.state) ? p : undefined;
  const complete = selected || r.completeJourney?.status === 'NO_FEASIBLE_JOURNEY' ? r.completeJourney ?? null : null;
  const exact = complete?.selected;
  const deadline = selected ? Math.min(r.quoteDeadline, r.quoteExpirations?.[selected.planId] ?? Infinity) : 0;
  const beforeStart = selected && !r.booking && !r.pendingBooking && ['SELECTED','VERIFYING_PROVIDER','OVERDUE'].includes(r.trip.state);
  const binding = digest({ plan:selected ?? null, offer:selected ? network ?? null : null, route:selected ? route ?? null : null,
    complete, origin:beforeStart && exact ? journeyOrigin(r, now) : r.completeJourneyOrigin ?? null,
    replanCount:r.replanCount, remainingBudgetMinor:remainingBudgetMinor(r) });
  const step = exact?.legs[r.journeyLegIndex ?? 0];
  const nextStep = step ? { legId:step.id, instruction:step.instruction, showMap:step.kind === 'walk', routeId:step.route?.routeId ?? null } : null;
  if (r.journey?.binding === binding) {
    r.journey.expectedArrivalAt = r.trip.expectedArrivalAt ?? null;
    r.journey.alertDeadlineAt = r.trip.alertDeadlineAt ?? null;
    r.journey.nextStep = nextStep;
    return r.journey;
  }
  const revision = (r.journeyRevision ?? 0) + 1;
  r.journeyRevision = revision;
  const legs: JourneyLeg[] = [];
  if (selected && exact) {
    const transportIndex=exact.legs.findIndex(leg=>leg.kind==='ride'||leg.kind==='bus');
    for (const [index,leg] of exact.legs.entries()) legs.push({ id:leg.id, kind:leg.kind === 'bus' ? 'transit' : leg.kind,
      durationSeconds:(Date.parse(leg.endsAt)-Date.parse(leg.startsAt))/1000,
      geometry:leg.kind === 'walk' && leg.route ? {type:'LineString',coordinates:leg.route.geometry.coordinates.map(p=>[p[0],p[1]] as [number,number])} : null,
      directions:leg.route?.instructions.map(s => s.text) ?? [leg.instruction],
      source:leg.kind === 'walk' ? 'walking_router' : leg.kind === 'bus' ? 'transit_schedule' : leg.kind === 'ride' ? 'provider_quote' : 'planner',
      position:leg.kind === 'ride' || leg.kind === 'bus' ? 'provider_leg' : exact.kind === 'walk' ? 'whole_journey' : index>transportIndex ? 'dropoff' : 'pickup' });
  } else if (selected) {
    if (selected.mode === 'walk') legs.push({ id:'walk-home', kind:'walk', position:'whole_journey', durationSeconds:selected.totalMinutes*60,
      geometry:route?.status === 'supported' ? route.geometry ?? null : null, directions:[], source:route?.status === 'supported' ? 'mapped_snapshot' : 'unknown' });
    else {
      // A total walking estimate never establishes pickup/dropoff geometry.
      legs.push({ id:'walking-total', kind:'walk', position:'allocation_unknown', durationSeconds:selected.walkingMinutes*60, geometry:null, directions:[], source:'provider_quote' });
      legs.push({ id:'wait-pickup', kind:'wait', position:'pickup', durationSeconds:selected.waitMinutes*60, geometry:null, directions:[], source:'provider_quote' });
      legs.push({ id:'provider-leg', kind:selected.mode === 'transit' ? 'transit' : 'ride', position:'provider_leg', durationSeconds:selected.travelMinutes*60, geometry:null, directions:[], source:'provider_quote' });
    }
  }
  const firstWait = exact?.legs.find(leg => leg.kind === 'wait');
  r.journey = { schemaVersion:'beacon-journey-v1', revision, binding, createdAt:new Date(now).toISOString(), selectedPlanId:selected?.planId ?? null,
    selectedOffer:selected && network ? { providerId:network.offer.providerId, serviceId:network.offer.serviceId, quoteId:network.offer.quoteId,
      currency:'USD', totalMinor:network.offer.price.totalMinor, expiresAt:new Date(Math.min(deadline,Date.parse(network.offer.expiresAt))).toISOString(), simulated:network.offer.simulated } : null,
    legs, pickup:{ point:exact?.offerLocationBinding?.pickup.point ?? null, instructions:selected && network ? network.offer.pickup.instructions : null,
      accessVerified:selected && network ? network.offer.pickup.accessVerified : null },
    waiting:{ point:firstWait?.from.point ?? null, indoorAccessVerified:firstWait?.indoor === true && firstWait.waitingSource?.accessAllowed === true ? true : null },
    complete:complete ? structuredClone(complete) : null, nextStep,
    estimatedDurationSeconds:selected ? selected.totalMinutes*60 : null, expectedArrivalAt:r.trip.expectedArrivalAt ?? null,
    alertDeadlineAt:r.trip.alertDeadlineAt ?? null, remainingBudgetMinor:remainingBudgetMinor(r), currency:'USD',
    limitations:exact ? [...exact.unknowns, 'A walking route is not a vehicle route.'] : ['Current illumination and indoor access are unknown.', 'Provider walking totals do not establish pickup and dropoff geometry.', 'A walking route is not a vehicle route.'] };
  return r.journey;
}
