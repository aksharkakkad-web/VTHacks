/** Public evidence only. No identity, GPS input, crime prediction or safety guarantee. */
export type Point = [number, number];
export type Source = { url: string; sha256: string; captured_at: string; row_count: number; coverage: string; limitations: string };
export type Snapshot = { schema_version: 1; dataset: string; captured_at: string; records: Record<string, unknown>[]; sources: Source[]; limitations: string[] };
export type WeatherEvidence = { status: "current" | "unknown"; condition: "clear" | "rain" | "severe" | "unknown"; validUntil?: string; issuedAt?: string; sourceUrl?: string; activeOfficialAlert?: true };
export type ClosureEvidence = { status: "current_snapshot" | "stale_or_missing" | "route_unknown"; blocked: true | null; matchingAreas: Record<string, unknown>[]; validUntil?: string };

/** Local applicability gate; these coordinates are never sent to a research source. */
export function withinCampusForecast(point: { lat: number; lng: number }) {
  return point.lat >= 37.205 && point.lat <= 37.245 && point.lng >= -80.44 && point.lng <= -80.395;
}

export function isCurrentWeather(weather: WeatherEvidence | undefined, now: number): weather is WeatherEvidence & { validUntil: string } {
  if (!weather || weather.status !== "current" || !["clear", "rain", "severe"].includes(weather.condition) || !weather.issuedAt || !weather.validUntil || !weather.sourceUrl) return false;
  try {
    const url = new URL(weather.sourceUrl);
    return url.protocol === "https:" && url.hostname === "api.weather.gov" && !url.username && !url.password && Date.parse(weather.issuedAt) <= now && now - Date.parse(weather.issuedAt) < 86400000 && Date.parse(weather.validUntil) > now;
  } catch { return false; }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid evidence object");
  return value as Record<string, unknown>;
}
function date(value: unknown) { return typeof value === "string" ? Date.parse(value) : NaN; }
function https(value: unknown) {
  try { const u = new URL(String(value)); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}
export function parseSnapshot(value: unknown, dataset: string): Snapshot {
  const s = record(value);
  if (s.schema_version !== 1 || s.dataset !== dataset || !Number.isFinite(date(s.captured_at)) || !Array.isArray(s.records) || s.records.length > 10000 || !Array.isArray(s.sources) || !s.sources.length || s.sources.length > 150 || !Array.isArray(s.limitations) || !s.limitations.every(x => typeof x === "string")) throw new Error("Invalid evidence snapshot");
  s.records.forEach(record);
  for (const item of s.sources) {
    const p = record(item);
    if (!https(p.url) || !/^[a-f0-9]{64}$/.test(String(p.sha256)) || !Number.isFinite(date(p.captured_at)) || !Number.isInteger(p.row_count) || Number(p.row_count) < 0 || typeof p.coverage !== "string" || typeof p.limitations !== "string") throw new Error("Missing evidence provenance");
  }
  return s as Snapshot;
}

function point(value: unknown): Point {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(x => typeof x === "number" && Number.isFinite(x)) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error("Invalid evidence geometry");
  return value as Point;
}
function ring(value: unknown): Point[] {
  if (!Array.isArray(value) || value.length < 4 || value.length > 10000) throw new Error("Invalid closure ring");
  const pts = value.map(point);
  if (pts[0][0] !== pts.at(-1)![0] || pts[0][1] !== pts.at(-1)![1]) throw new Error("Open closure ring");
  return pts;
}
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(p: Point, a: Point, b: Point) {
  return Math.abs(cross(a, b, p)) <= 1e-12 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  return (x * y < 0 && z * w < 0) || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}
function inside(p: Point, points: Point[]) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if (onSegment(p, a, b)) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
/** Exact intersection of the mapped line with source polygons; no invented buffer or detour. */
export function intersectsArea(path: Point[], geometry: unknown): boolean {
  if (path.length < 2 || path.length > 20000) throw new Error("Invalid route line");
  path.forEach(point);
  const g = record(geometry);
  if (!["Polygon", "MultiPolygon"].includes(String(g.type)) || !Array.isArray(g.coordinates)) throw new Error("Invalid closure area");
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  if (!polygons.length || polygons.length > 1000) throw new Error("Invalid closure area count");
  return polygons.some(value => {
    if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error("Invalid closure polygon");
    const rings = value.map(ring);
    if (path.some(p => inside(p, rings[0]) && !rings.slice(1).some(hole => inside(p, hole)))) return true;
    for (let i = 1; i < path.length; i++) {
      for (const boundary of rings) for (let j = 1; j < boundary.length; j++) {
        if (segmentsIntersect(path[i - 1], path[i], boundary[j - 1], boundary[j])) return true;
      }
    }
    return false;
  });
}

export function currentWeather(value: unknown, corridor: string, now: number): WeatherEvidence {
  const unknown: WeatherEvidence = { status: "unknown", condition: "unknown" };
  if (!Number.isFinite(now)) return unknown;
  let snapshot: Snapshot;
  try { snapshot = parseSnapshot(value, "weather"); } catch { return unknown; }
  if (date(snapshot.captured_at) > now || now - date(snapshot.captured_at) > 86400000) return unknown;
  const rows = snapshot.records.filter(r => r.corridor_id === corridor && date(r.updated_at) <= now && now - date(r.updated_at) < 86400000 && date(r.valid_from) <= now && date(r.valid_until) > now)
    .sort((a, b) => date(b.updated_at) - date(a.updated_at));
  const r = rows[0];
  if (!r || !["clear", "rain", "severe", "unknown"].includes(String(r.weather)) || !https(r.source_url) || new URL(String(r.source_url)).hostname !== "api.weather.gov") return unknown;
  return { status: "current", condition: r.weather as WeatherEvidence["condition"], validUntil: new Date(Math.min(date(r.valid_until), date(r.updated_at) + 86400000, date(snapshot.captured_at) + 86400000)).toISOString(), issuedAt: String(r.updated_at), sourceUrl: String(r.source_url), ...(r.active_official_alert === true ? { activeOfficialAlert: true as const } : {}) };
}

export function closureEvidence(value: unknown, path: Point[] | null, now: number): ClosureEvidence {
  const result: ClosureEvidence = { status: path ? "stale_or_missing" : "route_unknown", blocked: null, matchingAreas: [] };
  if (!path || !Number.isFinite(now)) return result;
  try {
    const s = parseSnapshot(value, "closures"), captured = date(s.captured_at);
    if (captured > now || now - captured > 3600000) return result;
    const matches = s.records.filter(r => r.kind === "area" && date(r.starts_at) <= now && date(r.ends_at) > now && intersectsArea(path, r.geometry));
    return { status: "current_snapshot", blocked: matches.length ? true : null, matchingAreas: matches,
      ...(matches.length ? { validUntil: new Date(Math.min(captured + 3600000, ...matches.map(r => date(r.ends_at)))).toISOString() } : {}) };
  } catch { return result; }
}
