/** Server adapter to an established walking directions service. Never synthesizes paths. */
import { createHash } from 'node:crypto';

export type Point = { lat: number; lng: number };
export type WalkingRoute = {
  routeId: string; from: Point; to: Point;
  geometry: { type: 'LineString'; coordinates: number[][] };
  distanceMeters: number; durationSeconds: number;
  instructions: { text: string; distanceMeters: number; durationSeconds: number }[];
  provider: string; capturedAt: string; validUntil: string;
};
export type WalkingRouter = (from: Point, to: Point, at: string) => Promise<WalkingRoute>;
export class WalkingRoutingError extends Error {
  constructor(public readonly code: 'configuration_missing' | 'unsupported_area' | 'invalid_request' | 'provider_unavailable' | 'no_route' | 'invalid_route', message: string) { super(message); this.name = 'WalkingRoutingError'; }
}
export const WALKING_DEMO_AREA = { south: 37.205, north: 37.245, west: -80.44, east: -80.395 } as const;
export function withinWalkingDemoArea(p: Point): boolean {
  return Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && p.lat >= WALKING_DEMO_AREA.south && p.lat <= WALKING_DEMO_AREA.north && p.lng >= WALKING_DEMO_AREA.west && p.lng <= WALKING_DEMO_AREA.east;
}
export function distanceMeters(a: Point, b: Point): number {
  const rad = Math.PI / 180, x = (b.lng - a.lng) * rad * Math.cos((a.lat + b.lat) * rad / 2), y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}
const point = (p: number[]): Point => ({ lng: p[0], lat: p[1] });
const invalid = (): never => { throw new WalkingRoutingError('invalid_route', 'Walking provider returned invalid or disconnected directions.'); };
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid(); return v as Record<string, unknown>; }
function metric(v: unknown, max: number): number { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return invalid(); return v; }
function seconds(v: unknown): number { if (typeof v !== 'string' || !/^\d+(?:\.\d{1,9})?s$/.test(v)) return invalid(); return metric(Number(v.slice(0, -1)), 21_600); }
function line(v: unknown): WalkingRoute['geometry'] {
  const g = object(v);
  if (g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2 || g.coordinates.length > 20_000) return invalid();
  const coordinates = g.coordinates.map(v => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(x => typeof x === 'number') || !withinWalkingDemoArea(point(v))) return invalid();
    return [...v] as number[];
  });
  // HIGH_QUALITY pedestrian polylines should not contain disconnected kilometre jumps.
  for (let i = 1; i < coordinates.length; i++) if (distanceMeters(point(coordinates[i-1]), point(coordinates[i])) > 1000) return invalid();
  return { type: 'LineString', coordinates };
}
function length(g: WalkingRoute['geometry']): number { return g.coordinates.slice(1).reduce((sum, p, i) => sum + distanceMeters(point(p), point(g.coordinates[i])), 0); }
function close(a: Point, b: Point, tolerance = 20) { if (!withinWalkingDemoArea(a) || !withinWalkingDemoArea(b) || distanceMeters(a, b) > tolerance) invalid(); }
function onRoute(p: Point, g: WalkingRoute['geometry']): boolean {
  return g.coordinates.slice(1).some((end, i) => {
    const a = point(g.coordinates[i]), b = point(end), scale = Math.cos(p.lat * Math.PI / 180);
    const ax = (a.lng-p.lng)*scale, ay = a.lat-p.lat, dx = (b.lng-a.lng)*scale, dy = b.lat-a.lat;
    const square = dx*dx+dy*dy, t = square ? Math.max(0, Math.min(1, -(ax*dx+ay*dy)/square)) : 0;
    return Math.hypot(ax+t*dx,ay+t*dy)*111195 <= 2;
  });
}
/** Validates routes returned by injected adapters too; never treats caller metrics as trusted. */
export function validateWalkingRoute(route: WalkingRoute, from: Point, to: Point, at: string): WalkingRoute {
  if (!route || typeof route !== 'object') return invalid();
  const now = Date.parse(at), g = line(route.geometry);
  if (!Number.isFinite(now) || !Number.isFinite(Date.parse(route.capturedAt)) || Date.parse(route.capturedAt) > now || !(Date.parse(route.validUntil) > now) || Date.parse(route.validUntil) > Date.parse(route.capturedAt) + 300_000) return invalid();
  if (!withinWalkingDemoArea(from) || !withinWalkingDemoArea(to) || typeof route.routeId !== 'string' || !route.routeId || typeof route.provider !== 'string' || !route.provider) return invalid();
  close(route.from, from, .1); close(route.to, to, .1); close(point(g.coordinates[0]), from); close(point(g.coordinates.at(-1)!), to);
  const distance = metric(route.distanceMeters, 20_000), duration = metric(route.durationSeconds, 21_600), geometric = length(g);
  if (distance < geometric * .8 || distance > geometric * 1.3 + 20 || (distance > 1 && duration <= 0)) return invalid();
  if (!Array.isArray(route.instructions) || !route.instructions.length || route.instructions.length > 500) return invalid();
  let instructionDistance = 0, instructionDuration = 0;
  for (const s of route.instructions) {
    if (typeof s.text !== 'string' || !s.text.trim() || s.text.length > 2000) return invalid();
    instructionDistance += metric(s.distanceMeters, 20_000); instructionDuration += metric(s.durationSeconds, 21_600);
  }
  if (Math.abs(instructionDistance - distance) > Math.max(5, route.instructions.length) || Math.abs(instructionDuration - duration) > Math.max(5, route.instructions.length)) return invalid();
  return structuredClone(route);
}

export function createWalkingRouter(env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): WalkingRouter {
  return async (from, to, at) => {
    if (!withinWalkingDemoArea(from) || !withinWalkingDemoArea(to)) throw new WalkingRoutingError('unsupported_area', 'Walking endpoints must be inside the supported Blacksburg demo area.');
    if (!Number.isFinite(Date.parse(at)) || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(at)) throw new WalkingRoutingError('invalid_request', 'Walking evaluation time must include a timezone.');
    if (env.BEACON_WALKING_ROUTER !== 'google_routes' || !env.GOOGLE_ROUTES_API_KEY?.trim()) throw new WalkingRoutingError('configuration_missing', 'Configure an authorized Google Routes account with BEACON_WALKING_ROUTER=google_routes and server-only GOOGLE_ROUTES_API_KEY.');
    from = { ...from }; to = { ...to };
    let payload: Record<string, unknown>;
    try {
      const response = await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_ROUTES_API_KEY,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.polyline.geoJsonLinestring' },
        body: JSON.stringify({ origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } }, destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } }, travelMode: 'WALK', polylineQuality: 'HIGH_QUALITY', polylineEncoding: 'GEO_JSON_LINESTRING', computeAlternativeRoutes: false, languageCode: 'en-US', units: 'METRIC' }),
      });
      if (!response.ok) throw new Error('provider rejected request');
      const raw = await response.text();
      if (raw.length > 2_000_000) return invalid();
      payload = object(JSON.parse(raw));
    } catch (error) {
      if (error instanceof WalkingRoutingError) throw error;
      throw new WalkingRoutingError('provider_unavailable', 'Walking directions could not be retrieved.');
    }
    if (!Array.isArray(payload.routes) || !payload.routes.length) throw new WalkingRoutingError('no_route', 'The walking provider returned no route.');
    if (payload.routes.length !== 1) return invalid();
    const raw = object(payload.routes[0]), geometry = line(object(raw.polyline).geoJsonLinestring);
    if (!Array.isArray(raw.legs) || raw.legs.length !== 1) return invalid();
    const steps = object(raw.legs[0]).steps;
    if (!Array.isArray(steps) || !steps.length || steps.length > 500) return invalid();
    let previous = point(geometry.coordinates[0]);
    const instructions = steps.map(value => {
      const s = object(value), step = line(object(s.polyline).geoJsonLinestring);
      if (step.coordinates.some(p => !onRoute(point(p), geometry))) return invalid();
      close(previous, point(step.coordinates[0]), 2); previous = point(step.coordinates.at(-1)!);
      const text = object(s.navigationInstruction).instructions;
      if (typeof text !== 'string') return invalid();
      return { text, distanceMeters: metric(s.distanceMeters ?? 0, 20_000), durationSeconds: seconds(s.staticDuration ?? '0s') };
    });
    close(previous, point(geometry.coordinates.at(-1)!), 2);
    const route: WalkingRoute = { routeId: `google-walk-${createHash('sha256').update(JSON.stringify({ geometry, from, to, at })).digest('hex').slice(0, 24)}`, from, to, geometry, distanceMeters: metric(raw.distanceMeters, 20_000), durationSeconds: seconds(raw.duration), instructions, provider: 'google_routes', capturedAt: new Date(at).toISOString(), validUntil: new Date(Date.parse(at) + 300_000).toISOString() };
    return validateWalkingRoute(route, from, to, at);
  };
}
