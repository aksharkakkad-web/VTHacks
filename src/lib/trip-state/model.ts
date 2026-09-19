import type { Trip, TripState } from "../../types/trip";
import type { Point, ProviderDescriptor } from "../../agents/contract";
import type { VerifiedIdentity } from "../../integrations/ans/directory";

export type TripContext = { maxBudget: number; minimizeWalking: boolean; minimizeTransfers: boolean; hasBeenDrinking?: boolean; exhausted?: boolean; currentTime: string };
export type Contact = { name: string; phone: string; consent: boolean; shareLocation: boolean };
export type TripRecord = {
  trip: Trip; owner: string; context: TripContext;
  private?: { origin: Point; home: Point; contact?: Contact };
  originZone: string; destinationZone: string; providers: ProviderDescriptor[];
  excluded: string[]; confirmed: boolean; quoteDeadline: number;
  quoteExpirations?: Record<string, number>;
  simulatedPlanIds?: string[];
  identity?: VerifiedIdentity; booking?: { providerId: string; id: string };
  pendingBooking?: { providerId: string; requestId: string; attempts?: number; retryAt?: number };
  pendingReplacement?: { attempts: number; retryAt: number };
  cleanup?: ({ provider: ProviderDescriptor; identity?: VerifiedIdentity; attempts: number; retryAt: number } & ({ bookingId: string; requestId?: never } | { requestId: string; bookingId?: never }))[];
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
