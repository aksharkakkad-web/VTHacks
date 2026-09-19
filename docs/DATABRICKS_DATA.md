# Databricks data: what is real

This track includes reproducible official public snapshots and explicitly labeled community/historical evidence, not a live crime tracker or route-safety guarantee. Source URLs, hashes, capture timestamps, coverage and limitations are in `data/campus/source-manifest.json` and `data/campus/research/` provenance files. Student locations, names, contacts and provider credentials are not in these files.

## Current integrated expansion — September 19, 2026

Mahin's PR #14 expansion is retained intact and available through `/api/demo/campus-data`. The following supplements the original sample below; it does not convert it into complete incident coverage:

| Evidence | Captured data | Decision use |
| --- | --- | --- |
| 2026 VT crime logs | 719 accepted rows, 717 distinct IDs; nine PDFs/79 pages, one incomplete quarantined row | Historical exact-place context; not a route crime rate |
| OSM lighting | 1,179 objects:54 mapped lamps and1,125 lighting-tagged ways | Community context only; operating/brightness measurements unknown |
| Pedestrian study | Four historical summaries from2015 | Historical context, not current crowds |
| VT construction | 14 published areas with source geometry/dates | Conservative path avoidance and fresh mapped intersection blocks |
| Emergency resources | 65 AED/Stop-the-Bleed items, in addition to130 mapped phones | Public map context, not verified operation/access |
| Official notices | 20 source-page metadata records; retrieval gaps preserved | Source links only until facts are structured/validated |
| Current weather/transit | 66 NWS context records in the expanded import;448 local scheduled departures | Dated forecast and timetable windows, never live vehicles |

The native archive has2,067 typed evidence records plus reconstructable public JSON/provenance. [Native import and refresh instructions](../databricks/NATIVE_PUBLIC_IMPORT.md). The legacy12-report sample remains for backwards-compatible demonstrations; the safety sidecar uses the expanded crime dataset. Current detours are Newman1,077.34m/four nearby phones and Eggleston626.55m/two nearby phones, adding22.29m each to avoid published construction areas. Construction-derived geometry expires with its source and must be refreshed before a later demo.

Available evidence still cannot justify a numerical route-safety score: `routeExposureScore` remains null. No crowd measurement, operating-light verification or complete crime coverage is invented. [Safety evidence contract](DATABRICKS_SAFETY_EVIDENCE.md).

## Original snapshot baseline (historical counts)

Initial successful capture: **September 19, 2026, 05:55 UTC**. Counts are from that snapshot, not promises that upstream data stays unchanged.

| File in `data/campus/` | Actual contents | Correct use |
| --- | --- | --- |
| `transit-snapshot.json` | Official Blacksburg Transit GTFS, reduced to two direct stop pairs; source feed has 297 stops, 24 routes and 74,301 stop-times | Recompute service-date departures with original calendars and exceptions |
| `transit-departures.json` | 295 departures on service dates September 18–20, including trips after midnight | Scheduled options; not live arrivals or bookings |
| `transit-fares.json` | Official BT fare-free policy, $0 | Cost comparison for actual BT service, not simulated private providers |
| `emergency-phones.json` | 130 official public campus-map points in WGS84 | Show nearby mapped resources; operational status remains unknown |
| `incident-reports.json` | 12 selected public reports from pages 1–2 of the September 2026 VT crime log | Historical evidence with source/date/disposition; not a representative crime rate or danger prediction |
| `weather-hourly.json` | 72 timestamped hourly forecast periods near campus | Source-grounded weather context, refreshed before demonstration |
| `weather-alerts.json` | NWS weather alerts at capture; initially zero | Explicit weather-alert snapshot, not campus crime alerts |
| `route-context.json` | Three named corridor contexts, containing the current NWS-derived weather category | Weather affects the engine only within its explicit validity period; other safety fields stay unknown |
| `walking-network.json` | 1,970 official VT pedestrian pathway features | Source geometry for named campus paths; no student GPS or citywide routing |
| `route-evidence.json` | Two supported connected paths; downtown explicitly unsupported | Newman→Pritchard 1,055.05m/three phones within 50m; Eggleston→Pritchard 604.26m/one phone; all lighting unknown. Endpoint offsets, exact historical place matching and limitations in [route contract](DATABRICKS_ROUTE_DATA.md) |

The native refresh job does not rewrite these checked-in fixtures. It maintains a rolling six service dates of managed departures and up to 24 hours of forecast context directly in Databricks. Managed row counts include retained older versions; use current source hashes and validity windows for eligibility, not raw table counts. Static paths and the selected historical sample are intentionally not fetched on every job run.

## Real transit corridors

These are **stop-to-stop** connections; they do not claim a validated walking route from downtown or from the last stop to a residence entrance. Supply access/egress walking estimates explicitly in the calling application. Account for access walking before boarding; BT recommends reaching the stop five minutes early. Do not turn missing schedule availability into a made-up bus option.

| Corridor ID | Boarding → alighting | Sep 18 | Sep 19 | Sep 20 |
| --- | --- | ---: | ---: | ---: |
| `newman-pritchard` | Newman Library, stop `1100` → Pritchard Hall, stop `1146` | 77 | 0 | 0 |
| `eggleston-pritchard` | East Eggleston Hall, stop `1143` → Pritchard Hall, stop `1146` | 88 | 69 | 61 |

The second corridor supports the weekend demonstration. The first demonstrates why service calendars matter: Friday service extends into Saturday morning, but a Friday schedule must not be reused as Sunday service. Use the result timestamp and label a historical clock **replay**, not live. A day may have departures but none at the requested hour.

The importer uses real downstream stop order, rejects no-pickup/no-drop-off stops, applies `calendar_dates` exceptions over `calendar`, respects `America/New_York`, and supports `25:10:00` overnight GTFS times. `departure_at` and `arrival_at` are UTC. The source feed version is **FY27 Blacksburg 1.6A**, coverage **September 12–October 31, 2026**. Actual service exceptions still govern each trip/date.

## Crime and safety boundaries

- The 12 reports are a selected demonstration sample, **not all September reports**. Report dates and occurrence dates are separate; one report describes an occurrence range beginning in 2023.
- The sample preserves an explicitly **unfounded** report instead of presenting it as a confirmed crime. “Active” is investigation status, not a current threat.
- Reports retain public case IDs, coarse named locations, offense categories, dates, disposition and source page. They contain no victim names or personal details. No street-level geocoding, hidden severity weight, per-person profile or neighborhood danger rating is generated.
- `historical_report_count` in route context is **null**, because this sample is not a complete, route-matched lookback. A dashboard may show “selected reports,” but must not imply a population-level rate.
- Measured path lighting remains unknown; newer OSM tags are community evidence only. The expanded official construction feed now supports fresh path intersections and conservative avoidance, not route-wide clearance. `active_official_alert=true` is used only for overlapping severe/extreme **NWS weather alerts**, with weather provenance; null does not assert no alert. Current campus crime alerts remain unknown.
- Public emergency-phone coordinates are useful map context, not proof that a device works or that a path is safe. `route_data.py` separately provides connected campus pathway geometry for two named routes. Slope analysis and automatic citywide routing are not implemented.

## Refresh and checks

No additional Python packages or credentials are needed:

```sh
python3 databricks/ingest/refresh_campus.py --start-date 2026-09-18 --days 3
python3 -m unittest discover -s databricks/ingest -p 'test_*.py' -v
```

Without a start date, local refresh includes the previous campus-local day and the next two service dates, preserving after-midnight trips. `--days` accepts 1–14. Weather context now contains future forecast windows, split at severe-alert boundaries and bounded by source issue age. The local script does not itself create a background task. The separately installed [native refresh job](../databricks/jobs/README.md) updates managed tables on a finite hackathon schedule and uses the existing Free Edition quota.

Each loader retains its prior snapshot on a fetch/validation failure. `refresh-status.json` records failures and the command exits nonzero; **an old snapshot must not be relabeled fresh**. The crime sample is locked to its reviewed PDF SHA-256. If the PDF changes, manually review relevant facts before changing the expected hash/sample; the script will not silently certify an unreviewed replacement.

The deployment code can bind JSON arrays to Databricks SQL using `from_json` and the schemas below; do not interpolate source text into executable SQL. Root setup owns warehouse loading and managed tables. Fetching these snapshots does not prove a live Databricks query succeeded.

## Import contracts

- `source_manifest`: `source_id`, `title`, `source_url`, `captured_at` (UTC), `sha256`, `source_kind`, `row_count`, `coverage`, `license_note`, `limitations`.
- `incident_reports`: `report_id`, `reported_date`, `offense`, `location`, `occurrence_start`, `occurrence_end`, `disposition`, `source_id`, `source_url`, `source_page`, `extraction_method`, `coverage_note`.
- `emergency_phones`: `phone_id`, `location`, `longitude`, `latitude`, `operational_status`, `source_id`.
- `transit_departures`: `corridor_id`, `trip_id`, `route_id`, `route_name`, `service_date`, `departure_at`, `arrival_at`, `travel_minutes`, `from_stop_id`, `to_stop_id`, `source_id`, `source_version`. Unique key: corridor + trip + service date.
- `route_context`: `corridor_id`, `context_version`, `updated_at`, `valid_from`, `valid_until`, `weather`, `lighting`, `walking_path_closed`, `active_official_alert`, `historical_report_count`, `history_lookback_days`, `source_url`. Unknowns are explicit nulls, not false/zero. NWS versions include current forecast and alert hashes; source issue time must be within 24 hours; evaluation must fall in the row's validity window.
- `route_evidence`: `corridor_id`, `source_version`, `captured_at`, `payload_json`; validated version-1 public route contract. Walking options reject future capture timestamps and snapshots older than seven days. All route quotes have a two-minute bound.

## Official sources

- [Virginia DRPT GTFS directory](https://drpt.virginia.gov/data/gtfs-feed-clearinghouse/) → [Blacksburg Transit ZIP](https://www.bt4uclassic.org/gtfs/google_transit.zip); [GTFS reference](https://gtfs.org/documentation/schedule/reference/).
- [BT fare policy](https://ridebt.org/fare-information) and [boarding guidance](https://ridebt.org/how-to-ride).
- [VT crime-log index](https://police.vt.edu/crime-stats/crime-logs.html) and [September 2026 PDF](https://police.vt.edu/content/dam/police_vt_edu/crime-logs/2026/file_202609.pdf).
- [VT emergency-phone GIS layer](https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/EmergencyAccessMappingLayers/FeatureServer/2).
- [NWS campus reference point](https://api.weather.gov/points/37.2296,-80.4139), [hourly forecast](https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly), [active weather alerts](https://api.weather.gov/alerts/active?point=37.2296,-80.4139).

Attribution is preserved. Public accessibility is not a blanket license; review source terms before redistribution beyond the hackathon demo. No source or agency endorsement is claimed.
