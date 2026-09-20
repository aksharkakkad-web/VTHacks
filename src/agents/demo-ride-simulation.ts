import { simulatedCancellation } from '../lib/payments/simulated';
import { TripError } from '../lib/trip-state/model';
import { object, number, text, type ProviderDescriptor, type ProviderTrip } from './contract';
import type { DemoBooking } from './demo-provider';

export type DemoRideStage = 'assigned' | 'approaching' | 'arrived' | 'in_trip' | 'completed' | 'cancelled';
export type DemoRideEvent = { tripId: string; stage: DemoRideStage; pickupEtaSeconds?: number };
const stages: DemoRideStage[] = ['assigned', 'approaching', 'arrived', 'in_trip', 'completed', 'cancelled'];
const instructions = 'Beacon simulation only: no vehicle will arrive. Pickup ETA is a simulated elapsed-time countdown; ride status advances with operator controls. Zero seconds does not confirm arrival. No live vehicle location is available.';

export function parseDemoRideEvent(value: unknown): DemoRideEvent {
  const event = object(value);
  if (Object.keys(event).some(key => !['trip_id', 'stage', 'pickup_eta_seconds'].includes(key)) || !stages.includes(event.stage as DemoRideStage)) throw new TripError('INVALID_DEMO_EVENT', 'Use a supported demo stage', 400);
  const stage = event.stage as DemoRideStage;
  const eta = event.pickup_eta_seconds === undefined ? undefined : number(event.pickup_eta_seconds, 'pickup ETA', 86400);
  if (eta !== undefined && (stage !== 'approaching' || !Number.isSafeInteger(eta) || eta <= 0)) throw new TripError('INVALID_DEMO_EVENT', 'Only approaching accepts a positive whole-second pickup ETA', 400);
  return { tripId: text(event.trip_id, 'trip id'), stage, ...(eta === undefined ? {} : { pickupEtaSeconds: eta }) };
}
function eventTime(booking: DemoBooking, now: number): string {
  const previous = Date.parse(booking.result.details?.updatedAt ?? '');
  return new Date(Math.max(now + 1, Number.isFinite(previous) ? previous + 1 : now)).toISOString();
}
export function initializeDemoRide(booking: DemoBooking, mode: ProviderDescriptor['mode'], pickupEtaSeconds: number, now: number): void {
  if (booking.result.status !== 'waiting' || mode === 'transit') return;
  booking.result.details = {
    stage: 'assigned', pickupEtaSeconds, meetingInstructions: instructions, updatedAt: eventTime(booking, now),
    driver: { displayName: 'Demo Driver' },
    vehicle: { make: 'Beacon Demo', model: mode === 'campus_ride' ? 'Shuttle' : 'Sedan', color: 'Blue', licensePlate: 'DEMO-01' },
  };
  booking.demoRide = { etaUpdatedAt: now };
}
/** Project elapsed seconds without rewriting the event baseline or advancing stage. */
export function demoRideResult(booking: DemoBooking, now: number): ProviderTrip {
  const result = structuredClone(booking.result), details = result.details;
  if (!booking.demoRide || !details || !['assigned', 'approaching'].includes(details.stage ?? '') || details.pickupEtaSeconds === undefined) return result;
  const elapsed = Math.max(0, Math.floor((now - booking.demoRide.etaUpdatedAt) / 1000));
  if (elapsed > 0) {
    details.pickupEtaSeconds = Math.max(0, details.pickupEtaSeconds - elapsed);
    details.updatedAt = new Date(Math.max(now, Date.parse(details.updatedAt!))).toISOString();
  }
  return result;
}
/** Erase precise data while retaining any existing terminal settlement. */
export function cancelDemoBooking(booking: DemoBooking, now = Date.now()): void {
  delete booking.sensitive;
  if (['cancelled', 'completed', 'declined'].includes(booking.result.status)) return;
  booking.result.status = 'cancelled';
  if (booking.result.payment) booking.result.payment = simulatedCancellation(booking.result.payment, booking.cancellationFeeMinor ?? 0);
  if (booking.result.details) {
    booking.result.details.updatedAt = eventTime(booking, now);
    booking.result.details.stage = 'cancelled'; delete booking.result.details.pickupEtaSeconds;
  }
}
/** Authenticated operator events are the sole progression clock for this demo. */
export function advanceDemoRide(booking: DemoBooking, event: DemoRideEvent, now: number): void {
  const previous = booking.result.details?.stage;
  if (booking.result.id !== event.tripId) throw new TripError('INVALID_DEMO_EVENT', 'Demo event does not match booking', 400);
  const etaChanged = previous === 'approaching' && event.stage === 'approaching' && event.pickupEtaSeconds !== undefined && event.pickupEtaSeconds !== booking.result.details?.pickupEtaSeconds;
  if (previous === event.stage && !etaChanged) return;
  if (['completed', 'cancelled', 'declined'].includes(booking.result.status)) throw new TripError('DEMO_RIDE_TERMINAL', 'Terminal demo rides cannot advance', 409);
  if (!previous || !stages.includes(previous as DemoRideStage)) throw new TripError('DEMO_RIDE_UNAVAILABLE', 'Booking was not created with demo progression enabled', 409);
  if (event.stage === 'cancelled') { cancelDemoBooking(booking, now); return; }
  if (!etaChanged && stages.indexOf(event.stage) !== stages.indexOf(previous as DemoRideStage) + 1) throw new TripError('INVALID_DEMO_TRANSITION', 'Advance one demo stage at a time', 409);
  const details = booking.result.details!;
  const remainingEta = demoRideResult(booking, now).details?.pickupEtaSeconds;
  booking.demoRide = { etaUpdatedAt: now };
  details.updatedAt = eventTime(booking, now); details.stage = event.stage;
  if (event.stage === 'approaching') details.pickupEtaSeconds = event.pickupEtaSeconds ?? remainingEta;
  if (event.stage === 'arrived') details.pickupEtaSeconds = 0;
  if (event.stage === 'in_trip' || event.stage === 'completed') {
    booking.result.status = event.stage; delete details.pickupEtaSeconds;
  }
  if (event.stage === 'completed') {
    delete booking.sensitive;
    if (booking.result.payment?.state === 'authorized') booking.result.payment = { ...booking.result.payment, state: 'captured', retainedMinor: booking.result.payment.amountMinor };
  }
}
