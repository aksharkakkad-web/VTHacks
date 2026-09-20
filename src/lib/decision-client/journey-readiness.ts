import { planIndoorWait, summarizeLighting, type SourceWindow } from './journey-evidence';

type LightingSegment = Parameters<typeof summarizeLighting>[0][number];
type WaitingSite = Parameters<typeof planIndoorWait>[0];
type WaitingPlan = ReturnType<typeof planIndoorWait>;
type SegmentInventory = { segmentId: string; lengthMeters: number };
type PublicRoute = { routeId: string; routeVersion: string; segments: readonly SegmentInventory[] };
type ObservedRoute = { routeId: string; routeVersion: string; segments: readonly LightingSegment[] };
type PickupPermission = { providerId: string; serviceId: string; siteId: string; permitted: boolean | null; source: SourceWindow };
type ProviderPickup = { kind: 'provider'; providerId: string; serviceId: string; siteId: string; pickupAt: string;
  walkToPickupMinutes: number; routeVerified: boolean; permission?: PickupPermission };
type JourneyReadinessInput = { evaluatedAt: string; expectedRoute: PublicRoute; observedRoute?: ObservedRoute;
  lightingRequired: boolean; pickup: ProviderPickup | { kind: 'walk' }; waitingSite?: WaitingSite };
type SourceValidity = 'valid' | 'missing' | 'invalid' | 'future' | 'expired' | 'stale';
type Reason = 'ROUTE_INVENTORY_MISMATCH' | 'LIGHTING_UNKNOWN' | 'PICKUP_PERMISSION_MISSING'
  | 'PICKUP_PERMISSION_MISMATCH' | 'PICKUP_PERMISSION_NOT_GRANTED' | 'PICKUP_PERMISSION_SOURCE_INVALID'
  | 'PICKUP_PERMISSION_TIME_UNCOVERED' | 'PICKUP_ROUTE_UNVERIFIED' | 'WAITING_SITE_MISMATCH'
  | 'WAITING_HOURS_INVALID' | 'INDOOR_WAIT_NOT_SUPPORTED';

/** Source review is an assessment convention, not provider authorization. Dynamic
 * pickup permission must be captured within one hour and remain valid at pickup. */
function sourceValidity(source: SourceWindow | undefined, now: number, maxAgeMs: number): SourceValidity {
  if (!source) return 'missing';
  try {
    const url = new URL(source.sourceUrl);
    const captured = Date.parse(source.capturedAt), until = Date.parse(source.validUntil);
    const official = url.hostname === 'vt.edu' || url.hostname.endsWith('.vt.edu')
      || url.hostname === 'blacksburg.gov' || url.hostname.endsWith('.blacksburg.gov')
      || url.hostname === 'www.appalachianpower.com';
    if (url.protocol !== 'https:' || !official || url.username || url.password || url.port
      || !/^[a-f0-9]{64}$/.test(source.sourceVersion)
      || !/(Z|[+-]\d{2}:\d{2})$/.test(source.capturedAt)
      || !/(Z|[+-]\d{2}:\d{2})$/.test(source.validUntil)
      || !Number.isFinite(captured) || !Number.isFinite(until) || until <= captured) return 'invalid';
    if (captured > now) return 'future';
    if (now >= until) return 'expired';
    if (now - captured >= maxAgeMs || until > captured + maxAgeMs) return 'stale';
    return 'valid';
  } catch { return 'invalid'; }
}

function checkedInstant(value: string): number {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('Expected timezone-qualified evidence time');
  }
  return Date.parse(value);
}

/** Pure coverage report for reviewed server-side evidence. It never controls option
 * availability, ranking, confirmation, provider permission, or booking. */
export function assessJourneyReadiness(input: JourneyReadinessInput) {
  const now = checkedInstant(input.evaluatedAt);
  const reasons: Reason[] = [];
  const expected = input.expectedRoute.segments;
  const expectedIds = new Set(expected.map(segment => segment.segmentId));
  if (!input.expectedRoute.routeId || !input.expectedRoute.routeVersion || !expected.length || expected.length > 20000
    || expectedIds.size !== expected.length || expected.some(segment => !segment.segmentId
      || !Number.isFinite(segment.lengthMeters) || segment.lengthMeters <= 0 || segment.lengthMeters > 10000)) {
    throw new Error('Invalid expected public route inventory');
  }
  const observed = input.observedRoute;
  const inventoryMatches = !!observed && observed.routeId === input.expectedRoute.routeId
    && observed.routeVersion === input.expectedRoute.routeVersion && observed.segments.length === expected.length
    && observed.segments.every((segment, index) => segment.segmentId === expected[index].segmentId
      && segment.lengthMeters === expected[index].lengthMeters);
  if (!inventoryMatches) reasons.push('ROUTE_INVENTORY_MISMATCH');

  // The complete expected inventory is always sent to the existing lighting
  // helper. Mismatched route evidence is never transplanted onto another route.
  const lightingSegments: LightingSegment[] = expected.map((segment, index) => ({ ...segment,
    observation: inventoryMatches ? observed!.segments[index].observation : undefined }));
  const summary = input.lightingRequired ? summarizeLighting(lightingSegments, input.evaluatedAt) : null;
  if (input.lightingRequired && !summary!.fullyVerified) reasons.push('LIGHTING_UNKNOWN');
  const lightingState = !input.lightingRequired ? 'not_required' : !summary!.fullyVerified ? 'unknown'
    : summary!.verifiedLitMeters === summary!.totalMeters ? 'all_lit'
      : summary!.verifiedUnlitMeters === summary!.totalMeters ? 'all_unlit' : 'mixed_lit_unlit';
  const lightingSources = lightingSegments.map(segment => ({ segmentId: segment.segmentId,
    sourceValidity: sourceValidity(segment.observation, now, 3600000),
    observationKind: segment.observation?.kind ?? 'missing', state: segment.observation?.state ?? 'unknown' }));

  let pickupStatus: 'not_applicable' | 'supported' | 'unknown' = 'not_applicable';
  let permissionValidity: SourceValidity | 'not_applicable' = 'not_applicable';
  if (input.pickup.kind === 'provider') {
    const pickup = input.pickup, permission = pickup.permission;
    pickupStatus = 'supported';
    permissionValidity = sourceValidity(permission?.source, now, 3600000);
    if (!permission) reasons.push('PICKUP_PERMISSION_MISSING');
    else {
      if (permission.providerId !== pickup.providerId || permission.serviceId !== pickup.serviceId || permission.siteId !== pickup.siteId) {
        reasons.push('PICKUP_PERMISSION_MISMATCH');
      }
      if (permission.permitted !== true) reasons.push('PICKUP_PERMISSION_NOT_GRANTED');
      if (permissionValidity !== 'valid') reasons.push('PICKUP_PERMISSION_SOURCE_INVALID');
      const pickupAt = checkedInstant(pickup.pickupAt);
      if (pickupAt <= now || permissionValidity === 'valid' && pickupAt >= checkedInstant(permission.source.validUntil)) {
        reasons.push('PICKUP_PERMISSION_TIME_UNCOVERED');
      }
    }
    if (pickup.routeVerified !== true || !Number.isFinite(pickup.walkToPickupMinutes)
      || pickup.walkToPickupMinutes < 0 || pickup.walkToPickupMinutes > 120) reasons.push('PICKUP_ROUTE_UNVERIFIED');
    if (reasons.some(reason => reason.startsWith('PICKUP_'))) pickupStatus = 'unknown';
  }

  let indoorStatus: 'not_claimed' | 'estimated' | 'unknown' | 'closed' = 'not_claimed';
  let waitingPlan: WaitingPlan | null = null;
  let waitingSourceValidity: SourceValidity | 'not_applicable' = 'not_applicable';
  if (input.waitingSite) {
    waitingSourceValidity = sourceValidity(input.waitingSite.source, now, 86400000);
    if (input.pickup.kind !== 'provider' || input.waitingSite.siteId !== input.pickup.siteId) {
      reasons.push('WAITING_SITE_MISMATCH');
      indoorStatus = 'unknown';
    } else {
      const pickup = input.pickup;
      try {
        waitingPlan = planIndoorWait(input.waitingSite, { providerPickupPermitted: pickupStatus === 'supported',
          pickupAt: pickup.pickupAt, walkToPickupMinutes: pickup.walkToPickupMinutes,
          routeVerified: pickup.routeVerified }, input.evaluatedAt);
        indoorStatus = waitingPlan.status === 'ESTIMATED' ? 'estimated' : waitingPlan.status === 'CLOSED' ? 'closed' : 'unknown';
      } catch {
        // Invalid reviewed hours/access data is not an indoor-wait estimate.
        indoorStatus = 'unknown';
        reasons.push('WAITING_HOURS_INVALID');
      }
      if (indoorStatus !== 'estimated') reasons.push('INDOOR_WAIT_NOT_SUPPORTED');
    }
  }
  return {
    coverage: reasons.length ? 'incomplete' as const : 'complete' as const,
    bookingAuthorized: false as const, availabilityImpact: 'none' as const, reasons,
    route: { routeId: input.expectedRoute.routeId, routeVersion: input.expectedRoute.routeVersion, inventoryMatches },
    lighting: { required: input.lightingRequired, state: lightingState, summary, sources: lightingSources },
    pickup: { status: pickupStatus, sourceValidity: permissionValidity },
    indoorWaiting: { status: indoorStatus, sourceValidity: waitingSourceValidity, plan: waitingPlan },
  };
}
