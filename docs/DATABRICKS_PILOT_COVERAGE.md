# Beacon draft pilot pedestrian-network coverage

Status: **DRAFT / PROPOSED / UNAPPROVED**. This is an offline network-geometry matrix, **not** an operational route clearance, team-agreed zone design, current-passability assertion, accessible route, or live product capability. No runtime loader reads these files.

## Sources and reproducibility

- Town of Blacksburg official [Paths to the Future — Existing layer 0](https://tobmaps.blacksburg.gov/server/rest/services/transportation/Paths_to_the_Future/FeatureServer/0), captured 2026-09-19 17:09:10 UTC in `data/campus/pilot/town-existing-wgs84.json` as WGS84 `outSR=4326`. SHA-256: `5d7cd30760ecad94a2db095b86e57aa89de4181af6c50c24d48566be3de40b55`. Paginated 500 records/page, count response 1,083, 1,083 unique OBJECTIDs captured. The snapshot preserves every returned feature attribute and geometry. Layer 1 is Proposed and is not queried.
- Virginia Tech official campus pathway layer 6 from `data/campus/walking-network.json`, captured previously by the route tool (1,970 features). SHA-256: `cb09b7784a13be0f8d92a699176ec4f24fb28c90c6b25b73482b5f3cafcadd16`. Its `NotADA` category is excluded by the existing VT graph builder; other classifications are not an accessibility certification. The combined eligible graph has 29,900 exact-coordinate vertices and 29,770 undirected edges.
- Official Blacksburg Transit GTFS `data/campus/transit-full/stops.json`, source feed `https://www.bt4uclassic.org/gtfs/google_transit.zip`, captured 2026-09-19 17:00:25 UTC according to its manifest. Stops-file SHA-256: `1080ed24b57493a0c3c5355e74493b99073d6dce9f7435959fd90418078b10b8`. Stop points identify proposed reference zones, not building entrances or validated boarding/egress walks.

Town `Type` values in the Existing layer: 693 Sidewalk, 291 Trail, 66 Bike Lane, 17 Sharrow, 7 Alley, 4 Trail Tunnel, 2 Share the Road, and 1 each Bridge, Contra Flow Lane, and Stairs. Only the 984 explicit Sidewalk/Trail features enter the pedestrian graph. Bike-only, mixed/ambiguous and unknown types are excluded, regardless of alternative labels. `Status=Existing` is required again on every admitted feature. Neither source establishes current closures, lighting, crossing permission, slope/accessibility, or entrance location. Public source redistribution terms require confirmation before broader distribution.

Capture and generate from the public Town service: `python3 databricks/ingest/pilot_coverage.py --capture`. Rebuild without network access: `python3 databricks/ingest/pilot_coverage.py --offline`. Both write `data/campus/pilot/coverage-matrix.json`; capture also refreshes the Town snapshot. Test: `python3 -m unittest discover -s databricks/ingest -p test_pilot_coverage.py -v`. Refresh/review all three sources before any pilot use. The capture is a static research snapshot as of the timestamps above, not a live service-state feed.

## Proposed anchors and measured result

The 5×5 pairs are evaluated in both directions (50 directional results). Each name, coordinate and ID below is from the cited BT stops snapshot; the config remains proposed and must receive team selection/approval before any integration.

| Role | BT stop ID | Official stop name |
| --- | --- | --- |
| Downtown departure | 1600 | Main/Roanoke Sbnd |
| Downtown departure | 1500 | Roanoke/Church Ebnd |
| Downtown departure | 1501 | Roanoke/Wharton Ebnd |
| Downtown departure | 1502 | Roanoke/Rutledge Ebnd |
| Downtown departure | 1422 | Main/Collegiate Ct Sbnd |
| Campus/residential destination | 1146 | Pritchard Hall |
| Campus/residential destination | 1126 | Harper Hall |
| Campus/residential destination | 1154 | English Field |
| Campus/residential destination | 1122 | Food Science Bldg |
| Campus/residential destination | 1115 | Wright House |

Measured against these exact source snapshots: **10/50 directional routes supported; 40/50 unsupported**. The 10 are Main/Collegiate Ct ↔ each of the five destination stops. The other downtown anchors have no verified connected network route to the five destinations in these source geometries. Missing crosswalks or small gaps are not bridged by a line, by proximity between components, or by Proposed infrastructure. A different source or approved zone selection can change this count; this is not a coverage promise.

Routes use shortest paths only along source segments joined at *identical* coordinate vertices. A stop reference may select an existing vertex at most 100 meters away, but the offset is reported separately and **never drawn or added to route distance/time**. Geometry is a WGS84 `[longitude, latitude]` vertex sequence; distance is the sum of haversine edge meters; walking minutes use an explicit 80 m/min estimate, not observed travel time. Reverse results reverse the actual path. Unsupported results carry `null` path, distance, walking minutes, and endpoint offsets. This is network coverage evidence only—unknown entrances, missing crossing geometry, current closures, lighting and accessibility remain unresolved.

## Integration contract (not active)

`draft-zones.json` is the sole proposed config and is never imported by current application code. `coverage-matrix.json` has `status=DRAFT_PROPOSED_UNAPPROVED`, `scope=network_coverage_not_operational_clearance`, counts, source timestamps/hashes, and 50 results. Each result has `from_id`, `to_id`, `direction`, `status`, `path`, `distance_meters`, `walking_minutes`, `end_offsets_meters`, `source_hashes`, and `limitations`. Consumers must check status and preserve `unsupported`; no frontend or decision-engine contract has been changed. Any future activation requires team zone agreement, verified entrance/crossing links, operational closure/accessibility policy and a separately approved runtime integration.
