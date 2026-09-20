# Public campus walking-route evidence

**Latest wider-pilot result:** The separate [draft Town/VT coverage matrix](DATABRICKS_PILOT_COVERAGE.md) checks 25 forward and 25 reverse directions: 10 have connected sourced geometry, 40 explicitly return unsupported. Zones are unapproved and the matrix is not runtime-enabled or field-verified. It does not replace these two named campus corridors. Construction/weather were refreshed locally around 17:06 UTC and these routes rebuilt; cloud/local source versions must agree before managed use. Never treat a stale construction snapshot as current. See [current integration gates](DATABRICKS_EXPANDED_PILOT_STATUS.md).

Updated September 19, 2026: the checked-in paths now conservatively avoid currently dated published construction areas, using a separately captured official source. The paths remain connected edges in the original official GIS network near named public campus buildings. They are not entrance-to-entrance navigation, field-verified open paths, verified accessible routes, or measured crime-risk estimates.

## Captured coverage

Source: Virginia Tech [CampusPathways_20241206](https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/MultimodalRouting_2024_12_13/MapServer/6), captured `2026-09-19T06:43:48.221432+00:00`. All 1,970 returned features are retained in `data/campus/walking-network.json`, alongside three official [building reference records](https://arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Buildings/FeatureServer/0). Source version is SHA-256 of sorted-key JSON for the fetched pathways and buildings: `48757ad69e82725756b62d27130656ce40b83ec8ae2a3c77873bc18138f8e641`. This timestamp is retrieval time, not a certification that the underlying 2024-named network is current.

| Corridor | Construction-avoiding network length | Origin / destination reference offsets | Phones within 50 m | Selected reports matched to endpoint names |
| --- | ---: | ---: | ---: | --- |
| Newman Library → Pritchard Hall | 1,077.34 m | 42.13 / 2.74 m | 4 | 2026-15271, 2026-15354 |
| Eggleston Hall - East Wing → Pritchard Hall | 626.55 m | 6.29 / 2.74 m | 2 | 2026-15354 |
| Downtown Blacksburg → Pritchard Hall | Unsupported | Unknown | Not evaluated | Not evaluated |

The original standard-mode paths are 1,055.05 m and 604.26 m. Construction avoidance adds 22.29 m to each, with exactly the same network endpoints and reference offsets. Original network bytes and its `06:43:48Z` capture timestamp are unchanged.

Downtown has no named reference endpoint in this bounded official campus dataset. Its null geometry/distance are intentional; zero resources or reports must not be inferred from an unsupported route. This does not alter the team's separate simulated downtown provider scenario.

## Method and limitations

`route_data.py` creates an undirected weighted graph using consecutive coordinates from the official pathway lines. Edges connect only when their vertices are exactly equal; geometric crossings, near misses, disconnected components and building offsets are never joined with fabricated straight lines. `NotADA` segments are excluded because the source domain explicitly includes barriers or very steep paths. Other classifications, including unknown, do not certify accessibility. No slope weighting or accessibility guarantee is added.

For each building pair, choose the nearest existing vertex per connected component within 100 m of each official reference coordinate, then choose the shared component with the smallest sum of endpoint offsets. Dijkstra finds the shortest great-circle edge-length path between those vertices. The returned geometry contains only existing network segments. Endpoint offsets are disclosed separately and excluded from route length; the building-reference-to-path connection has not been verified. Newman's individually nearest vertex belongs to an isolated three-vertex component, so the nearest shared-component vertex is used instead. The filtered captured graph has 7,752 vertices and 44 components. This is the shortest path under this bounded graph/anchor policy, not a claim of the best route in the physical world.

Emergency phones use the existing official snapshot (`emergency-phones.json`) from the [VT emergency-phone layer](https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/EmergencyAccessMappingLayers/FeatureServer/2). Minimum point-to-segment distance uses a campus-scale local equirectangular projection, with a fixed 50 m inclusion radius. Newman has phones 137 (2.36 m), 131 (2.96 m), 148 (5.32 m), and 149 (15.59 m); Eggleston has phones 137 (3.92 m) and 148 (5.32 m). These are geometric proximities, not verified detours or operational devices. Device status remains `unknown`.

Historical evidence reuses the manually reviewed, incomplete 12-report [September 2026 VT police sample](https://police.vt.edu/content/dam/police_vt_edu/crime-logs/2026/file_202609.pdf), using only case-insensitive exact endpoint-place-name equality after trimming. No coordinate or path proximity is inferred for a report. The Newman report covers an occurrence range beginning in 2023; reported date does not imply occurrence date. Full source dates, dispositions, page references and coverage notes are retained. No incident density, crime probability, risk rank, or “safer” route comparison is computed. The input snapshot provenance remains in `source-manifest.json`; at build time the phones and incident sample were captured at `06:07:28Z` on September 19.

Every supported path has zero known/lit/unlit meters and all path meters explicitly lighting-unknown. The geometry source has no lighting observations. Published construction-area avoidance is described below; it does not establish all path closures, access permissions, weather, active alerts, surface conditions, or phone operation. Existing fresh weather context remains separate. Public accessibility is not a blanket redistribution license: VT attribution is retained and terms need review before distributing the source network beyond the hackathon. No source endorsement is implied.

## Conservative construction-area avoidance

`--avoid-construction` reads the existing `data/campus/research/closures.json`; it does not refresh that source. The current source is [VT Construction Closures](https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/Construction_Closures/FeatureServer/0). The source response was captured at `2026-09-19T15:08:05.497499Z`, hash `61048f6990cc9cf4d1c2c8c53355ac4ec20c74ea80ec5372a2b0ab26e56b6f9d`; the combined closure bundle was captured at `15:08:06.156856Z`.

At rebuild time, the algorithm validates official source provenance, dates, geometry and a one-hour freshness limit. It excludes existing graph edges touching or crossing any currently dated construction-area polygon, including its boundary. Polygon holes are honored; no buffer, inferred edge, crossing connector or building-entrance segment is introduced. Road-delay lines are not treated as pedestrian closures. Fourteen dated areas were considered. Dijkstra then routes between the original standard-mode network endpoints. Both resulting paths avoid all those polygons.

This is a conservative Beacon routing policy. For example, `areas:20306`, “Improving Campus Accessibility,” describes contractor mobilization for a residential-district pathway project from June 8 through October 30. Its description does not prove that every intersecting sidewalk is continuously closed. Some other area descriptions mention periodic disruption or areas remaining open. Use “avoids currently published construction areas,” not “all these sidewalks are closed” or “this detour is verified safe.”

Missing, stale, future-dated, unversioned or malformed construction snapshots produce explicitly unsupported routes in avoidance mode. A disconnected filtered graph also produces no route; the algorithm never falls back through the excluded areas. Standard mode remains explicitly available by omitting the flag.

Each derived route retains the original GIS `captured_at`. Optional `construction_avoidance` metadata records the algorithm, applied/unavailable status, calculation time, source-bundle capture/hash, individual source provenance, excluded area IDs, and expiry. Source versions hash the algorithm, original network version, construction bundle hash, active area IDs, corridor and exact output geometry/offsets. They cannot collide with the original pre-detour source version merely because the GIS source has not changed.

Current derived versions:

- Newman: `e0b3bbe11bbd7de5cce83cb83df267f09721262071c324a34a6a7e7f164f8312`.
- Eggleston: `ed90ab1fcac8f1148f9592f18938c8c75a5e7309397ae30485c5e4110d148692`.

The calculation time is `2026-09-19T15:25:41.782645Z`; avoidance expires at `2026-09-19T16:08:05.497499Z`. Validity ends at the earliest source/bundle capture plus one hour or the next known construction start/end. Runtime consumers must require `status: applied` and `evaluated_at <= current time < valid_until` before offering this derived walking candidate; they must not renew that claim just by reading an old route. Refresh the public closure snapshot and rebuild when necessary. No automatic closure refresh/rebuild schedule is introduced by this change.

## JSON and TypeScript boundary

`data/campus/route-evidence.json` is a small array (currently 3 records). Each version-1 record has:

- `schema_version`, `corridor_id`, `status` (`supported` / `unsupported`), `source_version`, `captured_at`, `source_url`, `origin`, `destination`.
- `geometry`: GeoJSON LineString using longitude/latitude, or null; `distance_meters`: path-only length or null; `endpoint_offsets_meters`: two reference-to-network offsets or null.
- `lighting`: `known_meters`, `lit_meters`, `unlit_meters`, `unknown_meters` (null unknown length for unsupported routes).
- `nearby_phones`: phone ID, public location, geometric `distance_meters`, official `source_url`, `operational_status: unknown`.
- `historical_reports`: original public report fields plus `match_method: exact_named_endpoint_place`.
- `limitations`: mandatory plain-language caveats.
- Optional `construction_avoidance`: `algorithm_version`, `status`, `evaluated_at`, `valid_until`, `source_snapshot_captured_at`, `source_snapshot_version`, `excluded_area_ids`, `sources` (`url`, `sha256`, `captured_at`, `coverage`), and nullable `reason`. An unavailable calculation requires an unsupported route and null expiry; an applied one requires validated provenance and bounded expiry. Existing records without the field remain accepted.

`src/lib/decision-client/route-evidence.ts` exports `RouteEvidence`, `parseRouteEvidence(snapshot: unknown)` and `getRouteEvidence(corridorId: string, snapshot: unknown)`. It is pure and does not load files, call services, rank options, or modify shared types. The manager-owned server boundary supplies the static JSON. Unknown corridor lookup returns null; malformed evidence throws so its caller can omit unavailable evidence. The validator bounds record counts, route lengths, coordinates, phone distances, endpoint offsets and lighting totals, rejects duplicate IDs, and requires exact coarse report matches. An unsupported record cannot contain a fabricated path or resource matches.

The source network is about 1.5 MB; use the small evidence array for runtime/model context. Network rebuild is an explicit separate step, not part of every scheduled context refresh.

## Rebuild and validation evidence

```sh
python3 databricks/ingest/route_data.py
python3 databricks/ingest/route_data.py --offline
python3 databricks/ingest/route_data.py --offline --avoid-construction
python3 -m unittest discover -s databricks/ingest -p test_routes.py -v
node databricks/run.mjs test
npx eslint src/lib/decision-client/route-evidence.ts src/lib/decision-client/route-evidence.test.ts
```

The online command is a bounded unauthenticated read of official public GIS; offline rebuild reuses captured geometry and current local phones/report snapshots, and writes only `route-evidence.json`. It never rewrites the underlying network or changes its timestamp. HTTP/GIS errors, unexpected truncation and empty graphs fail before replacing snapshots. Each output is replaced via a temporary file after successful calculation; online two-file replacement is not a transactional database operation. No new account, dependency, paid API, student data, Databricks write, commit, or deployment is used.

Focused checks now include 14 Python route tests and the additive TypeScript contract tests. They cover actual connected bends, disconnections, excluded barrier tags, unknown lighting, segment-based phone proximity, coarse report matching, endpoint offsets, every captured segment's exact network membership, polygon holes, construction detours, expiry/provenance failures, disconnected alternatives, and byte-preserving offline CLI use of the original network. Full integrated checks and actual managed-route/AI statements are reported in [live evidence](DATABRICKS_LIVE_EVIDENCE.md); a local rebuild alone does not prove cloud or UI integration.
