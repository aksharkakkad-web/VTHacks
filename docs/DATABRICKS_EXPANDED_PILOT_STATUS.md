# Expanded pilot: verified result and integration gate

September 19, 2026. This is the current status addendum to the product PRD, Databricks track PRD, data/route contracts and previous live evidence. **The expanded pilot is not finished or deployed.** The prior two-route integration remains the runtime baseline; the wider data and tools below are local additions. No push/merge/deployment was performed.

## Inventory

| Surface | Verified implementation | Remaining boundary |
| --- | --- | --- |
| Existing decision engine | Parameterized Databricks SQL, matching local fallback, budget/walking limits, quote freshness, exclusions, weather/closure handling, fact-ID AI and audit | Expanded walking/waiting/pickup policy has not been agreed or activated |
| Full transit | Complete official archive: 297 stops, 24 routes, 3,658 trips, 74,301 stop-times, 181 exceptions, 10,456 active trip/date records over Sep 19–Oct 2 | Same-trip/direct only. Full-feed runtime/cloud activation pending; original two-corridor lookup unchanged |
| Pilot map | 1,083 Town Existing features; 984 admitted sidewalks/trails, plus 1,970 VT source features. 29,900 vertices/29,770 edges. 25 forward + 25 reverse checks: 10 supported, 40 unsupported | Zones are draft, not team-approved. Missing crossings/entrances and disconnected geometry block wider walking guidance |
| Existing campus paths | Locally rebuilt from fresh official construction snapshot: Newman–Pritchard 1,077.34 m; Eggleston–Pritchard 626.55 m | Local/cloud versions must match before managed-map use. Local construction evidence expires at its recorded deadline; no automatic widening |
| Weather | 73 future-overlapping hourly periods cover at least the next 72 hours. Gap/short-horizon checks added | Forecast horizon is not operational freshness. Current decision context keeps its existing 24-hour issue-age limit; research refresh is not emergency monitoring |
| Waiting places | Three official building reference locations and date-specific published hours captured; closing-time estimator implemented/tested | Zero provider-approved pickup points, zero confirmed nighttime admission guarantees. All three have unknown pickup permission/access |
| Lighting | Segment helper distinguishes operational lit/unlit/unknown; stale observations and pole inventories cannot establish illumination | No operational source verified. Zero comparable verified-lit demo routes; no “well-lit route” claim |
| Unknown transfers | Missing counts remain `null` in ranked results, SQL input and audits. No false “fewer changes” explanation. AI cannot hide this warning | v1/v2 scoring still omits missing transfer cost to preserve the signed-off policy. It explicitly warns `LEGACY_POLICY_OMITS_UNKNOWN_TRANSFER_COST`; a new policy needs agreement |
| Performance | 20 actual sequential read-only warehouse decisions measured; 19 Databricks results, one timeout/fallback | Audited full journey under 10 seconds is NOT established |
| Dashboard/UI | Existing private dashboard and Mahin backend integration remain; Rishit PR16 is a frontend simulation | Dashboard browser required sign-in during this check; widgets not visually accepted. Wider data is not wired to UI |

## Product framing

The intended pilot helps a student or authorized friend get an actionable alternative before accepting an offered ride with a driver reported to have been drinking. Never infer sobriety. Such a reported driver must be filtered before a candidate is recommended; a typed, privacy-preserving integration for this exclusion is still needed with Mahin. Existing emergency-help, consent, confirmation and location-sharing gates must remain. No raw intoxication statement belongs in public tables or model prompts.

The Texas survey statistic supplied in the handoff is motivation requiring primary-source verification before public use. It is not a measured Beacon outcome. Evaluate impaired-driver ride acceptance later with an appropriate survey; app clicks, a demo and 20 latency runs do not establish reduced crashes or lives saved.

## Source research and actual limits

- **Waiting:** The rendered [VT student-center hours](https://apps.students.vt.edu/schours/) showed Sep 19 Squires 09:00–23:00 and GLC 10:00–22:00, America/New_York. The rendered [library table](https://lib.vt.edu/about-us/hours.html) showed Newman 09:00–22:00. The [GLC site](https://graduatelifecenter.vt.edu/) additionally excludes home football game days; that exception was not resolved, so admission remains unknown. These are published schedules, not live open-door verification. See `data/campus/waiting-locations.json` for official building IDs/coordinates and limitations.
- **Campus transport:** [VT Safe Ride](https://police.vt.edu/vtpd-services/safe-ride.html) documents requesting through TransLoc or the published phone number. Beacon has no authorized booking integration with that service. A demo “Campus Ride” is not evidence of a real Safe Ride booking.
- **Live buses:** [BT's official site](https://ridebt.org/) offers a live map and [BT app](https://ridebt.org/bt-app). That proves a public live display exists, not that Beacon has an approved documented feed. Continue to label our GTFS data **scheduled**. Request machine-feed documentation, usage permission, stop/trip mapping, timestamps and disruption semantics from Blacksburg Transit before calling our arrivals live.
- **Lighting:** [Town Public Works](https://www.blacksburg.gov/departments/departments-l-z/public-works) and [Appalachian Power's reporting page](https://www.appalachianpower.com/contact/) identify relevant owners/reporting channels; no segment-level operational feed was verified. Obtain a VT Facilities/Town/utility agreement for asset IDs, actual illumination coverage, outage/repair events, observed timestamps, refresh guarantees and permitted use. An electric-service outage polygon, a pole map or a community tag is not proof of path illumination.
- **Paths:** [Town GIS](https://www.blacksburg.gov/departments/departments-a-k/engineering-and-gis/gis-data) routes to official public data. The Existing Paths-to-the-Future layer mixes infrastructure classes; the importer uses only Existing Sidewalk and Trail. Proposed paths and bike-only edges are excluded. No proximity connector is fabricated between disconnected sources.

Every new source retains its URL/owner, capture time, hash where an actual archive or geometry snapshot is captured, scope, refresh expectation, validation and rights caution. Waiting-hours records are a manually reviewed browser transcription, **not a hashed raw API response**. Public availability does not itself settle redistribution rights.

## Exact data-side handoff

### Mahin

1. Existing `evaluateTrip(candidates, context, signals)` and recommendation/API paths are unchanged. The data-side `RankedPlan.transfers` is now `number | null`; `CandidatePlan.transfers` remains optional. Consume PR17's preserved omissions; do not coerce missing counts to zero. Display `TRANSFERS_UNKNOWN` and the legacy-policy limitation where relevant.
2. Current cancellation sends fresh offers and `excludedProviderIds` while keeping `objectiveVersion: 0`: Mahin's existing API treats a trip's objectives as immutable, and its adapter rejects a nonzero result. An incremented version for mutable objectives is a future shared-contract change, not implemented behavior. Recheck quote expiry and the current trip at confirmation/booking. A SQL recommendation is not provider identity verification, authorization or a booking.
3. Agree a versioned expanded sidecar before activation: provider service-area eligibility, user-reported driver ineligibility (boolean/reason code only), pickup steps with provenance, verified access path/duration, pickup permission, hours/closure exceptions and offer expiry. These are **not implemented shared request fields**. Unknown must not improve ranking merely by omitting a burden. Change weights/eligibility only under a new policy version; do not silently rewrite beacon-v2.
4. `planIndoorWait(site, pickup, evaluatedAt)` is a pure data-track helper, not an API. It requires confirmed access and provider pickup permission plus a verified access route, a current sourced hours interval, and a feasible pickup time. It returns `ESTIMATED`, `UNKNOWN` or `CLOSED`, a leave time and nullable estimated indoor/outdoor waits. Closing before pickup moves departure earlier and increases the estimated outdoor wait. Missing inputs produce nulls, not zero.
5. Full GTFS `direct_journey(...)` works on verified stop IDs with explicit access minutes; it does not generate walking access routes or transfers. The draft pilot matrix cannot be activated simply by supplying a stop near the user; exact entrances/offsets/crossings need review. Keep old named-corridor validation until that agreement.

### Rishit

- Existing owner-only trip evidence still distinguishes the **full walking alternative** from a ride's pickup/drop-off path. Never place the full walking path under a ride and label it that ride's route.
- `transfers: null` → **Changes unknown**, not **0 changes**. `source: simulated` → **Simulated ride**, even if ANS/HTTP are real. `source: scheduled` → **Scheduled bus**, not live ETA. `engine: local_fallback` must remain visible.
- Lighting unknown → **Lighting not verified**; phones → **Mapped phone; working condition unknown**. Published building hours → **Published hours; access/pickup unconfirmed**, not **Safe place open now**.
- Unsupported pilot rows have no path/distance/time. Show **No verified walking route for this pair** rather than a straight line. `NO_FEASIBLE_PLAN` is a real state, not permission to auto-book or relax constraints.
- The new matrix and waiting helpers are not yet exposed by shared API types. Review the additive contract with Mahin before consuming them. Preserve confirmation, ownership and location gates in the UI journey.

## Reproducible verification and deployment boundary

```sh
python3 -m unittest discover -s databricks/ingest -p 'test_*.py'
python3 databricks/ingest/pilot_coverage.py --offline
node databricks/run.mjs test
node --test databricks/latency.test.mjs
./scripts/pre-pr.sh
```

Refresh closures/weather, then rebuild construction-aware routes together. If source versions differ from the deployed managed route, fail visibly/use labeled local evidence; do not silently present a mismatched managed path.

Fresh local checks passed: 92 decision-track tests (including setup), 74 agent tests, 73 Python ingestion tests, six refresh-job tests, 17 public-import/native-public-import/latency tests, six full-transit native-generator tests, and repository lint/typecheck/production build plus four checkpoint tests. The shell-default Python lacks the pre-existing `pdfplumber` dependency; the complete 73-test ingestion run used the bundled workspace Python, which already has it. An old importer assertion assumed exactly 72 hourly rows; it now checks retained row count and a continuous horizon of at least 72 future hours (73 overlapping hourly periods at this capture). Independent review caught and resolved missing GTFS agency/sequence validation, native normalized-data binding to the authenticated archive, and the cancellation-version handoff wording. No full pilot or live native-import acceptance is implied.

The native full-transit deployment candidate is separately documented in `DATABRICKS_FULL_TRANSIT_NATIVE.md`. No upload/run has been approved in this increment. A deployment needs the existing hackathon workspace explicitly targeted, completed import/count checks, SQL parity, then runtime/UI integration. No new paid service or purchase is needed for the local preparation.

### Performance evidence

`data/campus/latency-readonly.json` contains all 20 measured samples and statement IDs. Capture 17:03 UTC: warehouse started **STOPPED**; separate `SELECT 1` warmup took 13,728 ms. Median decision 2,104.5 ms; slowest 10,003 ms (timeout → labeled local fallback); 19 real Databricks results. No audit writes, provider discovery, route lookup, AI, HTTP journey or UI are included. Thus `passed: false` and `underTargetCount: 0` intentionally reflect the missing audited end-to-end acceptance, not zero successful SQL reads. This is not a reliability percentage.

Read-only repeat command:

```sh
node databricks/latency.mjs --live --profile beacon \
  --host https://dbc-6b71bd46-0c51.cloud.databricks.com \
  --warehouse 586a1b427679f515 --output data/campus/latency-readonly.json
```

`--audit` additionally writes synthetic decision audit rows; it still excludes agent discovery/map/model/UI time and must not be called full-journey acceptance. A complete team scenario needs separate HTTP journey timing and the actual current integrated branches.

## Next decisions, not finished claims

Agree the draft 5+5 zones (or replace them), review the expanded policy/sidecar with Mahin/Rishit, authorize the scoped native import/runtime deployment, and sign in for dashboard visual QA. Missing operational lighting, provider pickup permissions and real commercial/campus booking require the corresponding owner/provider—not more synthetic rows. Until those boundaries are resolved, keep the prior bounded demo and truthful simulations.
