import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRouteEvidence, parseRouteEvidence } from "./route-evidence";

const row = { schema_version: 1, corridor_id: "newman-pritchard", status: "supported", source_version: "test", captured_at: "2026-09-19T12:00:00Z", source_url: "https://example.org/path", origin: "Newman Library", destination: "Pritchard Hall", geometry: { type: "LineString", coordinates: [[-80.42,37.22],[-80.42,37.221]] }, distance_meters:111.2, lighting: {known_meters:0,lit_meters:0,unlit_meters:0,unknown_meters:111.2}, nearby_phones: [], historical_reports: [], limitations:["Unknown current conditions"], endpoint_offsets_meters: [10,20] };
test("route lookup preserves unknown lighting and exact corridor", () => {
  assert.equal(getRouteEvidence("newman-pritchard", [row])?.lighting.unknown_meters, 111.2);
  assert.equal(getRouteEvidence("other", [row]), null);
});
test("route bounds reject malformed geometry, lighting totals and proximity", () => {
  for (const invalid of [{...row,distance_meters:-1}, {...row,geometry:{type:"LineString",coordinates:[[0,91],[0,0]]}}, {...row,lighting:{...row.lighting,known_meters:200}}, {...row,nearby_phones:[{phone_id:"1",location:"public",distance_meters:51,source_url:"https://example.org",operational_status:"unknown"}]}]) {
    assert.throws(() => parseRouteEvidence([invalid]));
  }
  assert.throws(() => parseRouteEvidence([row,row]));
});
test("unsupported does not acquire a fabricated path or zero unknown length", () => {
  const unsupported = {...row,status:"unsupported",geometry:null,distance_meters:null,endpoint_offsets_meters:null,lighting:{...row.lighting,unknown_meters:null}};
  assert.equal(getRouteEvidence(row.corridor_id,[unsupported])?.status,"unsupported");
  assert.throws(() => parseRouteEvidence([{...unsupported,geometry:row.geometry}]));
});
test("historical reports require explicit coarse match and retain disposition", () => {
  const report = {report_id:"1",location:"Newman Library",reported_date:"2026-09-03",offense:"Theft",disposition:"Unfounded",source_url:"https://example.org/report",match_method:"exact_named_endpoint_place"};
  assert.equal(parseRouteEvidence([{...row,historical_reports:[report]}])[0].historical_reports[0].disposition,"Unfounded");
  assert.throws(() => parseRouteEvidence([{...row,historical_reports:[{...report,match_method:"guessed"}]}]));
});
test("captured official route evidence conforms to the runtime contract", () => {
  const rows = parseRouteEvidence(JSON.parse(readFileSync(join(process.cwd(), "data/campus/route-evidence.json"), "utf8")));
  assert.deepEqual(rows.map(r => r.status), ["supported","supported","unsupported"]);
  assert.equal(rows[0].nearby_phones.length, 4);
  assert.equal(rows[1].nearby_phones.length, 2);
  assert.equal(rows[1].historical_reports.length, 1);
});

test("construction avoidance carries bounded provenance and cannot claim an unavailable path is supported", () => {
  const avoidance = {
    algorithm_version: "official-network-construction-avoidance-v1", status: "applied", evaluated_at: "2026-09-19T15:15:00Z", valid_until: "2026-09-19T16:00:00Z",
    source_snapshot_captured_at: "2026-09-19T15:00:00Z", source_snapshot_version: "a".repeat(64), excluded_area_ids: ["areas:20306"],
    sources: [{url:"https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/Construction_Closures/FeatureServer/0/query",sha256:"b".repeat(64),captured_at:"2026-09-19T15:00:00Z",coverage:"published construction areas"}], reason: null,
  };
  assert.equal(parseRouteEvidence([{...row,construction_avoidance:avoidance}])[0].construction_avoidance?.valid_until, avoidance.valid_until);
  for (const bad of [
    {...avoidance,valid_until:"2026-09-19T16:01:00Z"}, {...avoidance,valid_until:"2026-09-19T15:14:00Z"},
    {...avoidance,source_snapshot_captured_at:"2026-09-19T15:20:00Z"}, {...avoidance,sources:[]},
    {...avoidance,excluded_area_ids:["areas:20306","areas:20306"]}, {...avoidance,source_snapshot_version:"invented"},
    {...avoidance,sources:[{...avoidance.sources[0],url:"https://untrusted.example/closures"}]},
    {...avoidance,status:"unavailable",valid_until:null,reason:"CONSTRUCTION_EVIDENCE_UNAVAILABLE"},
  ]) assert.throws(() => parseRouteEvidence([{...row,construction_avoidance:bad}]));
  const unsupported = {...row,status:"unsupported",geometry:null,distance_meters:null,endpoint_offsets_meters:null,lighting:{...row.lighting,unknown_meters:null},
    construction_avoidance:{...avoidance,status:"unavailable",valid_until:null,reason:"CONSTRUCTION_EVIDENCE_UNAVAILABLE"}};
  assert.equal(parseRouteEvidence([unsupported])[0].construction_avoidance?.status,"unavailable");
});
