import type { JourneySnapshot } from './contracts';

/** External maps chooses its own path between the current walking leg's exact endpoints. */
export function navigationHandoff(journey: JourneySnapshot) {
  const step = journey.nextStep;
  const leg = journey.complete?.selected?.legs.find(l => l.id === step?.legId);
  if (!step?.showMap || leg?.kind !== 'walk') return null;
  const origin = `${leg.from.point.lat},${leg.from.point.lng}`;
  const target = `${leg.to.point.lat},${leg.to.point.lng}`;
  return {
    destination: leg.to.name,
    googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(target)}&travelmode=walking`,
    appleMapsUrl: `https://maps.apple.com/?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(target)}&dirflg=w`,
    pathRelationship: 'external_app_selects_path' as const,
  };
}
