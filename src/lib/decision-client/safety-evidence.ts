/** Pure public-data sidecar. A policy block is not a crime prediction or safety guarantee. */
import { closureEvidence, currentWeather, isCurrentWeather, parseSnapshot, record, type Snapshot, type Source } from "../campus-evidence/evidence";
import { parseRouteEvidence, type RouteEvidence } from "./route-evidence";
import { summarizeHistoricalLighting, type HistoricalLightingSummary } from './historical-lighting';
import { assessJourneyReadiness } from './journey-readiness';

export const SAFETY_EVIDENCE_VERSION = "beacon-safety-evidence-v1" as const;
const HOUR = 3_600_000, DAY = 24 * HOUR;
const DATASETS = ["crime", "lighting", "activity", "closures", "emergency-equipment", "notices", "weather"] as const;
export type SafetyDatasetName = typeof DATASETS[number];
export type SafetyEvidenceInput = {
  corridorId: string;
  evaluatedAt: string;
  /** Required to use a mapped path for a closure block; comes from the walking candidate. */
  expectedRouteVersion?: string;
  /** Existing routeConditions(corridorId, now) result; asserted block flags are not trusted. */
  routeConditions?: unknown;
  /** Existing loadDataset(name) results. Read once in the server; this function never fetches. */
  campusDatasets?: Partial<Record<SafetyDatasetName, unknown>>;
  historicalLighting?: unknown;
};
type ValidDataset = Snapshot & { version: string; coverage: string; metadata: Record<string, unknown> };
type FreshnessStatus = "current_snapshot" | "historical_snapshot" | "stale" | "invalid" | "unavailable";
export type SafetyEvidence = {
  schemaVersion: typeof SAFETY_EVIDENCE_VERSION;
  corridorId: string;
  evaluatedAt: string;
  routeVersion: string | null;
  confidence: "partial" | "unavailable";
  routeExposureScore: null;
  scoreStatus: "unavailable";
  scoreExplanation: string;
  coverage: {
    geometry: "supported" | "unsupported" | "stale_or_invalid";
    incidentHistory: "partial_historical" | "unavailable";
    measuredLightingFraction: null;
    currentActivityFraction: null;
    providerReliability: "unavailable";
  };
  freshness: Record<SafetyDatasetName, { status: FreshnessStatus; capturedAt: string | null; validUntil: string | null }>;
  sourceProvenance: (Source & { dataset: SafetyDatasetName; version: string })[];
  routeSource: { url: string; version: string; capturedAt: string; validUntil: string } | null;
  hardBlocks: {
    walkingPathClosed: true | null;
    severeWeather: true | null;
    appliesTo: "walking_only";
    validUntil: string | null;
    matchingClosureIds: string[];
  };
  weather: ReturnType<typeof currentWeather>;
  incidents: {
    publishedRecordCount: number | null;
    endpointMatchCount: number | null;
    matchMethod: "exact_named_endpoint_place";
    coverage: "partial_historical" | "unavailable";
    completeCrimeCoverage: false;
    matchedReports: { reportId: string; reportedDate: string; location: string; offense: string; disposition: string; sourceUrl: string }[];
  };
  lighting: { status: "community_unverified" | "unavailable"; mapObjectCount: number | null; measuredRouteMeters: null; attribution: string | null; attributionUrl: string | null };
  historicalLighting: HistoricalLightingSummary | null;
  walkingAlternativeReadiness: ReturnType<typeof assessJourneyReadiness> | null;
  activity: { status: "historical_2015" | "unavailable"; historicalSiteCount: number | null; currentRouteCount: null };
  warnings: string[];
  missingSignals: string[];
};

function timestamp(value: unknown): number {
  // Require a timezone; date-only publication dates are handled separately below.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const dateOnly = value.slice(0, 10), day = Date.parse(`${dateOnly}T00:00:00Z`);
  return Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === dateOnly ? Date.parse(value) : NaN;
}
function text(value: unknown, max = 2000): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function official(url: string, host: string, path?: string) {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && u.hostname === host && (!path || u.pathname.startsWith(path)); } catch { return false; }
}
function validateDataset(value: unknown, name: SafetyDatasetName, now: number): ValidDataset {
  const snapshot = parseSnapshot(value, name), raw = record(value), captured = timestamp(snapshot.captured_at);
  if (!Number.isFinite(captured) || captured > now || !text(raw.version) || !/^[a-f0-9]{64}$/.test(raw.version) || !text(raw.coverage)) throw new Error("Invalid dataset version or capture time");
  const sources = snapshot.sources;
  // Crime manifests mark the start of a multi-document import; source captures may follow it.
  if (sources.some(s => !Number.isFinite(timestamp(s.captured_at)) || timestamp(s.captured_at) > now || !text(s.coverage) || !text(s.limitations))) throw new Error("Invalid source capture time");
  const sourceFor = (row: Record<string, unknown>) => sources.find(s => s.url === row.source_url && (row.source_hash === undefined || s.sha256 === row.source_hash));
  if (name === "weather" || name === "closures" || name === "crime" || name === "activity") {
    if (snapshot.records.some(r => !sourceFor(r))) throw new Error("Row source does not match provenance");
  }
  if (name === "weather") {
    if (sources.some(s => !official(s.url, "api.weather.gov")) || snapshot.records.some(r => !text(r.context_version, 500) || !text(r.corridor_id, 100) || !["clear", "rain", "severe", "unknown"].includes(String(r.weather)) || !Number.isFinite(timestamp(r.updated_at)) || timestamp(r.updated_at) > captured || !Number.isFinite(timestamp(r.valid_from)) || !(timestamp(r.valid_until) > timestamp(r.valid_from)))) throw new Error("Invalid weather provenance or interval");
  }
  if (name === "closures") {
    if (sources.some(s => !official(s.url, "arcgis-central.gis.vt.edu", "/arcgis/rest/services/facilities/"))) throw new Error("Closure source is not the campus authority");
    for (const r of snapshot.records) {
      if (!text(r.id, 200) || !["area", "road"].includes(String(r.kind))) throw new Error("Invalid closure record");
      if (r.kind === "area" && (!Number.isFinite(timestamp(r.starts_at)) || !(timestamp(r.ends_at) > timestamp(r.starts_at)) || !official(String(r.source_url), "arcgis-central.gis.vt.edu", "/arcgis/rest/services/facilities/Construction_Closures/"))) throw new Error("Invalid area closure source or interval");
    }
  }
  if (name === "crime") {
    const ids = new Set<string>();
    for (const r of snapshot.records) {
      if (!text(r.record_id) || ids.has(r.record_id) || !text(r.report_id) || !text(r.location) || !text(r.offense) || !text(r.disposition) || !text(r.reported_date) || !/^\d{4}-\d{2}-\d{2}$/.test(r.reported_date) || !Number.isFinite(Date.parse(r.reported_date)) || new Date(r.reported_date).toISOString().slice(0, 10) !== r.reported_date || !official(String(r.source_url), "police.vt.edu") || !/^[a-f0-9]{64}$/.test(String(r.source_hash))) throw new Error("Invalid historical report");
      ids.add(r.record_id);
    }
  }
  if (name === "lighting" && (raw.coverage !== "community_unverified" || snapshot.records.some(r => r.verification !== "community_unverified" || r.source !== "openstreetmap" || !official(String(r.source_url), "www.openstreetmap.org")))) throw new Error("Lighting is not a measured dataset");
  if (name === "activity" && (raw.coverage !== "historical_2015" || snapshot.records.some(r => r.observation_year !== 2015 || r.temporal_status !== "historical"))) throw new Error("Activity source is not current route measurement");
  return { ...snapshot, version: raw.version, coverage: raw.coverage, metadata: raw.metadata === undefined ? {} : record(raw.metadata) };
}

/** No network, ranking mutation, student location, identity or trusted-contact input. */
export function buildSafetyEvidence(input: SafetyEvidenceInput): SafetyEvidence {
  const now = timestamp(input.evaluatedAt);
  if (!Number.isFinite(now) || !["newman-pritchard", "eggleston-pritchard", "downtown-pritchard"].includes(input.corridorId)) throw new Error("A supported named corridor and timezone-qualified evaluation time are required");
  const warnings: string[] = [], valid: Partial<Record<SafetyDatasetName, ValidDataset>> = {};
  let historicalLighting: HistoricalLightingSummary | null = null;
  if (input.historicalLighting !== undefined) {
    try {
      historicalLighting = summarizeHistoricalLighting(input.historicalLighting);
      if (Date.parse(historicalLighting.capturedAt) > now) historicalLighting = null;
    } catch { warnings.push('Historical measured lighting is unavailable or invalid.'); }
  }
  const freshness = {} as SafetyEvidence["freshness"];
  const sourceProvenance: SafetyEvidence["sourceProvenance"] = [];
  for (const name of DATASETS) {
    const value = input.campusDatasets?.[name];
    freshness[name] = { status: value == null ? "unavailable" : "invalid", capturedAt: null, validUntil: null };
    if (value == null) continue;
    try {
      const dataset = validateDataset(value, name, now);
      valid[name] = dataset;
      // Dataset capture cannot renew older source bytes. History has no implied live TTL.
      const ttl = name === "closures" ? HOUR : name === "weather" ? DAY : null;
      const expires = ttl === null ? null : Math.min(timestamp(dataset.captured_at), ...dataset.sources.map(s => timestamp(s.captured_at))) + ttl;
      freshness[name] = { status: expires === null ? "historical_snapshot" : expires > now ? "current_snapshot" : "stale", capturedAt: dataset.captured_at, validUntil: expires === null ? null : new Date(expires).toISOString() };
      sourceProvenance.push(...dataset.sources.map(s => ({ ...s, dataset: name, version: dataset.version })));
    } catch { warnings.push(`${name}: source evidence is invalid or unavailable.`); }
  }

  let route: RouteEvidence | null = null;
  try {
    const conditions = record(input.routeConditions);
    if (conditions.corridorId !== input.corridorId || timestamp(conditions.asOf) !== now) throw new Error("Mismatched route conditions");
    const parsed = parseRouteEvidence([conditions.route])[0];
    if (parsed.corridor_id !== input.corridorId || !official(parsed.source_url, "arcgis-central.gis.vt.edu") || !Number.isFinite(timestamp(parsed.captured_at)) || timestamp(parsed.captured_at) > now || now - timestamp(parsed.captured_at) >= 7 * DAY) throw new Error("Route stale or unrelated");
    const avoidance = parsed.construction_avoidance;
    if (avoidance?.status === "applied" && (!(timestamp(avoidance.evaluated_at) <= now) || !(timestamp(avoidance.valid_until) > now) || !Number.isFinite(timestamp(avoidance.source_snapshot_captured_at)) || avoidance.sources.some(s => !Number.isFinite(timestamp(s.captured_at)) || !official(s.url, "arcgis-central.gis.vt.edu")))) throw new Error("Construction-derived geometry expired or malformed");
    route = parsed;
  } catch { warnings.push("Mapped route evidence is missing, stale or does not match this trip."); }
  const versionMatches = route !== null && input.expectedRouteVersion === route.source_version;
  const path = route?.status === "supported" && versionMatches ? route.geometry!.coordinates : null;
  let walkingAlternativeReadiness: ReturnType<typeof assessJourneyReadiness> | null = null;
  if (path && route) {
    const segments = path.slice(1).map(([lng, lat], i) => {
      const [previousLng, previousLat] = path[i], radians = Math.PI / 180;
      const h = Math.sin((lat - previousLat) * radians / 2) ** 2
        + Math.cos(lat * radians) * Math.cos(previousLat * radians) * Math.sin((lng - previousLng) * radians / 2) ** 2;
      return { segmentId: `segment:${i}`, lengthMeters: 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) };
    }).filter(segment => segment.lengthMeters > 0);
    if (segments.length) {
      const inventory = { routeId: route.corridor_id, routeVersion: route.source_version, segments };
      walkingAlternativeReadiness = assessJourneyReadiness({ evaluatedAt: input.evaluatedAt,
        expectedRoute: inventory, observedRoute: inventory, lightingRequired: true, pickup: { kind: 'walk' } });
    }
  }
  if (route?.status === "supported" && !versionMatches) warnings.push("Walking map version is unconfirmed; closure evidence cannot block this path.");

  const weather = currentWeather(freshness.weather.status === "current_snapshot" ? valid.weather : undefined, input.corridorId, now);
  if (isCurrentWeather(weather, now)) {
    weather.validUntil = new Date(Math.min(Date.parse(weather.validUntil), Date.parse(freshness.weather.validUntil!))).toISOString();
    freshness.weather.validUntil = weather.validUntil;
  }
  const closures = closureEvidence(freshness.closures.status === "current_snapshot" ? valid.closures : undefined, path, now);
  const closed = closures.blocked;
  const severe = isCurrentWeather(weather, now) && weather.condition === "severe" ? true : null;
  const routeUntil = route ? Math.min(timestamp(route.captured_at) + 7 * DAY, route.construction_avoidance?.status === "applied" ? timestamp(route.construction_avoidance.valid_until) : Infinity) : null;
  const deadlines = [closed && closures.validUntil, severe && weather.validUntil, closed && freshness.closures.validUntil, closed && routeUntil !== null && new Date(routeUntil).toISOString()].filter((d): d is string => typeof d === "string").map(Date.parse);
  if (closed) warnings.push("A current official closure overlaps this mapped walking path. Choose another option.");
  else warnings.push("No current route-wide closure clearance is established.");
  if (severe) warnings.push("Current NWS severe-weather evidence rules out walking-only travel under Beacon's policy.");
  if (weather.status !== "current" || weather.condition === "unknown") warnings.push("Current weather is unknown; check conditions before leaving.");

  const crime = valid.crime;
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const endpoints = route?.status === "supported" ? [route.origin, route.destination].map(normalize) : [];
  const matched = crime?.records.filter(r => {
    if (!String(r.reported_date).startsWith("2026-") || Date.parse(String(r.reported_date)) > now) return false;
    return [String(r.location), ...Array.from(String(r.location).matchAll(/\(([^()]+)\)/g), m => m[1])].some(p => endpoints.includes(normalize(p)));
  }) ?? [];
  warnings.push("Crime logs are partial historical reports; endpoint matches do not cover the entire path or predict safety.");
  if (valid.lighting) warnings.push("OpenStreetMap lighting tags are community reports, not measured brightness or working-lamp checks.");
  if (valid.activity) warnings.push("Pedestrian counts are from 2015 sites, not people currently on this route.");
  warnings.push("No safety score is available: measured route lighting and current route activity are missing.");
  return {
    schemaVersion: SAFETY_EVIDENCE_VERSION, corridorId: input.corridorId, evaluatedAt: new Date(now).toISOString(),
    routeVersion: route?.source_version ?? null, confidence: route || sourceProvenance.length ? "partial" : "unavailable",
    routeExposureScore: null, scoreStatus: "unavailable",
    scoreExplanation: "A route exposure number needs current, measured route coverage. Community lighting tags, old pedestrian counts and partial crime reports cannot supply it.",
    coverage: { geometry: route?.status ?? "stale_or_invalid", incidentHistory: crime ? "partial_historical" : "unavailable", measuredLightingFraction: null, currentActivityFraction: null, providerReliability: "unavailable" },
    freshness, sourceProvenance,
    routeSource: route ? { url: route.source_url, version: route.source_version, capturedAt: route.captured_at, validUntil: new Date(routeUntil!).toISOString() } : null,
    hardBlocks: { walkingPathClosed: closed, severeWeather: severe, appliesTo: "walking_only", validUntil: deadlines.length ? new Date(Math.min(...deadlines)).toISOString() : null, matchingClosureIds: closures.matchingAreas.map(r => String(r.id)) },
    weather,
    incidents: { publishedRecordCount: crime?.records.length ?? null, endpointMatchCount: crime && endpoints.length ? matched.length : null, matchMethod: "exact_named_endpoint_place", coverage: crime ? "partial_historical" : "unavailable", completeCrimeCoverage: false, matchedReports: matched.map(r => ({ reportId: String(r.report_id), reportedDate: String(r.reported_date), location: String(r.location), offense: String(r.offense), disposition: String(r.disposition), sourceUrl: String(r.source_url) })) },
    lighting: { status: valid.lighting ? "community_unverified" : "unavailable", mapObjectCount: valid.lighting?.records.length ?? null, measuredRouteMeters: null, attribution: valid.lighting ? "© OpenStreetMap contributors" : null, attributionUrl: valid.lighting ? "https://www.openstreetmap.org/copyright" : null },
    historicalLighting,
    walkingAlternativeReadiness,
    activity: { status: valid.activity ? "historical_2015" : "unavailable", historicalSiteCount: valid.activity?.records.length ?? null, currentRouteCount: null },
    warnings,
    missingSignals: ["Measured route-wide illumination", "Current route pedestrian activity", "Complete incident coverage", "Observed provider completion/cancellation history", "Verified lamp and emergency-phone operating status"],
  };
}
