import type { JourneySnapshot } from './contracts';

/** External maps chooses its own path; the target is the current walking leg only. */
export function navigationHandoff(journey: JourneySnapshot) {
  const step = journey.nextStep;
  const leg = journey.complete?.selected?.legs.find(l => l.id === step?.legId);
  if (!step?.showMap || leg?.kind !== 'walk') return null;
  const target = `${leg.to.point.lat},${leg.to.point.lng}`;
  return {
    destination: leg.to.name,
    googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}&travelmode=walking`,
    appleMapsUrl: `https://maps.apple.com/?daddr=${encodeURIComponent(target)}&dirflg=w`,
    pathRelationship: 'external_app_selects_path' as const,
  };
}
