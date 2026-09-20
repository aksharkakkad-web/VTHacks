# Task 4 completion report — draft pilot network

## Outcome

Created an offline, proposed/unapproved 5-departure × 5-destination pedestrian network matrix with both directions: **50 directional results, 10 supported, 40 unsupported**. It is not wired into the application. The supported five forward pairs and their five reverses all involve BT stop 1422 (Main/Collegiate Ct Sbnd) and one of five campus/residential destination stops. No missing crosswalk or component gap was connected with a fabricated line. Unsupported rows have null path, distance, time and offsets.

## Owned files and sources

- `databricks/ingest/pilot_coverage.py`, `databricks/ingest/test_pilot_coverage.py`
- `data/campus/pilot/draft-zones.json`, `town-existing-wgs84.json`, `coverage-matrix.json`
- `docs/DATABRICKS_PILOT_COVERAGE.md`

Town official Existing layer 0 captured 2026-09-19 17:09:10 UTC: 1,083 features, 1,083 unique IDs, 984 admitted pedestrian-compatible features (693 Sidewalk + 291 Trail). Excluded: 66 Bike Lane, 17 Sharrow, 7 Alley, 4 Trail Tunnel, 2 Share the Road, 1 Bridge, 1 Contra Flow Lane, 1 Stairs. Layer 1 Proposed was not queried. Town source snapshot SHA-256 `5d7cd30760ecad94a2db095b86e57aa89de4181af6c50c24d48566be3de40b55`. Existing VT snapshot: 1,970 features, SHA-256 `cb09b7784a13be0f8d92a699176ec4f24fb28c90c6b25b73482b5f3cafcadd16`. BT stops snapshot SHA-256 `1080ed24b57493a0c3c5355e74493b99073d6dce9f7435959fd90418078b10b8`. Combined eligible graph: 29,900 vertices and 29,770 undirected edges. Full attribution, official URLs, anchor IDs and limitations are in the owned documentation.

## Decisions / assumptions / limits

- Draft departures are BT stop IDs 1600, 1500, 1501, 1502, 1422; destinations are 1146, 1126, 1154, 1122, 1115. All ten are distinct, named official stop points. These are proposal inputs, **not** team-approved zones or confirmed entrances.
- Only exact shared coordinates link Town/VT source geometry. Town features must be `Status=Existing` and `Type=Sidewalk|Trail`. The existing VT graph builder excludes `NotADA`; remaining geometry is not an accessibility clearance.
- A reference stop may be mapped to an existing vertex within 100 meters. Its offset is reported and excluded from route geometry/distance/time; no connecting path is claimed. Walking estimate assumes 80 m/min. Current passability, closures, crossings absent from source, lighting, accessibility and entrances are unknown.
- Public-source redistribution terms and current source freshness need review before an operational pilot. No runtime, shared type, API, UI, cloud or production changes.

## TDD and checks

- RED: initial pilot test module failed while `pilot_coverage` was absent. After first implementation, disconnected fixture failed because it unintentionally placed the destination within the permitted 100 m mapping radius; fixture corrected. New source-coordinate validation test then failed on swapped coordinates before the bounds check was implemented. Duplicate-anchor test failed before duplicate coordinates were rejected.
- GREEN: `python3 -m unittest discover -s databricks/ingest -p test_pilot_coverage.py -v` — 5/5 pass. Existing `test_routes.py` — 14/14 pass. `python3 databricks/ingest/pilot_coverage.py --offline` — 1,083 source / 984 eligible / 50 directional / 10 supported. `python3 -m py_compile` — pass. `git diff --check` — pass.
- `./scripts/pre-pr.sh` — lint, checkpoint-board tests (4/4), typecheck and production Next.js build passed. Other agents' unrelated files were not staged or edited by this task.

## Integration contract and follow-up

`draft-zones.json` stays `DRAFT_PROPOSED_UNAPPROVED`. `coverage-matrix.json` has the same status and `network_coverage_not_operational_clearance` scope, counts, source hashes/timestamps, and 50 result objects (`from_id`, `to_id`, `direction`, `status`, `path`, `distance_meters`, `walking_minutes`, `end_offsets_meters`, `source_hashes`, `limitations`). Consumers must preserve unsupported/null values and cannot treat this as current or authorized walking guidance. Manager/team must decide zones and separately approve any runtime contract/activation, verify missing crossings and entrances, and establish operational freshness/accessibility/closure policy. No approval requested for a remote action.

Branch: `codex/integrated-data-finish`. Implementation commit: `dc8b92a06b68e6ec74baadb7c3878e471fb7e600` (base `aea6a97`). Report commit is the subsequent local commit containing this file.
