/** Path-scoped public evidence. No crime score, safety certification, or new routing engine. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closureEvidence, currentWeather, intersectsArea, parseSnapshot, type Point as XY } from '../campus-evidence/evidence';
import { type WalkingRoute, withinWalkingDemoArea } from './walking-router';

export type PathEvidenceFact = {
  kind: 'construction_closure' | 'mapped_lighting' | 'historical_incident' | 'emergency_phone' | 'weather';
  sourceUrl: string; sourceVersion: string; capturedAt: string; observedAt: string | null;
  validUntil: string | null; confidence: 'official_snapshot' | 'community_unverified' | 'historical_partial' | 'forecast';
  spatialMatch: 'path_polygon_intersection' | 'near_path' | 'exact_endpoint_building' | 'campus_forecast_area';
  details: Record<string, string | number | boolean | null>;
};
export type PathEvidence = { blocked: boolean; validUntil: string | null; facts: PathEvidenceFact[]; unknowns: string[] };
export type PathEvidenceSources = Partial<Record<'closures' | 'lighting' | 'lightingProvenance' | 'crime' | 'buildings' | 'phones' | 'manifest' | 'weather', unknown>>;
const files: Record<keyof PathEvidenceSources, string> = {
  closures: 'research/closures.json', lighting: 'research/lighting/observations.json', lightingProvenance: 'research/lighting/provenance.json',
  crime: 'research/crime-records-2026.json', buildings: 'walking-network.json', phones: 'emergency-phones.json', manifest: 'source-manifest.json', weather: 'research/weather.json',
};
const obj = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {};
const rows = (x: unknown): Record<string, unknown>[] => Array.isArray(x) ? x.map(obj) : [];
const time = (x: unknown) => typeof x === 'string' ? Date.parse(x) : NaN;
const text = (x: unknown) => typeof x === 'string' ? x : '';
const hash = (x: unknown) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
function official(url: unknown, host: string) { try { const u = new URL(String(url)); return u.protocol === 'https:' && u.hostname === host && !u.username && !u.password; } catch { return false; } }
const currentCapture = (value: unknown, now: number) => Number.isFinite(time(value)) && time(value) <= now;
function readSources(): PathEvidenceSources {
  const sources: PathEvidenceSources = {};
  for (const [key, path] of Object.entries(files)) {
    try { sources[key as keyof PathEvidenceSources] = JSON.parse(readFileSync(join(process.cwd(), 'data/campus', path), 'utf8')); } catch { /* Missing source remains explicitly unknown. */ }
  }
  return sources;
}
function coordinate(value: unknown): XY | null {
  return Array.isArray(value) && value.length === 2 && value.every(x => typeof x === 'number' && Number.isFinite(x)) && withinWalkingDemoArea({ lng: value[0], lat: value[1] }) ? value as XY : null;
}
/** Projection only for local evidence proximity, never for navigation or invented route legs. */
function pointDistance(p: XY, path: XY[]): number {
  const scaleX = 111_195 * Math.cos(p[1] * Math.PI / 180), scaleY = 111_195;
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = [(path[i-1][0] - p[0]) * scaleX, (path[i-1][1] - p[1]) * scaleY], b = [(path[i][0] - p[0]) * scaleX, (path[i][1] - p[1]) * scaleY];
    const dx = b[0]-a[0], dy = b[1]-a[1], square = dx*dx+dy*dy, t = square ? Math.max(0, Math.min(1, -(a[0]*dx+a[1]*dy)/square)) : 0;
    best = Math.min(best, Math.hypot(a[0]+t*dx, a[1]+t*dy));
  }
  return best;
}
const normalized = (x: unknown) => text(x).toLowerCase().replace(/\s+/g, ' ').trim();

/** Defaults read current local snapshots. The optional source bundle supports labeled offline tests. */
export function assessPathEvidence(route: WalkingRoute, at: string, sources: PathEvidenceSources = readSources()): PathEvidence {
  const now = Date.parse(at), path = route.geometry?.coordinates?.map(coordinate);
  if (!Number.isFinite(now) || route.geometry?.type !== 'LineString' || !path || path.length < 2 || path.length > 20_000 || path.some(p => !p)) throw new Error('Invalid path evidence request');
  const line = path as XY[], facts: PathEvidenceFact[] = [], unknowns = [
    'Current operational lighting and route-wide illumination are unknown; mapped lamps and lit tags are unverified inventory.',
    'Historical measured lighting is unjoined: coordinate reference system is unverified and observations are from January–March 2026.',
    'Historical reports are incomplete publication records, not current incident risk; no report is not evidence of no crime.',
    'Emergency phone operation, access, current activity and companionship are unknown.',
  ];
  let blocked = false; const expiries: number[] = [];
  try {
    const s = parseSnapshot(sources.closures, 'closures');
    if (s.sources.some(p => !official(p.url, 'arcgis-central.gis.vt.edu') || !currentCapture(p.captured_at, now)) || s.records.some(r => !s.sources.some(p => p.url === r.source_url))) throw new Error('closure provenance');
    const evidence = closureEvidence(s, line, now), expiry = Math.min(time(s.captured_at), ...s.sources.map(p => time(p.captured_at))) + 3_600_000;
    if (evidence.status !== 'current_snapshot' || expiry <= now) throw new Error('stale');
    expiries.push(expiry);
    // A closure beginning during a later leg invalidates this assessment at its start.
    for (const r of s.records) {
      if (r.kind === 'area' && time(r.starts_at) > now && time(r.ends_at) > time(r.starts_at) && intersectsArea(line, r.geometry)) expiries.push(time(r.starts_at));
    }
    for (const r of evidence.matchingAreas) {
      const source = s.sources.find(p => p.url === r.source_url)!;
      blocked = true;
      const until = Math.min(expiry, time(r.ends_at)); expiries.push(until);
      facts.push({ kind: 'construction_closure', sourceUrl: source.url, sourceVersion: source.sha256, capturedAt: source.captured_at, observedAt: text(r.starts_at), validUntil: new Date(until).toISOString(), confidence: 'official_snapshot', spatialMatch: 'path_polygon_intersection', details: { id: text(r.id), name: text(r.name), pedestrianPathBlocked: true } });
    }
    unknowns.push('Published construction coverage is partial; no polygon intersection does not certify that the path is open.');
  } catch { unknowns.push('Current construction closure coverage is unavailable or stale.'); }

  const lp = obj(sources.lightingProvenance);
  if (currentCapture(lp.captured_at, now) && hash(lp.sha256) && lp.coordinate_reference_system === 'EPSG:4326') {
    for (const r of rows(sources.lighting)) {
      if (r.verification !== 'community_unverified' || !official(r.source_url, 'www.openstreetmap.org') || !currentCapture(r.last_edited_at, now)) continue;
      const geometry = obj(r.geometry);
      // Lines are joined only on overlapping coordinates, points within 15m. A tag on a
      // nearby road, polygon/building or bus stop is never propagated onto the path.
      const pts = geometry.type === 'Point' ? [coordinate(geometry.coordinates)] : geometry.type === 'LineString' && Array.isArray(geometry.coordinates) ? geometry.coordinates.map(coordinate) : [];
      const distances = pts.filter((p): p is XY => p !== null).map(p => pointDistance(p, line));
      if (!distances.length || Math.min(...distances) > (geometry.type === 'Point' ? 15 : 2)) continue;
      facts.push({ kind: 'mapped_lighting', sourceUrl: text(r.source_url), sourceVersion: text(lp.sha256), capturedAt: text(lp.captured_at), observedAt: text(r.last_edited_at), validUntil: null, confidence: 'community_unverified', spatialMatch: 'near_path', details: { id: text(r.id), mapObject: text(r.kind), mappedLitTag: text(r.lit) || null, distanceMeters: Math.round(Math.min(...distances)), operationalStatus: 'unknown', timestampMeaning: 'map object edit; lighting observation time unknown', attribution: '© OpenStreetMap contributors; ODbL 1.0' } });
    }
  } else unknowns.push('Mapped lighting snapshot is unavailable or not valid at this time.');

  const buildings = obj(sources.buildings), endpointNames = new Set<string>();
  if (currentCapture(buildings.captured_at, now) && hash(buildings.source_version) && official(buildings.building_source_url, 'arcgis-central.gis.vt.edu')) {
    for (const b of rows(buildings.buildings)) {
      const attributes = obj(b.attributes), geometry = obj(b.geometry);
      // Exact official building polygon containment at endpoints; no geocoding guesses.
      for (const p of [line[0], line.at(-1)!]) {
        try { if (intersectsArea([p,p], { type: 'Polygon', coordinates: geometry.rings })) endpointNames.add(normalized(attributes.name)); } catch { /* unusable polygon remains unjoined */ }
      }
    }
  }
  let crimeMatches = 0;
  for (const r of rows(sources.crime)) {
    const name = text(r.location).match(/\(([^()]+)\)\s*$/)?.[1] ?? text(r.location);
    if (!endpointNames.has(normalized(name)) || !official(r.source_url, 'police.vt.edu') || !hash(r.source_hash) || !currentCapture(r.captured_at, now) || !Number.isFinite(time(r.reported_date)) || time(r.reported_date) > now || (Array.isArray(r.data_quality_flags) && r.data_quality_flags.length)) continue;
    crimeMatches++;
    facts.push({ kind: 'historical_incident', sourceUrl: text(r.source_url), sourceVersion: text(r.source_hash), capturedAt: text(r.captured_at), observedAt: text(r.reported_date), validUntil: null, confidence: 'historical_partial', spatialMatch: 'exact_endpoint_building', details: { recordId: text(r.record_id), reportId: text(r.report_id), location: text(r.location), offense: text(r.offense), disposition: text(r.disposition), occurrenceStart: text(r.occurrence_start) || null, occurrenceEnd: text(r.occurrence_end) || null, buildingGeometrySource: text(buildings.building_source_url), buildingGeometryVersion: text(buildings.source_version), completeCoverage: false } });
  }
  if (!crimeMatches) unknowns.push('No supported exact endpoint-building historical report join; arbitrary route/address crime coverage is unknown.');

  const phoneSource = rows(sources.manifest).find(r => r.source_id === 'vt-emergency-phones');
  if (phoneSource && official(phoneSource.source_url, 'arcgis-central.gis.vt.edu') && hash(phoneSource.sha256) && currentCapture(phoneSource.captured_at, now)) {
    for (const r of rows(sources.phones)) {
      const p = coordinate([r.longitude, r.latitude]); if (!p || r.source_id !== 'vt-emergency-phones') continue;
      const distance = pointDistance(p, line); if (distance > 50) continue;
      facts.push({ kind: 'emergency_phone', sourceUrl: text(phoneSource.source_url), sourceVersion: text(phoneSource.sha256), capturedAt: text(phoneSource.captured_at), observedAt: null, validUntil: null, confidence: 'official_snapshot', spatialMatch: 'near_path', details: { id: text(r.phone_id), location: text(r.location), distanceMeters: Math.round(distance), operationalStatus: 'unknown', accessNow: 'unknown' } });
    }
  } else unknowns.push('Emergency phone inventory is unavailable at this time.');

  try {
    const s = parseSnapshot(sources.weather, 'weather');
    if (s.sources.some(p => !official(p.url, 'api.weather.gov') || !currentCapture(p.captured_at, now))) throw new Error('weather provenance');
    const row = s.records[0], weather = currentWeather(s, text(row?.corridor_id), now), source = s.sources.find(p => p.url === weather.sourceUrl);
    if (weather.status !== 'current' || weather.condition === 'unknown' || !weather.validUntil || !source) throw new Error('unavailable');
    const expiry = Math.min(time(weather.validUntil), ...s.sources.map(p => time(p.captured_at) + 3_600_000));
    if (expiry <= now) throw new Error('stale');
    expiries.push(expiry); blocked ||= weather.condition === 'severe';
    facts.push({ kind: 'weather', sourceUrl: source.url, sourceVersion: source.sha256, capturedAt: source.captured_at, observedAt: weather.issuedAt ?? null, validUntil: new Date(expiry).toISOString(), confidence: 'forecast', spatialMatch: 'campus_forecast_area', details: { condition: weather.condition, activeOfficialAlert: weather.activeOfficialAlert ?? null, routeObserved: false, limitation: 'NWS campus reference area forecast; not observations on each path' } });
  } catch { unknowns.push('Current weather and official alert coverage are unavailable or stale.'); }
  return { blocked, validUntil: expiries.length ? new Date(Math.min(...expiries)).toISOString() : null, facts, unknowns };
}
