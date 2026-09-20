/** Server-side readers for checked-in public evidence. No request-supplied paths or URLs. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { getRouteEvidence } from "../decision-client/route-evidence";
import { closureEvidence, currentWeather, parseSnapshot, record, type Snapshot, type Source } from "./evidence";
export { withinCampusForecast } from "./evidence";

export const datasets = ["crime", "lighting", "activity", "closures", "emergency-equipment", "notices", "weather"] as const;
export const corridors = ["newman-pritchard", "eggleston-pritchard", "downtown-pritchard"] as const;
export type Dataset = Snapshot & { coverage: string; version: string; metadata: Record<string, unknown> };
const paths = {
  crime: "crime-records-2026.json", lighting: "lighting/observations.json",
  activity: "activity/historical-pedestrian-summary-2015.json", closures: "closures.json",
  "emergency-equipment": "emergency-equipment.json", notices: "notices.json", weather: "weather.json",
} as const;
function read(path: string) {
  const bytes = readFileSync(join(process.cwd(), "data/campus/research", path));
  if (bytes.length > 8_000_000) throw new Error("Public snapshot exceeds size limit");
  return { data: JSON.parse(bytes.toString()) as unknown, hash: createHash("sha256").update(bytes).digest("hex") };
}
function source(url: unknown, sha256: unknown, captured: unknown, count: number, coverage: string, limitations: string): Source {
  return { url: String(url), sha256: String(sha256), captured_at: String(captured), row_count: count, coverage, limitations };
}

export function parseCrimeSnapshot(rows: Record<string, unknown>[], metadata: Record<string, unknown>): Snapshot {
  if (metadata.records !== rows.length || !Array.isArray(metadata.documents) || !Array.isArray(metadata.gaps)) throw new Error("Crime manifest mismatch");
  const failedMonths = new Set(metadata.gaps.map(record).filter(g => g.kind === "document_error").map(g => g.month));
  const sources = metadata.documents.map(record).filter(d => {
    // The importer retains failed requests as metadata, never as accepted bytes.
    return !(failedMonths.has(d.month) && d.records === 0 && d.page_count === 0 && Number(d.gap_count) > 0);
  }).map(d => source(d.source_url, d.source_hash, d.captured_at, Number(d.records), String(metadata.coverage), String(metadata.coverage_note)));
  const ids = new Set();
  for (const r of rows) {
    if (typeof r.record_id !== "string" || ids.has(r.record_id) || !sources.some(s => s.url === r.source_url && s.sha256 === r.source_hash)) throw new Error("Crime row provenance mismatch");
    ids.add(r.record_id);
  }
  return parseSnapshot({ schema_version: 1, dataset: "crime", captured_at: metadata.captured_at, records: rows, sources, limitations: metadata.limitations }, "crime");
}

export function loadDataset(name: string): Dataset {
  if (!(datasets as readonly string[]).includes(name)) throw new Error("Unknown public dataset");
  const key = name as typeof datasets[number], loaded = read(paths[key]);
  let value: unknown = loaded.data;
  let metadata: Record<string, unknown> = {}, coverage = "published_snapshot";
  if (["crime", "lighting", "activity"].includes(name)) {
    if (!Array.isArray(value)) throw new Error("Invalid public record array");
    const rows = value as Record<string, unknown>[];
    let sources: Source[];
    if (name === "crime") {
      metadata = record(read("crime-manifest-2026.json").data);
      sources = parseCrimeSnapshot(rows, metadata).sources;
      coverage = String(metadata.coverage);
    } else {
      metadata = record(read(`${name}/provenance.json`).data);
      const files = name === "lighting" ? metadata.files : metadata.derived_files;
      if (!Array.isArray(files) || !files.some(item => {
        const f = record(item); return (f.path ?? f.filename) === paths[key].split("/").at(-1) && f.sha256 === loaded.hash;
      })) throw new Error("Derived public data hash mismatch");
      coverage = name === "lighting" ? "community_unverified" : "historical_2015";
      sources = [source(metadata.url, metadata.sha256, metadata.captured_at, rows.length, coverage, (metadata.limitations as string[]).join(" "))];
    }
    value = { schema_version: 1, dataset: name, captured_at: metadata.captured_at, records: rows, sources, limitations: metadata.limitations };
  } else {
    const raw = record(value);
    coverage = typeof raw.coverage === "string" ? raw.coverage : coverage;
    metadata = Object.fromEntries(Object.entries(raw).filter(([k]) => !["schema_version", "dataset", "captured_at", "records", "sources", "limitations"].includes(k)));
  }
  return { ...parseSnapshot(value, name), version: loaded.hash, coverage, metadata };
}

export function campusWeather(now = Date.now()) {
  try { return currentWeather(loadDataset("weather"), "downtown-pritchard", now); }
  catch { return { status: "unknown" as const, condition: "unknown" as const }; }
}
export function campusCatalog(now = Date.now()) {
  return {
    asOf: new Date(now).toISOString(), corridors,
    datasets: datasets.map(name => {
      try {
        const d = loadDataset(name);
        return { name, status: "available", count: d.records.length, capturedAt: d.captured_at, coverage: d.coverage, version: d.version, sources: d.sources, limitations: d.limitations };
      } catch { return { name, status: "unavailable", count: 0, sources: [], limitations: ["Snapshot unavailable or invalid; no zero-event inference."] }; }
    }),
    weather: campusWeather(now),
    unknowns: { currentFootTraffic: true, verifiedRouteLighting: true, crimeRiskScore: true, completeCrimeHistory: true, observedProviderReliability: true },
  };
}
const normalizePlace = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export function routeConditions(id: string, now = Date.now()) {
  if (!(corridors as readonly string[]).includes(id)) throw new Error("Unknown public corridor");
  const route = getRouteEvidence(id, JSON.parse(readFileSync(join(process.cwd(), "data/campus/route-evidence.json"), "utf8")));
  const geometryFresh = route && Date.parse(route.captured_at) <= now && now - Date.parse(route.captured_at) <= 7 * 86400000;
  let closureSnapshot: Dataset | undefined, weather: Dataset | undefined;
  try { closureSnapshot = loadDataset("closures"); } catch { /* Remains unavailable. */ }
  try { weather = loadDataset("weather"); } catch { /* Independent source failures do not suppress closures. */ }
  return {
    corridorId: id, asOf: new Date(now).toISOString(), route,
    geometryStatus: geometryFresh ? route?.status : "stale_or_missing",
    weather: currentWeather(weather, id, now),
    closures: closureEvidence(closureSnapshot, geometryFresh ? route?.geometry?.coordinates ?? null : null, now),
    sources: { closures: closureSnapshot?.sources ?? [], weather: weather?.sources ?? [] },
  };
}
export function corridorEvidence(id: string, now = Date.now()) {
  const conditions = routeConditions(id, now), { route } = conditions;
  const crime = loadDataset("crime");
  const endpoints = route?.status === "supported" ? [route.origin, route.destination].map(normalizePlace) : [];
  const matchingReports = crime.records.filter(r => {
    if (typeof r.location !== "string" || typeof r.reported_date !== "string" || Date.parse(r.reported_date) > now || !r.reported_date.startsWith("2026-")) return false;
    const names = [r.location, ...Array.from(r.location.matchAll(/\(([^()]+)\)/g), m => m[1])].map(normalizePlace);
    return names.some(n => endpoints.includes(n));
  });
  return {
    ...conditions,
    crime: { records: matchingReports, matchMethod: "exact_named_endpoint_place", coverage: crime.coverage, riskScore: null, limitations: [...crime.limitations, "Endpoint-name matches are historical context, not incidents along the entire path."] },
    lighting: { status: "unknown", communityLayer: "/api/demo/campus-data?dataset=lighting", description: "Community lamp/lit tags are available; they do not verify route illumination or operation." },
    activity: { status: "unknown", historicalDataset: "/api/demo/campus-data?dataset=activity", description: "2015 site summaries cannot establish current route activity." },
    sources: { ...conditions.sources, crime: crime.sources },
    limitations: ["No guarantee of safety or absence of hazards.", "No geometry is inferred for downtown or for provider pickup paths.", "Only fresh dated polygon intersections can block a mapped walking path; an empty match is unknown, not an all-clear."],
  };
}
