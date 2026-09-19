import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from 'node:fs';
import { datasets, loadDataset, routeConditions, type Dataset } from "../campus-evidence/catalog";
import { buildSafetyEvidence, type SafetyEvidenceInput } from "./safety-evidence";

const snapshots = Object.fromEntries(datasets.map(name => [name, loadDataset(name)])) as Record<typeof datasets[number], Dataset>;
const derivedAt = routeConditions("eggleston-pritchard").route?.construction_avoidance?.evaluated_at;
const now = Math.max(derivedAt ? Date.parse(derivedAt) : 0, ...Object.values(snapshots).flatMap(s => [Date.parse(s.captured_at), ...s.sources.map(p => Date.parse(p.captured_at))])) + 1000;
const evaluatedAt = new Date(now).toISOString();
const conditions = routeConditions("eggleston-pritchard", now);
const baseline: SafetyEvidenceInput = { corridorId: "eggleston-pritchard", evaluatedAt, routeConditions: conditions, expectedRouteVersion: conditions.route!.source_version, campusDatasets: snapshots };
test('historical measurements reach the evidence view but never establish present route lighting', () => {
  const measured = JSON.parse(readFileSync('data/campus/research/lighting-measured-2026.json', 'utf8'));
  const result = buildSafetyEvidence({ ...baseline, evaluatedAt: measured.captured_at, historicalLighting: measured });
  assert.equal(result.historicalLighting?.measurements, 72);
  assert.equal(result.historicalLighting?.operationalLightingVerified, false);
  assert.equal(result.coverage.measuredLightingFraction, null);
  assert.equal(result.routeExposureScore, null);
});
function withDataset(name: typeof datasets[number], dataset: Dataset, overrides: Partial<SafetyEvidenceInput> = {}) {
  return { ...baseline, campusDatasets: { ...snapshots, [name]: dataset }, ...overrides };
}
function blockingFixture(): SafetyEvidenceInput {
  // Deliberate synthetic line on an actual closure boundary; independent of future detours.
  const altered = structuredClone(conditions);
  const area = snapshots.closures.records.find(r => r.id === "areas:20306")!;
  const geometry = area.geometry as { type: string; coordinates: unknown[] };
  const polygon = geometry.type === "MultiPolygon" ? geometry.coordinates[0] : geometry.coordinates;
  const ring = (polygon as [number, number][][])[0];
  altered.route!.geometry = { type: "LineString", coordinates: [ring[0], ring[1]] };
  return { ...baseline, routeConditions: altered };
}

test("actual imported datasets retain counts, sources and honest unknown measurements", () => {
  const result = buildSafetyEvidence(baseline);
  assert.equal(result.incidents.publishedRecordCount, snapshots.crime.records.length);
  assert.ok(result.incidents.publishedRecordCount! > 700);
  assert.equal(result.incidents.completeCrimeCoverage, false);
  assert.equal(result.incidents.coverage, "partial_historical");
  assert.equal(result.lighting.mapObjectCount, snapshots.lighting.records.length);
  assert.equal(result.lighting.status, "community_unverified");
  assert.equal(result.walkingAlternativeReadiness?.availabilityImpact, 'none');
  assert.equal(result.walkingAlternativeReadiness?.lighting.state, 'unknown');
  assert.equal(result.walkingAlternativeReadiness?.pickup.status, 'not_applicable');
  assert.equal(result.lighting.attribution, "© OpenStreetMap contributors");
  assert.equal(result.activity.historicalSiteCount, snapshots.activity.records.length);
  assert.equal(result.activity.status, "historical_2015");
  assert.equal(result.routeExposureScore, null);
  assert.equal(result.coverage.measuredLightingFraction, null);
  assert.equal(result.coverage.currentActivityFraction, null);
  assert.equal(result.activity.currentRouteCount, null);
  assert.equal(result.freshness.crime.status, "historical_snapshot");
  assert.ok(result.sourceProvenance.some(p => p.dataset === "crime" && p.sha256 === snapshots.crime.sources[0].sha256));
  assert.ok(result.warnings.some(w => w.includes("partial historical")));
  assert.ok(result.warnings.some(w => w.includes("2015")));
});

test("fresh official closure intersection is recomputed and expiry is bounded", () => {
  assert.equal(buildSafetyEvidence(baseline).hardBlocks.walkingPathClosed, conditions.closures.blocked);
  const result = buildSafetyEvidence(blockingFixture());
  assert.equal(result.hardBlocks.walkingPathClosed, true);
  assert.ok(result.hardBlocks.matchingClosureIds.includes("areas:20306"));
  assert.ok(Date.parse(result.hardBlocks.validUntil!) <= Date.parse(snapshots.closures.captured_at) + 3_600_000);
  assert.equal(result.hardBlocks.appliesTo, "walking_only");
});

test("different corridor, missing version, wrong version and stale geometry cannot carry a closure", () => {
  const input = blockingFixture();
  assert.equal(buildSafetyEvidence(input).hardBlocks.walkingPathClosed, true);
  const altered = structuredClone(input.routeConditions) as typeof conditions;
  altered.route!.captured_at = new Date(now - 8 * 86_400_000).toISOString();
  for (const variant of [
    { ...input, corridorId: "newman-pritchard" },
    { ...input, expectedRouteVersion: undefined },
    { ...input, expectedRouteVersion: "different" },
    { ...input, routeConditions: altered },
    { ...input, routeConditions: { ...conditions, asOf: new Date(now - 1000).toISOString() } },
  ]) assert.equal(buildSafetyEvidence(variant).hardBlocks.walkingPathClosed, null);
});

test("stale snapshots and newly packaged old sources cannot renew weather or closure blocks", () => {
  const weather = structuredClone(snapshots.weather), closures = structuredClone(snapshots.closures);
  weather.sources.forEach(s => { s.captured_at = new Date(now - 2 * 86_400_000).toISOString(); });
  closures.sources.forEach(s => { s.captured_at = new Date(now - 2 * 3_600_000).toISOString(); });
  const result = buildSafetyEvidence({ ...baseline, campusDatasets: { ...snapshots, weather, closures } });
  assert.equal(result.freshness.weather.status, "stale");
  assert.equal(result.freshness.closures.status, "stale");
  assert.equal(result.weather.status, "unknown");
  assert.equal(result.hardBlocks.severeWeather, null);
  assert.equal(result.hardBlocks.walkingPathClosed, null);
  assert.equal(result.routeExposureScore, null);
});

test("only valid current same-corridor weather can set the walking severe-weather block", () => {
  const weather = structuredClone(snapshots.weather);
  const row = weather.records.find(r => r.corridor_id === baseline.corridorId && Date.parse(String(r.valid_from)) <= now && Date.parse(String(r.valid_until)) > now)!;
  assert.ok(row);
  row.weather = "severe";
  assert.equal(buildSafetyEvidence(withDataset("weather", weather)).hardBlocks.severeWeather, true);
  row.corridor_id = "newman-pritchard";
  assert.equal(buildSafetyEvidence(withDataset("weather", weather)).hardBlocks.severeWeather, null);
  row.corridor_id = baseline.corridorId;
  row.valid_until = evaluatedAt;
  assert.equal(buildSafetyEvidence(withDataset("weather", weather)).hardBlocks.severeWeather, null);
});

test("missing provenance, future timestamps and malformed intervals never create blocks", () => {
  const mutations: ((d: Dataset) => void)[] = [
    d => { d.version = "unknown"; },
    d => { d.captured_at = new Date(now + 1000).toISOString(); },
    d => { d.sources[0].captured_at = "2026-02-30T12:00:00Z"; },
    d => { d.sources[0].sha256 = "missing"; },
    d => { d.records[0].source_url = "https://example.org/forged"; },
    d => { d.records[0].ends_at = "invalid"; },
  ];
  for (const mutate of mutations) {
    const closure = structuredClone(snapshots.closures); mutate(closure);
    const result = buildSafetyEvidence(withDataset("closures", closure));
    assert.equal(result.hardBlocks.walkingPathClosed, null);
    assert.equal(result.freshness.closures.status, "invalid");
  }
  const weather = structuredClone(snapshots.weather);
  weather.records.forEach(r => { r.weather = "severe"; r.context_version = ""; });
  assert.equal(buildSafetyEvidence(withDataset("weather", weather)).hardBlocks.severeWeather, null);
});

test("untrusted precomputed block flags cannot create a closure without source records", () => {
  const noClosures = structuredClone(snapshots.closures); noClosures.records = [];
  const result = buildSafetyEvidence(withDataset("closures", noClosures, { routeConditions: { ...conditions, closures: { blocked: true, validUntil: new Date(now + 3_600_000).toISOString() } } }));
  assert.equal(result.hardBlocks.walkingPathClosed, null);
  assert.ok(result.warnings.some(w => w.includes("No current route-wide closure clearance")));
});

test("unsupported downtown geometry and empty evidence remain unknown, never safe or zero", () => {
  const downtown = buildSafetyEvidence({ ...baseline, corridorId: "downtown-pritchard", routeConditions: routeConditions("downtown-pritchard", now) });
  assert.equal(downtown.coverage.geometry, "unsupported");
  assert.equal(downtown.hardBlocks.walkingPathClosed, null);
  assert.equal(downtown.incidents.endpointMatchCount, null);
  const empty = buildSafetyEvidence({ corridorId: baseline.corridorId, evaluatedAt });
  assert.equal(empty.confidence, "unavailable");
  assert.equal(empty.incidents.publishedRecordCount, null);
  assert.equal(empty.lighting.mapObjectCount, null);
  assert.equal(empty.routeExposureScore, null);
  assert.deepEqual(empty.sourceProvenance, []);
});

test("crime matching preserves disposition and excludes guessed place or future report dates", () => {
  const crime = structuredClone(snapshots.crime);
  crime.records = [
    { ...crime.records[0], record_id: "fixture-1", location: "Pritchard Hall", disposition: "Unfounded", reported_date: "2026-09-01" },
    { ...crime.records[0], record_id: "fixture-2", location: "near Pritchard", reported_date: "2026-09-01" },
    { ...crime.records[0], record_id: "fixture-3", location: "Pritchard Hall", reported_date: "2027-09-01" },
  ];
  const result = buildSafetyEvidence(withDataset("crime", crime));
  assert.equal(result.incidents.endpointMatchCount, 1);
  assert.equal(result.incidents.matchedReports[0].disposition, "Unfounded");
  assert.equal(result.routeExposureScore, null);
  crime.records[0].source_hash = "f".repeat(64);
  assert.equal(buildSafetyEvidence(withDataset("crime", crime)).incidents.publishedRecordCount, null);
});

test("unproven measured metadata cannot create an exposure number; impossible lengths invalidate map", () => {
  const adjusted = structuredClone(conditions);
  const distance = adjusted.route!.distance_meters!;
  adjusted.route!.lighting = { known_meters: distance, lit_meters: distance, unlit_meters: 0, unknown_meters: 0 };
  const result = buildSafetyEvidence({ ...baseline, routeConditions: adjusted });
  assert.equal(result.routeExposureScore, null);
  assert.equal(result.lighting.measuredRouteMeters, null);
  adjusted.route!.lighting.lit_meters = distance + 1;
  assert.equal(buildSafetyEvidence({ ...baseline, routeConditions: adjusted }).coverage.geometry, "stale_or_invalid");
});

test("caller must provide a real timezone-qualified instant and supported named corridor", () => {
  assert.throws(() => buildSafetyEvidence({ ...baseline, evaluatedAt: "2026-09-19" }));
  assert.throws(() => buildSafetyEvidence({ ...baseline, evaluatedAt: "2026-02-30T12:00:00Z" }));
  assert.throws(() => buildSafetyEvidence({ ...baseline, corridorId: "unknown" }));
});

test("construction-derived geometry is unavailable outside its derivation validity window", () => {
  const altered = structuredClone(conditions), closure = snapshots.closures;
  const until = new Date(Math.min(Date.parse(closure.captured_at), ...closure.sources.map(s => Date.parse(s.captured_at))) + 3_600_000).toISOString();
  altered.route!.construction_avoidance = { algorithm_version: "official-network-construction-avoidance-v1", status: "applied", evaluated_at: evaluatedAt, valid_until: until, source_snapshot_captured_at: closure.captured_at, source_snapshot_version: closure.version, excluded_area_ids: ["areas:20306"], sources: closure.sources.map(s => ({ url: s.url, sha256: s.sha256, captured_at: s.captured_at, coverage: s.coverage })), reason: null };
  assert.equal(buildSafetyEvidence({ ...baseline, routeConditions: altered }).coverage.geometry, "supported");
  assert.equal(buildSafetyEvidence({ ...baseline, routeConditions: altered }).routeSource!.validUntil, until);
  for (const time of [new Date(now - 1000).toISOString(), until]) {
    const result = buildSafetyEvidence({ ...baseline, evaluatedAt: time, routeConditions: { ...altered, asOf: time } });
    assert.equal(result.coverage.geometry, "stale_or_invalid");
    assert.equal(result.hardBlocks.walkingPathClosed, null);
    assert.equal(result.routeExposureScore, null);
  }
});
