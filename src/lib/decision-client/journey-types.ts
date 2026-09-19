import type { FullTransitSource } from '../../integrations/databricks/full-transit-query';
import type { NetworkOffer, OfferBinding } from './network-offers';
import type { Point, WalkingRoute } from './walking-router';
import type { PathEvidence } from './path-evidence';

export type JourneyPlace = { id: string; name: string; point: Point };
export type WaitingPlace = JourneyPlace & {
  indoor: boolean | null; sheltered: boolean | null; accessAllowed: boolean | null;
  opensAt: string; closesAt: string; capturedAt: string; validUntil: string;
  sourceUrl: string; sourceVersion: string;
};
/** Mahin supplies an admitted, location-bound quote on the server after the appropriate location gate. */
export type JourneyRide = {
  offer: NetworkOffer; pickup: JourneyPlace; dropoff: JourneyPlace;
  pickupAt: string; arrivalAt: string; pickupPermitted: boolean | null;
};
export type JourneyRequest = {
  objectiveVersion: number; origin: JourneyPlace; destination: JourneyPlace; evaluatedAt: string;
  budgetMinor: number;
  /** Remaining available funds can further cap budget minus outstanding liabilities. Never subtract twice. */
  remainingBudgetMinor?: number; committedMinor?: number;
  cannotWalk?: boolean; maxWalkingMinutes?: number; minimizeWalking?: boolean; tired?: boolean;
  currentWaitingPlace?: WaitingPlace; waitingPlaces?: WaitingPlace[];
  rides?: JourneyRide[]; excludedServices?: { operatorId: string; serviceId: string }[];
};
export type JourneyLeg = {
  id: string; kind: 'walk' | 'wait' | 'ride' | 'bus'; from: JourneyPlace; to: JourneyPlace;
  startsAt: string; endsAt: string; instruction: string;
  route: WalkingRoute | null; evidence: PathEvidence | null;
  source: string; transitSource?: FullTransitSource & {sourceUrl:string;statementId:string};
  locationEvidence?: {pickup:PathEvidence;dropoff:PathEvidence};
  indoor: boolean | null; sheltered: boolean | null;
  waitingSource?: { sourceUrl: string; sourceVersion: string; capturedAt: string; validUntil: string; accessAllowed: boolean | null };
};
export type Journey = {
  journeyId: string; kind: 'walk' | 'bus' | 'ride'; legs: JourneyLeg[];
  departureAt: string; arrivalAt: string; validUntil: string; leaveWaitingAt: string | null;
  costMinor: number; walkingSeconds: number; waitingSeconds: number; outdoorWaitingSeconds: number;
  unknownWaitingSeconds: number; durationSeconds: number; scoreUnits: number;
  offerBinding: OfferBinding | null;
  /** Exact quote locations/times are bound locally; no booking authority or credentials. */
  offerLocationBinding: { pickup: JourneyPlace; dropoff: JourneyPlace; pickupAt: string; arrivalAt: string } | null;
  nextStep: { legId: string; instruction: string; showMap: boolean; routeId: string | null };
  explanationFacts: string[]; unknowns: string[];
};
export type JourneyResult = {
  journeyVersion: 'beacon-journey-v1'; policyVersion: 'beacon-journey-rank-v1'; objectiveVersion: number;
  evaluatedAt: string; status: 'RECOMMENDED' | 'NO_FEASIBLE_JOURNEY';
  selected: Journey | null; alternatives: Journey[];
  remainingBudgetMinor: number; committedMinor: number;
  rejected: { candidateId: string; reasons: string[] }[]; warnings: string[];
  execution: { engine: 'databricks' | 'local_fallback'; statementId?: string; fallbackReason?: string; auditPersisted: boolean; auditStatus: string };
};
