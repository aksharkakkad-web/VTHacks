/** Reviewed server-side evidence only. These helpers do not certify personal safety,
 * current admission, provider pickup permission, or the origin of arbitrary client JSON. */
export type SourceWindow = { sourceUrl: string; sourceVersion: string; capturedAt: string; validUntil: string };
type LightingSegment = { segmentId: string; lengthMeters: number; observation?: SourceWindow & {
  kind: 'operational' | 'pole_inventory'; state: 'lit' | 'unlit' | 'unknown';
} };
type WaitingSite = { siteId: string; indoor: boolean; source: SourceWindow; accessAllowed: boolean | null;
  openWindows: readonly { opensAt: string; closesAt: string }[] };
type Pickup = { providerPickupPermitted: boolean | null; pickupAt: string; walkToPickupMinutes: number; routeVerified: boolean };
type WaitingPlan = { status: 'ESTIMATED' | 'UNKNOWN' | 'CLOSED'; reason: string;
  leaveWaitingPlaceAt: string | null; estimatedOutdoorWaitMinutes: number | null; estimatedIndoorWaitMinutes: number | null };

function instant(value: string): number {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Expected timezone-qualified evidence time');
  return Date.parse(value);
}
function fresh(source: SourceWindow, now: number, maxAgeMs: number): boolean {
  try {
    const url = new URL(source.sourceUrl), captured = instant(source.capturedAt), until = instant(source.validUntil);
    const official = url.hostname === 'vt.edu' || url.hostname.endsWith('.vt.edu') || url.hostname === 'blacksburg.gov' || url.hostname.endsWith('.blacksburg.gov') || url.hostname === 'www.appalachianpower.com';
    return official && url.protocol === 'https:' && !url.username && !url.password && !url.port && /^[a-f0-9]{64}$/.test(source.sourceVersion)
      && captured <= now && now < until && now - captured < maxAgeMs && until <= captured + maxAgeMs;
  } catch { return false; }
}

export function summarizeLighting(segments: readonly LightingSegment[], evaluatedAt: string) {
  const now = instant(evaluatedAt), seen = new Set<string>();
  let totalMeters = 0, verifiedLitMeters = 0, verifiedUnlitMeters = 0;
  if (!segments.length || segments.length > 20000) throw new Error('Expected bounded mapped segments');
  for (const segment of segments) {
    if (!segment.segmentId || seen.has(segment.segmentId) || !Number.isFinite(segment.lengthMeters) || segment.lengthMeters <= 0 || segment.lengthMeters > 10000) throw new Error('Invalid or duplicate lighting segment');
    seen.add(segment.segmentId); totalMeters += segment.lengthMeters;
    const observation = segment.observation;
    if (observation?.kind !== 'operational' || !fresh(observation, now, 3600000)) continue;
    if (observation.state === 'lit') verifiedLitMeters += segment.lengthMeters;
    if (observation.state === 'unlit') verifiedUnlitMeters += segment.lengthMeters;
  }
  const unknownMeters = Math.max(0, totalMeters - verifiedLitMeters - verifiedUnlitMeters);
  return { totalMeters, verifiedLitMeters, verifiedUnlitMeters, unknownMeters, fullyVerified: unknownMeters < 1e-6 };
}

/** Scheduled hours + confirmed access/pickup + mapped access time yield estimates,
 * not a promise that a room or vehicle will actually be available. */
export function planIndoorWait(site: WaitingSite, pickup: Pickup, evaluatedAt: string): WaitingPlan {
  const now = instant(evaluatedAt);
  const absent = (status: 'UNKNOWN' | 'CLOSED', reason: string): WaitingPlan => ({ status, reason, leaveWaitingPlaceAt: null, estimatedOutdoorWaitMinutes: null, estimatedIndoorWaitMinutes: null });
  if (!site.indoor || site.accessAllowed !== true || pickup.providerPickupPermitted !== true || pickup.routeVerified !== true) return absent('UNKNOWN', 'ACCESS_OR_PICKUP_UNVERIFIED');
  if (!fresh(site.source, now, 86400000)) return absent('UNKNOWN', 'HOURS_STALE_OR_UNVERIFIED');
  if (!Number.isFinite(pickup.walkToPickupMinutes) || pickup.walkToPickupMinutes < 0 || pickup.walkToPickupMinutes > 120) throw new Error('Invalid access walking estimate');
  const pickupAt = instant(pickup.pickupAt), walkMs = pickup.walkToPickupMinutes * 60000;
  if (pickupAt <= now || pickupAt - walkMs < now || pickupAt >= instant(site.source.validUntil)) return absent('UNKNOWN', 'PICKUP_TIME_UNUSABLE');
  if (!Array.isArray(site.openWindows) || site.openWindows.length > 32) throw new Error('Invalid hours windows');
  const windows = site.openWindows.map(window => {
    const opens = instant(window.opensAt), closes = instant(window.closesAt);
    if (closes <= opens) throw new Error('Invalid hours interval');
    return { opens, closes };
  }).sort((a, b) => a.opens - b.opens);
  if (windows.some((window, i) => i > 0 && window.opens < windows[i - 1].closes)) throw new Error('Overlapping hours require source review');
  const window = windows.find(window => window.opens <= now && now < window.closes);
  if (!window) return absent('CLOSED', 'OUTSIDE_PUBLISHED_OPEN_WINDOW');
  const leaveAt = Math.min(window.closes, pickupAt - walkMs);
  return { status: 'ESTIMATED', reason: leaveAt < pickupAt - walkMs ? 'LEAVE_BEFORE_BUILDING_CLOSES' : 'TIMED_WALK_TO_PICKUP',
    leaveWaitingPlaceAt: new Date(leaveAt).toISOString(), estimatedIndoorWaitMinutes: (leaveAt - now) / 60000,
    estimatedOutdoorWaitMinutes: Math.max(0, (pickupAt - leaveAt - walkMs) / 60000) };
}
