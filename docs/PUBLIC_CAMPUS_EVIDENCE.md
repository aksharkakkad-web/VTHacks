# Public campus evidence imported September 19, 2026

The new public snapshots are in `data/campus/research/`. They are separate from
Akshar's existing demo datasets, route geometry and decision contracts. They are
available to the Next.js app through the public data endpoint below. The trip
service uses currently applicable NWS weather in its decision handoff. These are
captured source snapshots, not a continuously refreshed feed.

| Dataset | Imported | Source and usable scope |
| --- | ---: | --- |
| Crime logs | 719 complete rows, 717 distinct case IDs | [VT Police monthly logs](https://police.vt.edu/crime-stats/crime-logs.html), January–September Blacksburg publication section, 9 PDFs / 79 pages. One additional row has blank source fields and is quarantined. 713 accepted rows have a reported date in the requested 2026 interval; latest September 17. |
| Lighting | 1,179 map objects | [OpenStreetMap](https://www.openstreetmap.org/copyright): 54 street lamps and 1,125 objects with a lighting tag in the bounded campus/downtown area. Community assertions; no measured brightness or current operation. |
| Pedestrian activity | 4 site summaries | [USDOT-hosted Virginia Tech study](https://rosap.ntl.bts.gov/view/dot/34766), observations from 2015, published in 2016. Historical daily statistics, not current counts and not matched to the demo paths. |
| Closures | 14 area features; road layer returned 0 | [VT Construction Closures](https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/Construction_Closures/FeatureServer/0). Source dates and geometries retained. Not every returned feature is necessarily active. |
| Emergency equipment | 65 mapped locations | [VT AED/STB equipment map](https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/AEDSTBKitLocations/FeatureServer/0), filtered to the Blacksburg area. Source status and inspection date retained; access and current operation unknown. |
| Official notices | 20 linked notice pages | First listing pages for [VT Police](https://police.vt.edu/crime-alerts.html), [campus impacts](https://www.facilities.vt.edu/campus-impacts.html) and [Blacksburg Transit](https://ridebt.org/news-alerts). One linked facilities page returned 404 and remains an explicit gap. Metadata and source links, not a live threat feed. |
| Weather | 72 hourly periods; 72 corridor/time context rows | [NWS campus reference point](https://api.weather.gov/points/37.2296,-80.4139). Forecast, precipitation probability, temperature, wind, daylight indicator and captured weather alerts. Context is usable only within its validity window and source freshness limit. |

Counts describe this import, not the number of actual crimes, working lamps, people,
currently active closures, or current hazards. All dispositions remain intact,
including unfounded reports. Printed source-date errors are flagged, not corrected
by guessing. Crime records have no inferred coordinates or numerical risk score.

## App integration

`GET /api/demo/campus-data` returns the catalog: record counts, capture times,
source URLs/hashes, coverage, limitations, current weather and explicit unknowns.
Despite the existing demo namespace, this endpoint serves real public source
records and needs no student identity or sponsor credentials.

`GET /api/demo/campus-data?dataset=<name>` returns normalized `records`, `sources`,
`captured_at`, `coverage`, `version`, `limitations` and additional `metadata`.
Names are `crime`, `lighting`, `activity`, `closures`, `emergency-equipment`,
`notices`, and `weather`. Weather metadata includes hourly forecasts and alert
records; crime metadata includes page accounting, source errors and quarantined
cells. The lighting response includes the OpenStreetMap attribution and license
in `metadata.license`; show that attribution wherever the layer is displayed.

`GET /api/demo/campus-data?corridorId=<id>` supports `newman-pritchard`,
`eggleston-pritchard` and `downtown-pritchard`. It combines existing mapped geometry
with dated closure intersections, weather and exact named-endpoint crime matches.
It returns `blocked:true` only for an intersecting area with overlapping source
dates, a closure capture no older than one hour, and route geometry no older than
seven days. No match returns `null`, not an all-clear. Downtown has no supported
geometry. The result does not describe a ride provider's pickup route.

The server decision adapters also attach these conditions to mapped walking
candidates whose corridor and map version match the imported geometry. An active
intersection sets the existing `walkingPathClosed` signal, so both local and SQL
policy exclude that walking option. A mismatched or simulated path does not
inherit the closure. During the September 19 check, the official "Improving Campus
Accessibility" area (20306, June 8–October 30 source dates) intersected both mapped
campus corridors. No alternative detour was invented.

`GET /api/trips/:id/evidence` requires the same owner cookie as the trip. It shows
the weather evidence and which plans used it; expired evidence becomes unknown.
The Student Agent first checks locally that both trip endpoints fall within the
bounded campus forecast area. It sends only the evaluation time to the snapshot
reader. Student GPS, identity, home and contact information never enter research
queries. Plans already labeled as simulated can receive the imported weather;
unknown transport provenance is never promoted to live to attach a signal.
The resulting signals enter Akshar's existing evaluator, whether using Databricks
or its explicit local fallback. Rain increases the walking component; severe
weather excludes the walking-only option under that policy. Forecast expiry also
expires the affected recommendation, requiring refresh before booking.

No separate safety agent is registered with ANS. Safety evidence is an internal
capability. Existing ANS provider identity and permission checks are unchanged.
The data API supports the frontend's map/evidence views; this change does not
implement a new visual map or pretend that the downtown route is mapped.

## Refresh and Databricks

```sh
python3 databricks/ingest/public_sources.py
# Bounded individual refresh, useful before a demo:
python3 databricks/ingest/public_sources.py --datasets closures,weather
```

Each of those datasets is validated before atomic replacement. A failure keeps
the previous bytes and capture time and records the failed attempt separately.
Old snapshots stay historical; rerunning the app never renews their validity.
Lighting and activity are documented source captures, not scheduled refreshes.
See [crime extraction and replay](PUBLIC_CRIME_IMPORT.md),
[lighting/activity research](PUBLIC_LIGHTING_ACTIVITY_RESEARCH.md), and
[Databricks import](PUBLIC_EVIDENCE_DATABRICKS.md) for their exact procedures.

The separate Databricks importer previews without credentials and supports an
explicit `--apply` to additive, versioned tables. No cloud upload has been run from
this checkout: host, warehouse and an authenticated token/profile are missing.
The linked Vercel production project also had no Databricks variables when checked
September 19. Local app availability does not prove a live warehouse import.

```sh
node databricks/public-evidence.mjs
node --test databricks/public-evidence.test.mjs
bash src/agents/test.sh
node databricks/run.mjs test
python3 -m unittest discover -s databricks/ingest -p 'test_*.py' -v
./scripts/pre-pr.sh
```

Crime PDF tests require `pdfplumber`. The bundled Codex Python runtime was used for
those checks on this machine; no dependency was silently added to the app.
The completed validation run passed 67 agent tests, 48 Databricks/decision tests,
53 Python ingestion tests, 12 research-upload tests and 4 checkpoint tests, plus
lint, typecheck and production build. Production-build HTTP checks served all seven
datasets and three corridor readouts; invalid dataset/path parameters were rejected
and trip evidence required authentication. Serverless traces contained the required
JSON files and excluded source PDFs. Review findings were reproduced and fixed.

## Remaining evidence gaps

There is no verified current pedestrian-count feed, complete historical crime
coverage, measured route-wide illumination, live lamp outage feed, or observed
provider reliability history. Official utility layers that require authentication
were not bypassed; inaccessible reports were not reconstructed. Historical counts
and community lighting tags remain useful context with those labels. Neither
absence of reports nor campus normal-operating status means a route is safe.
Generic web search is not configured as an app runtime service; these are verified
imports and bounded refresh scripts, not an unattended open-web crawler.
