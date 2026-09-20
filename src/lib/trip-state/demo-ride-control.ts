import { parseProviderTrip, type ProviderDescriptor } from '../../agents/contract';
import { TripError } from './model';

/** Operator playback is restricted to our own explicitly configured simulator. */
export function createDemoRideControl(env: Record<string, string | undefined>, owned: readonly ProviderDescriptor[], tokenFor: (p: ProviderDescriptor) => string | undefined) {
  if (env.DEMO_MODE !== 'true' || env.BEACON_DEMO_RIDE_PROGRESS !== 'true') return undefined;
  return async (provider: ProviderDescriptor, bookingId: string, stage: string, eta?: number) => {
    if (provider.source !== 'demo' || !owned.some(p => p.id === provider.id && p.baseUrl === provider.baseUrl)) throw new TripError('DEMO_DISABLED', 'This provider is not a Beacon simulator', 404);
    const token = tokenFor(provider);
    if (!token) throw new TripError('DEMO_DISABLED', 'Simulator authorization is missing', 503);
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/agent/demo-advance`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`},
      body: JSON.stringify({trip_id:bookingId, stage, ...(eta === undefined ? {} : {pickup_eta_seconds:eta})}),
    });
    if (!response.ok) throw new TripError('INVALID_DEMO_TRANSITION', 'Advance the demo ride in order', 409);
    const raw = await response.text();
    if (raw.length > 16384) throw new TripError('INVALID_PROVIDER_RESULT', 'Simulator response is invalid', 502);
    return parseProviderTrip(JSON.parse(raw));
  };
}
