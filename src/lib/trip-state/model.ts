import type { Trip, TripState } from "../../types/trip";
import type { Point, ProviderDescriptor } from "../../agents/contract";
import type { VerifiedIdentity } from "../../integrations/ans/directory";
import type { WeatherEvidence } from "../campus-evidence/evidence";
import type { PlanSignals } from "../decision-client/decision";
import type { PublicCorridor, TripOptionEvidence } from "../decision-client/trip-options";
import type { TripDecisionEvidence } from "../../agents/student/databricks";
import type { NetworkOffer } from "../../agents/provider-manifest";
import type { ProviderOutcome } from "../decision-client/provider-outcomes";
import type { SimulatedPayment } from "../payments/simulated";
import type { ArrivalEvidence, JourneySnapshot, RideObservation } from '../journey/contracts';
import type { JourneyResult } from '../decision-client/journey-types';

export type NetworkAttempt = {
  requestId: string; providerId: string; quoteId: string; observationId: string;
  amountMinor: number; cancellationFeeMinor: number; payment: SimulatedPayment;
  requestedAt: string; acceptedAt?: string; finalizedAt?: string; outcome?: "completed" | "canceled" | "declined";
};

export type TripContext = { maxBudget: number; minimizeWalking: boolean; minimizeTransfers: boolean; cannotWalk?: boolean; maxWalkingMinutes?: number; hasBeenDrinking?: boolean; exhausted?: boolean; currentTime: string };
export type Contact = { name: string; telegramChatId: string; consent: boolean; shareLocation: boolean };
export type TripRecord = {
  demoScenarioVariant?: 'baseline' | 'lighting_outage' | 'incident_pressure' | 'rain';
  journeyContract?: 'beacon-journey-v1'; journey?: JourneySnapshot; journeyRevision?: number; journeyConfirmedRevision?: number;
  completeJourney?: JourneyResult; completeJourneyOrigin?: Point; journeyLegIndex?: number; journeyLegStartedAt?: number; journeyLocationAccuracy?: number;
  excludedJourneyServices?: { operatorId: string; serviceId: string }[];
  rideObservation?: RideObservation; arrivalEvidence?: ArrivalEvidence; arrivalStatus?: string;
  trip: Trip; owner: string; context: TripContext;
  private?: { origin: Point; home: Point; contact?: Contact };
  originZone: string; destinationZone: string; providers: ProviderDescriptor[];
  excluded: string[]; confirmed: boolean; quoteDeadline: number;
  quoteExpirations?: Record<string, number>;
  simulatedPlanIds?: string[];
  networkOffers?: Record<string, NetworkOffer>;
  networkConsent?: { id: string; planId: string; quoteId: string; termsHash: string };
  networkAttempts?: NetworkAttempt[];
  outcomeOutbox?: { payload: ProviderOutcome; sent: boolean; attempts: number; retryAt: number }[];
  networkAction?: "payment_declined" | "check_booking";
  weatherEvidence?: WeatherEvidence;
  weatherPlanIds?: string[];
  corridorId?: PublicCorridor;
  planSignals?: Record<string, PlanSignals>;
  optionEvidence?: TripOptionEvidence;
  decisionEvidence?: TripDecisionEvidence;
  identity?: VerifiedIdentity; booking?: { providerId: string; id: string; requestId?: string };
  pendingBooking?: { providerId: string; requestId: string; attempts?: number; retryAt?: number };
  pendingReplacement?: { attempts: number; retryAt: number };
  cleanup?: ({ provider: ProviderDescriptor; identity?: VerifiedIdentity; attempts: number; retryAt: number; attemptId?: string } & ({ bookingId: string; requestId?: never } | { requestId: string; bookingId?: never }))[];
  replanCount: number; lastStatusBeforeOverdue?: TripState;
  notification?: { state: "sending" | "sent" | "simulated" | "failed" | "uncertain"; id?: string };
  events: { at: string; state: TripState; code: string; message: string }[];
};
export class TripError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
}
export function transition(record: TripRecord, state: TripState, code: string, message: string, now: number) {
  record.trip.state = state; record.trip.statusMessage = message;
  record.events.push({ at: new Date(now).toISOString(), state, code, message });
  record.events = record.events.slice(-100);
}
export function owns(record: TripRecord, owner: string) { if (record.owner !== owner) throw new TripError("TRIP_NOT_FOUND", "Trip not found", 404); }
export function requireState(record: TripRecord, states: TripState[]) {
  if (!states.includes(record.trip.state)) throw new TripError("INVALID_STATE", `Operation unavailable while trip is ${record.trip.state}`);
}
