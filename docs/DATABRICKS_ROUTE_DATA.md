# Public campus walking-route evidence

Task 1 implementation, September 19, 2026. These are connected paths in a captured official GIS network near named public campus buildings. They are not entrance-to-entrance navigation, live closure information, verified accessible routes, or measured crime-risk estimates. The existing candidate/ranking contracts and route-context policy remain unchanged.

## Captured coverage

Source: Virginia Tech [CampusPathways_20241206](https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/MultimodalRouting_2024_12_13/MapServer/6), captured `2026-09-19T06:43:48.221432+00:00`. All 1,970 returned features are retained in `data/campus/walking-network.json`, alongside three official [building reference records](https://arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Buildings/FeatureServer/0). Source version is SHA-256 of sorted-key JSON for the fetched pathways and buildings: `48757ad69e82725756b62d27130656ce40b83ec8ae2a3c77873bc18138f8e641`. This timestamp is retrieval time, not a certification that the underlying 2024-named network is current.

| Corridor | Network path length | Origin / destination reference offsets | Phones within 50 m | Selected reports matched to endpoint names |
| --- | ---: | ---: | ---: | --- |
| Newman Library → Pritchard Hall | 1,055.05 m | 42.13 / 2.74 m | 3 | 2026-15271, 2026-15354 |
| Eggleston Hall - East Wing → Pritchard Hall | 604.26 m | 6.29 / 2.74 m | 1 | 2026-15354 |
| Downtown Blacksburg → Pritchard Hall | Unsupported | Unknown | Not evaluated | Not evaluated |

Downtown has no named reference endpoint in this bounded official campus dataset. Its null geometry/distance are intentional; zero resources or reports must not be inferred from an unsupported route. This does not alter the team's separate simulated downtown provider scenario.

## Method and limitations

`route_data.py` creates an undirected weighted graph using consecutive coordinates from the official pathway lines. Edges connect only when their vertices are exactly equal; geometric crossings, near misses, disconnected components and building offsets are never joined with fabricated straight lines. `NotADA` segments are excluded because the source domain explicitly includes barriers or very steep paths. Other classifications, including unknown, do not certify accessibility. No slope weighting or accessibility guarantee is added.

For each building pair, choose the nearest existing vertex per connected component within 100 m of each official reference coordinate, then choose the shared component with the smallest sum of endpoint offsets. Dijkstra finds the shortest great-circle edge-length path between those vertices. The returned geometry contains only existing network segments. Endpoint offsets are disclosed separately and excluded from route length; the building-reference-to-path connection has not been verified. Newman's individually nearest vertex belongs to an isolated three-vertex component, so the nearest shared-component vertex is used instead. The filtered captured graph has 7,752 vertices and 44 components. This is the shortest path under this bounded graph/anchor policy, not a claim of the best route in the physical world.

Emergency phones use the existing official snapshot (`emergency-phones.json`) from the [VT emergency-phone layer](https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/EmergencyAccessMappingLayers/FeatureServer/2). Minimum point-to-segment distance uses a campus-scale local equirectangular projection, with a fixed 50 m inclusion radius. Newman has phones 137 (2.36 m), 131 (2.96 m), and 149 (15.59 m); Eggleston has phone 137 (3.92 m). These are geometric proximities, not verified detours or operational devices. Device status remains `unknown`.

Historical evidence reuses the manually reviewed, incomplete 12-report [September 2026 VT police sample](https://police.vt.edu/content/dam/police_vt_edu/crime-logs/2026/file_202609.pdf), using only case-insensitive exact endpoint-place-name equality after trimming. No coordinate or path proximity is inferred for a report. The Newman report covers an occurrence range beginning in 2023; reported date does not imply occurrence date. Full source dates, dispositions, page references and coverage notes are retained. No incident density, crime probability, risk rank, or “safer” route comparison is computed. The input snapshot provenance remains in `source-manifest.json`; at build time the phones and incident sample were captured at `06:07:28Z` on September 19.

Every supported path has zero known/lit/unlit meters and all path meters explicitly lighting-unknown. The geometry source has no lighting observations. Current closures, access permissions, weather, active alerts, surface conditions, and phone operation are not established by these files. Existing fresh weather context remains separate. Public accessibility is not a blanket redistribution license: VT attribution is retained and terms need review before distributing the source network beyond the hackathon. No source endorsement is implied.

## JSON and TypeScript boundary

`data/campus/route-evidence.json` is an array (currently 3 records, about 20 KB). Each version-1 record has:

- `schema_version`, `corridor_id`, `status` (`supported` / `unsupported`), `source_version`, `captured_at`, `source_url`, `origin`, `destination`.
- `geometry`: GeoJSON LineString using longitude/latitude, or null; `distance_meters`: path-only length or null; `endpoint_offsets_meters`: two reference-to-network offsets or null.
- `lighting`: `known_meters`, `lit_meters`, `unlit_meters`, `unknown_meters` (null unknown length for unsupported routes).
- `nearby_phones`: phone ID, public location, geometric `distance_meters`, official `source_url`, `operational_status: unknown`.
- `historical_reports`: original public report fields plus `match_method: exact_named_endpoint_place`.
- `limitations`: mandatory plain-language caveats.

`src/lib/decision-client/route-evidence.ts` exports `RouteEvidence`, `parseRouteEvidence(snapshot: unknown)` and `getRouteEvidence(corridorId: string, snapshot: unknown)`. It is pure and does not load files, call services, rank options, or modify shared types. The manager-owned server boundary supplies the static JSON. Unknown corridor lookup returns null; malformed evidence throws so its caller can omit unavailable evidence. The validator bounds record counts, route lengths, coordinates, phone distances, endpoint offsets and lighting totals, rejects duplicate IDs, and requires exact coarse report matches. An unsupported record cannot contain a fabricated path or resource matches.

The source network is about 1.5 MB; use the small evidence array for runtime/model context. Network rebuild is an explicit separate step, not part of every scheduled context refresh.

## Rebuild and validation evidence

```sh
python3 databricks/ingest/route_data.py
python3 databricks/ingest/route_data.py --offline
python3 -m unittest discover -s databricks/ingest -p test_routes.py -v
node databricks/run.mjs test
npx eslint src/lib/decision-client/route-evidence.ts src/lib/decision-client/route-evidence.test.ts
```

The online command is a bounded unauthenticated read of official public GIS; offline rebuild reuses captured geometry and the current local phones/report snapshots. HTTP/GIS errors, unexpected truncation and empty graphs fail before replacing snapshots. Each output is replaced via a temporary file after successful calculation; the two-file replacement is not a transactional database operation. No new account, dependency, paid API, student data, Databricks write, commit, or deployment is used.

Tests were written before their respective Python/TypeScript modules and first failed because those modules did not exist. Final focused checks: 7 Python tests pass; 5 TypeScript route tests pass; targeted ESLint and `git diff --check` pass. Tests cover actual connected bends, disconnections, excluded barrier tags, unknown lighting, segment-based phone proximity and bounds, coarse report-name matching, named-place offset bounds, supported/unsupported validation, and every captured route segment's exact membership in the official network. The final integrated Node suite passed all 48 tests after correcting the new intelligence fixture. Actual managed-route/AI statement evidence is in [live evidence](DATABRICKS_LIVE_EVIDENCE.md); teammate UI/API integration remains separate.
