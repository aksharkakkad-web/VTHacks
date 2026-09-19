/** Public named-campus evidence only. This does not score safety or certify walkability. */
export type RouteEvidence = {
  schema_version: 1;
  corridor_id: string;
  status: "supported" | "unsupported";
  source_version: string;
  captured_at: string;
  source_url: string;
  origin: string;
  destination: string;
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
  distance_meters: number | null;
  endpoint_offsets_meters: [number, number] | null;
  lighting: { known_meters: number; lit_meters: number; unlit_meters: number; unknown_meters: number | null };
  nearby_phones: { phone_id: string; location: string; distance_meters: number; source_url: string; operational_status: "unknown" }[];
  historical_reports: { report_id: string; location: string; reported_date: string; offense: string; disposition: string; source_url: string; match_method: "exact_named_endpoint_place" }[];
  limitations: string[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid route evidence object");
  return value as Record<string, unknown>;
}
function number(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 2000; }
function url(value: unknown): boolean {
  if (!text(value)) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function requireValue(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid route evidence snapshot"); }

/** Fail closed on malformed or internally inconsistent evidence; callers may omit unavailable evidence. */
export function parseRouteEvidence(snapshot: unknown): RouteEvidence[] {
  requireValue(Array.isArray(snapshot) && snapshot.length <= 16);
  const ids = new Set<string>();
  for (const value of snapshot) {
    const r = record(value), lighting = record(r.lighting);
    requireValue(r.schema_version === 1 && text(r.corridor_id) && !ids.has(r.corridor_id));
    ids.add(r.corridor_id);
    requireValue(text(r.source_version) && text(r.captured_at) && Number.isFinite(Date.parse(r.captured_at)) && url(r.source_url));
    requireValue(text(r.origin) && text(r.destination));
    requireValue(Array.isArray(r.limitations) && r.limitations.length > 0 && r.limitations.length <= 32 && r.limitations.every(text));
    requireValue(number(lighting.known_meters,10000) && number(lighting.lit_meters,10000) && number(lighting.unlit_meters,10000));
    requireValue(Math.abs(lighting.known_meters - lighting.lit_meters - lighting.unlit_meters) < .05);
    requireValue(Array.isArray(r.nearby_phones) && r.nearby_phones.length <= 128 && Array.isArray(r.historical_reports) && r.historical_reports.length <= 128);
    if (r.status === "supported") {
      const geometry = record(r.geometry);
      requireValue(number(r.distance_meters,10000) && r.distance_meters > 0 && number(lighting.unknown_meters,10000));
      requireValue(Math.abs(lighting.known_meters + lighting.unknown_meters - r.distance_meters) < .05);
      requireValue(geometry.type === "LineString" && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2 && geometry.coordinates.length <= 20000);
      for (const point of geometry.coordinates) requireValue(Array.isArray(point) && point.length === 2 && typeof point[0] === "number" && Number.isFinite(point[0]) && Math.abs(point[0]) <= 180 && typeof point[1] === "number" && Number.isFinite(point[1]) && Math.abs(point[1]) <= 90);
      requireValue(Array.isArray(r.endpoint_offsets_meters) && r.endpoint_offsets_meters.length === 2 && r.endpoint_offsets_meters.every(v => number(v,100)));
    } else {
      requireValue(r.status === "unsupported" && r.geometry === null && r.distance_meters === null && r.endpoint_offsets_meters === null && lighting.unknown_meters === null && lighting.known_meters === 0 && r.nearby_phones.length === 0 && r.historical_reports.length === 0);
    }
    const phones = new Set<string>(), reports = new Set<string>();
    for (const value of r.nearby_phones) {
      const phone = record(value);
      requireValue(text(phone.phone_id) && !phones.has(phone.phone_id) && text(phone.location) && number(phone.distance_meters,50) && url(phone.source_url) && phone.operational_status === "unknown");
      phones.add(phone.phone_id);
    }
    for (const value of r.historical_reports) {
      const report = record(value);
      requireValue(text(report.report_id) && !reports.has(report.report_id) && text(report.location) && text(report.reported_date) && /^\d{4}-\d{2}-\d{2}$/.test(report.reported_date) && text(report.offense) && text(report.disposition) && url(report.source_url) && report.match_method === "exact_named_endpoint_place");
      requireValue([r.origin,r.destination].some(place => typeof place === "string" && place.trim().toLowerCase() === (report.location as string).trim().toLowerCase()));
      reports.add(report.report_id);
    }
  }
  return structuredClone(snapshot) as RouteEvidence[];
}

export function getRouteEvidence(corridorId: string, snapshot: unknown): RouteEvidence | null {
  return parseRouteEvidence(snapshot).find(row => row.corridor_id === corridorId) ?? null;
}
