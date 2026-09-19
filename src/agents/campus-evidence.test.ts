import { test } from "node:test";
import { strict as assert } from "node:assert";
import { intersectsArea, currentWeather, closureEvidence, parseSnapshot } from "../lib/campus-evidence/evidence";
import { loadDataset, campusCatalog, corridorEvidence, campusWeather, withinCampusForecast, parseCrimeSnapshot } from "../lib/campus-evidence/catalog";
import { applyPublicRouteEvidence } from "../lib/campus-evidence/routing";
import { walkingOption } from "../integrations/databricks/intelligence";
import { evaluateCandidates } from "../lib/decision-client/decision";

const now = Date.parse("2026-09-19T15:00:00Z");
const polygon = { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };
const snapshot = (dataset: string, records: unknown[], captured = now) => ({ schema_version: 1, dataset, captured_at: new Date(captured).toISOString(), records, sources: [{ url: "https://api.weather.gov/points/37.2296,-80.4139", sha256: "a".repeat(64), captured_at: new Date(captured).toISOString(), row_count: records.length, coverage: "fixture", limitations: "fixture" }], limitations: ["fixture"] });

test("closure geometry detects crossings with neither endpoint inside, handles holes and rejects malformed data", () => {
  assert.equal(intersectsArea([[-1, 0.5], [5, 0.5]], polygon), true);
  assert.equal(intersectsArea([[1.5, 1.5], [2.5, 2.5]], polygon), false);
  assert.equal(intersectsArea([[5, 5], [6, 6]], polygon), false);
  assert.throws(() => intersectsArea([[0, 0], [1, 1]], { type: "Polygon", coordinates: [[]] }));
});

test("only fresh dated area closures block an intersecting route; road lines and missing dates do not", () => {
  const row = { id: "areas:1", kind: "area", name: "Construction", starts_at: new Date(now - 1000).toISOString(), ends_at: new Date(now + 1000).toISOString(), geometry: polygon, source_url: "https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/Construction_Closures/FeatureServer/0" };
  const path: [number, number][] = [[-1, 0.5], [5, 0.5]];
  assert.equal(closureEvidence(snapshot("closures", [row]), path, now).blocked, true);
  assert.equal(closureEvidence(snapshot("closures", [row], now - 3600001), path, now).blocked, null);
  assert.equal(closureEvidence(snapshot("closures", [{ ...row, ends_at: null }]), path, now).blocked, null);
  assert.equal(closureEvidence(snapshot("closures", [{ ...row, kind: "road", geometry: { type: "LineString", coordinates: path } }]), path, now).blocked, null);
  assert.equal(closureEvidence(snapshot("closures", []), path, now).blocked, null, "no all-clear from empty layer");
  assert.equal(closureEvidence(snapshot("closures", [row]), null, now).blocked, null, "no corridor geometry, no match");
});

test("current weather requires matching corridor, valid window and recent source issue time", () => {
  const row = { corridor_id: "eggleston-pritchard", weather: "rain", updated_at: new Date(now - 1000).toISOString(), valid_from: new Date(now - 1000).toISOString(), valid_until: new Date(now + 1000).toISOString(), source_url: "https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly", active_official_alert: null };
  assert.equal(currentWeather(snapshot("weather", [row]), "eggleston-pritchard", now).condition, "rain");
  assert.equal(currentWeather(snapshot("weather", [row]), "downtown-pritchard", now).condition, "unknown");
  assert.equal(currentWeather(snapshot("weather", [row]), "eggleston-pritchard", now + 1001).condition, "unknown");
  assert.equal(currentWeather(snapshot("weather", [{ ...row, updated_at: new Date(now - 86400001).toISOString() }]), "eggleston-pritchard", now).condition, "unknown");
  assert.equal(currentWeather(snapshot("weather", [row], now + 1000), "eggleston-pritchard", now).condition, "unknown");
});

test("snapshot schema rejects missing provenance and does not invent missing records", () => {
  assert.throws(() => parseSnapshot({ records: [] }, "closures"));
  assert.throws(() => parseSnapshot({ ...snapshot("closures", []), sources: [] }, "closures"));
  assert.equal(parseSnapshot(snapshot("closures", []), "closures").records.length, 0);
});

test("imported catalog serves all seven datasets with provenance, without upgrading coverage", () => {
  const catalog = campusCatalog(now);
  assert.equal(catalog.datasets.length, 7);
  assert.ok(catalog.datasets.every(d => d.count > 0 && d.sources.length > 0));
  assert.equal(loadDataset("crime").records.length, 719);
  assert.equal(loadDataset("crime").coverage, "partial");
  assert.equal(loadDataset("lighting").records.length, 1179);
  assert.equal(loadDataset("activity").records.length, 4);
  assert.equal(catalog.unknowns.currentFootTraffic, true);
  assert.equal(catalog.unknowns.crimeRiskScore, true);
  assert.throws(() => loadDataset("../../.env.local"));
});

test("corridor evidence uses only mapped geometry and preserves community/historical labels", () => {
  const mapped = corridorEvidence("eggleston-pritchard", now);
  assert.equal(mapped.route?.status, "supported");
  assert.equal(mapped.lighting.status, "unknown");
  assert.equal(mapped.activity.status, "unknown");
  assert.equal(mapped.crime.riskScore, null);
  assert.equal(corridorEvidence("downtown-pritchard", now).closures.blocked, null);
  assert.throws(() => corridorEvidence("invented-route", now));
  const weather = campusWeather(Date.parse("2030-01-01T00:00:00Z"));
  assert.equal(weather.status, "unknown");
  assert.equal(withinCampusForecast({ lat: 37.229, lng: -80.414 }), true);
  assert.equal(withinCampusForecast({ lat: 38.9, lng: -77 }), false);
});

test("a failed crime document remains a visible gap without suppressing valid months", () => {
  const existing = loadDataset("crime"), m = structuredClone(existing.metadata);
  (m.documents as unknown[]).push({ month: "2026-10", source_url: "https://police.vt.edu/missing.pdf", records: 0, pages: [], page_count: 0, gap_count: 1 });
  (m.gaps as unknown[]).push({ kind: "document_error", month: "2026-10", error: "HTTPError" });
  const parsed = parseCrimeSnapshot(existing.records, m);
  assert.equal(parsed.records.length, existing.records.length);
  assert.equal(parsed.sources.length, existing.sources.length);
  assert.equal(m.coverage, "partial");
});

test("source-bound mapped routes are rejected for official intersecting closures", () => {
  const evidence = corridorEvidence("eggleston-pritchard", now);
  assert.ok(evidence.route);
  // This test injects a synthetic closure at its own fixture clock; it does not
  // replay the independently timestamped construction-detour calculation.
  const route = { ...evidence.route, captured_at: new Date(now).toISOString(), construction_avoidance: undefined };
  const read = () => ({ ...evidence, route, geometryStatus: "supported", closures: { status: "current_snapshot" as const, blocked: true as const, matchingAreas: [{ id: "test-closure", geometry: polygon }], validUntil: new Date(now + 1000).toISOString() } });
  const option = walkingOption(route, new Date(now).toISOString());
  assert.ok(option);
  const signals = applyPublicRouteEvidence([option.candidate], { [option.candidate.planId]: option.signals }, now, read);
  assert.equal(signals[option.candidate.planId].walkingPathClosed, true);
  const result = evaluateCandidates([option.candidate], { maxBudget: 10, evaluatedAt: new Date(now).toISOString() }, signals);
  assert.equal(result.status, "NO_FEASIBLE_PLAN");
  assert.ok(result.rejected[option.candidate.planId].includes("WALKING_PATH_CLOSED"));
  const simulated = { ...option.signals, source: "simulated" as const };
  assert.equal(applyPublicRouteEvidence([option.candidate], { [option.candidate.planId]: simulated }, now, read)[option.candidate.planId].walkingPathClosed, undefined);
  const mismatched = { ...option.signals, dataVersion: "different-map" };
  assert.equal(applyPublicRouteEvidence([option.candidate], { [option.candidate.planId]: mismatched }, now, read)[option.candidate.planId].walkingPathClosed, undefined);
});
