import type { ProviderDescriptor } from '../../agents/contract';
import type { NetworkOffer } from '../../agents/provider-manifest';
import type { JourneyRideBinding } from '../../agents/student/journey-coordinator';

/** Fixed public demo points, never inferred curb permission or passenger GPS. */
export function syntheticJourneyBinding(env: Record<string, string | undefined>, owned: readonly ProviderDescriptor[]) {
  return async (network: NetworkOffer): Promise<JourneyRideBinding | null> => {
    if (env.DEMO_MODE !== 'true' || env.BEACON_SYNTHETIC_JOURNEY_BINDINGS !== 'true') return null;
    const { offer, manifest } = network;
    if (!offer.simulated || manifest.executionMode !== 'simulated' || manifest.mode === 'transit'
      || !owned.some(p => p.source === 'demo' && p.id === offer.providerId && p.baseUrl === manifest.endpoint)) return null;
    const pickup = Date.parse(offer.issuedAt) + offer.waitMinutes * 60_000;
    if (!Number.isFinite(pickup)) return null;
    return {
      pickup: { id: 'synthetic-campus-pickup', name: 'Campus pickup (simulated access)', point: { lat: 37.229, lng: -80.414 } },
      dropoff: { id: 'synthetic-home-dropoff', name: 'Home drop-off (simulated access)', point: { lat: 37.221, lng: -80.420 } },
      pickupAt: new Date(pickup).toISOString(), arrivalAt: new Date(pickup + offer.travelMinutes * 60_000).toISOString(),
      pickupPermitted: true,
    };
  };
}
