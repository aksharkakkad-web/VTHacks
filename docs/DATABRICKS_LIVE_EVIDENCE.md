# Databricks track — execution evidence

## Version 3: completed intelligence backend (September 19, 07:04–07:07 UTC)

Fresh acceptance after all material code fixes:

- **48 Node tests**, **19 importer/route tests**, **6 native-job tests** passed. `scripts/pre-pr.sh` passed ESLint, four checkpoint tests, typecheck and production build. `git diff --check` passed.
- `node databricks/run.mjs intelligence --live --enable-ai` passed: managed route read, Databricks ranking/audits, native model output validation and a second $0-budget evaluation. The actual 604.26m Eggleston path is labeled `mapped`; the $7 ride is labeled `simulated`.
- `node databricks/run.mjs demo --live` passed all seven decision scenarios plus managed GTFS lookup, each with cloud execution and persisted audits. The schedule test remains a clearly labeled historical replay.
- Focused independent review passed after fixes for removed-feed trips, partial-hour severe alerts and superseded forecast/alert versions. An additional read-only expiry probe advanced the clock during AI: the expired sole quote became `NO_FEASIBLE_PLAN`, and the stale model briefing was discarded.

| Actual cloud operation | Result / statement ID |
| --- | --- |
| Personalized $10 budget/reduced-walking decision | Simulated $7 ride; audited. `01f1b3f8-5daa-1ca3-ba25-6b1f1a79bda7` |
| Managed route used by briefing | `01f1b3f8-62c7-1440-b487-d009f41f83b4` |
| Native `ai_query` briefing | `databricks-meta-llama-3-3-70b-instruct`, valid fact IDs and required warnings. `01f1b3f8-636b-13f9-94c3-a2dbcae6d2f4` |
| Same options, $0 budget | Free mapped walk; audited. `01f1b3f8-6528-1773-b941-d78d8711c688` |
| Baseline / cancellation | `01f1b3f8-5dee-1514-af82-51cd14651649` / `01f1b3f8-645f-12dc-be62-2d50e4fe5244` |
| Reduced budget / cheapest priority | `01f1b3f8-6773-127f-bc63-a5689d8c2565` / `01f1b3f8-6a94-1a12-9986-e85dbd1bd960` |
| No feasible option | `01f1b3f8-6d4e-1c43-84e2-d578a9d39812` |
| Current managed forecast window | `01f1b3f8-7054-1c81-9a62-919e0feb4821`, version `nws-452855730fd1-e8e73429d88e-2026-09-19T07:01:30.229467Z`. Weather category is unknown for this window, not fabricated clear. |
| GTFS lookup / ranking | `01f1b3f8-7363-19bb-add2-7c34f1f2a0e8` / `01f1b3f8-7431-12a7-a36f-c642a04a5f0b`; current feed hash `aed7634f4df2` |
| Route dashboard query | `01f1b3f7-b45a-1f47-9a79-eb3227eb094b`; two supported paths and explicitly unsupported downtown |
| Updated freshness query | `01f1b3f7-cbb1-1035-b4ff-5810631b1b9e`; older one-hash context versions correctly labeled superseded |
| Managed data counts | `01f1b3f8-5ef5-1954-995d-553ff53b1313`: 754 retained scheduled departures, 130 phones, 12 selected reports, 6 source manifests, 3 route records (2 supported), 3 currently valid context corridors. Counts are not real-time service availability. |

### Native refresh and dashboard

- Existing Free Edition workspace and warehouse below, **eight** managed Delta tables now, with additive `route_context.valid_from` migration.
- Native job **1118599535446767**, `/Shared/Beacon/refresh-public-data-v2`. Initial run `336465213726176` succeeded; after the alert-interval/hash fix, rebuilt notebook run **748744025713625** and task **57174209832663** both returned **SUCCESS**. Final run: 205s serverless setup + 89s execution. `get-run-output` confirmed success; no notebook exit-result payload was configured. Actual tables were separately queried as above.
- Finite six-hour schedule enabled and read back as `UNPAUSED`. Notebook refuses fetching/writes at or after **2026-09-20 16:00 UTC (noon Eastern)**. No unbounded background job, paid upgrade or extra service. This cadence is not live emergency monitoring.
- Dashboard **01f1b3f083701e98a2dd137a860f6d07** updated and read back with **five datasets/six widgets**, including route evidence and corrected freshness labels. Still a private draft; visual rendering remains unverified because console automation is blocked. No publication implied.

### Handoff and remaining boundaries

The **Databricks backend scope** in PRD v3 is implemented and live-tested. Mahin still wires the additive `getMappedWalkingOption` / `evaluateTripIntelligence` exports into his flow; Rishit presents the result, evidence and labels. No teammate source/API/shared type was changed. The backend does not book rides, authorize GPS disclosure or prove end-to-end app integration.

Lighting, current campus crime alerts, verified closures, phone operation and comprehensive crime coverage remain unknown. Historical reports are a reviewed partial sample, not route-risk predictions; route geometry is a static official snapshot, not doorstep navigation. Provider offers in the demo remain simulated. AI curates exact evidence, not new prose or a safety prediction. Static route/incident rebuild, sponsor registration and approval-based audit deletion remain explicit follow-ups, not silently completed actions.

The older v2 results below are preserved as historical evidence; their table/test/widget counts and one-hour weather expiry are superseded by v3.

## Version 2 historical acceptance

Verified September 19, 2026, approximately 06:07–06:14 UTC. These are actual workspace statements, not mocked responses.

Final repeat check at 06:18 UTC: all 30 track tests, nine importer tests, repository pre-PR checks, six local fallback scenarios and seven live scenarios passed again with the frozen $10 baseline budget. The repeated live baseline statement was `01f1b3f1-d9e4-157b-ae2a-1ea6f51bbf87`; the final scheduled-option ranking was `01f1b3f1-e93f-180e-b4ef-5852d777b0cb`. The corrected dashboard decision-history query also returned actual selected-plan IDs (`01f1b3f1-7400-114d-b764-8ec3f8050ee7`).

## Workspace and assets

- Free Edition workspace: `https://dbc-6b71bd46-0c51.cloud.databricks.com`
- Existing Serverless Starter Warehouse: `586a1b427679f515`, 2X-Small, automatic stop after 10 minutes.
- CLI OAuth profile: `beacon`. Token obtained in memory; no token committed or put in browser code.
- Managed schema: `workspace.beacon`; seven Delta tables plus the schema.
- Native dashboard draft: **Beacon — decisions, evidence and campus context**, ID `01f1b3f083701e98a2dd137a860f6d07`. Find it under the workspace's SQL → Dashboards. Four datasets/five widgets; created and read back through Lakeview API. Not published publicly; visual widget rendering needs a manual look because Databricks blocks automated console control.

## Live acceptance run

`node databricks/run.mjs demo --live` completed with exit 0. It asserts that each result came from Databricks, expected choices match, and configured audits persisted. The historical schedule example is explicitly a replay; Databricks executed it live against the managed timetable.

| Case | Result | Databricks statement ID |
| --- | --- | --- |
| Baseline | Campus Ride, audited | `01f1b3f0-f537-19dc-8304-582bfe7881fc` |
| Campus cancellation | Independent Ride, audited | `01f1b3f0-f775-155d-8d18-d1880ac2d96d` |
| Budget reduced to $6 | Transit, audited | `01f1b3f0-fa0f-11ad-8492-05b5938c8b1b` |
| Cheapest priority | Transit, audited | `01f1b3f0-fca4-1cce-82da-5ce042f578c6` |
| Zero walking cap | No feasible plan, audited | `01f1b3f0-febb-18d0-8270-bfbd94ee5c95` |
| Managed weather join | `nws-529c96e615af`, clear, audited | `01f1b3f1-00eb-1de9-9379-aa34744a71f6` |
| Official Newman schedule lookup | Real managed GTFS row | `01f1b3f1-0326-15ab-ae1d-bee9c8893d69` |
| Rank scheduled option | $0 BT option, audited | `01f1b3f1-0387-1788-9ea8-26d63f8089a7` |

The two-second audit limit was too short in this workspace; it was increased to eight seconds and the full audited run then passed. Quote expiry is checked again after the audit wait. An earlier timed-out audit can still have committed before cancellation; its returned status was correctly unconfirmed, not a guarantee the table stayed empty.

## Native features actually executed

| Feature | Verified output | Statement ID |
| --- | --- | --- |
| SQL what-if | Six scenarios, expected changing winners/no-option | `01f1b3f0-638e-1775-9add-fdfa67a841a0` |
| Spatial proximity + H3 | 20 nearby public phone locations; distance in meters | `01f1b3f0-8b0b-127e-856f-641d3ad20e5a` |
| H3 aggregation | Resource counts and polygon GeoJSON | `01f1b3f0-e6fb-161c-9cc6-51834be38a91` |
| Context freshness | Three current corridors, old versions marked stale | `01f1b3f0-e5c4-1af0-9772-a2ba1576b354` |
| Native `ai_extract` v2.1 | Three records, matching offense/location/report date, citations and confidence fields, no returned errors | `01f1b3f0-e53c-1ef0-957e-4a9dd1d3f17b` |
| Loaded-data check | 295 departures, 130 phone points, 12 selected incident rows, six source records, three currently valid corridors, 11 recorded evaluations at check time | `01f1b3f1-1857-1f1f-9a75-50c4bb3ac192` |

AI extraction initially exceeded 60 seconds on its first attempt; a bounded 120-second retry succeeded. It extracts from reviewed public text, **not directly from a PDF**. Returned confidence is model metadata, not a calibrated safety probability. AI output is not used for ranking. No paid upgrade, vector-search service, model-training job or real ride booking was created.

## Local verification and integration boundary

- 30 Node track tests and nine offline importer tests passed.
- Repository `scripts/pre-pr.sh`: lint, four checkpoint-board tests, typecheck and production build passed.
- Six local fallback demo scenarios passed; fallback labels are explicit.
- Review found and fixed an ambiguous managed-context SQL column and expiry during awaited audit. Live testing also corrected the dashboard audit JSON field path.
- Akshar checkpoint readiness: A, B, C, F, G. D/E are not asserted as integrated; they need Mahin's handoff/monitoring flow. GitHub board notifications require the change to reach main and CI to pass.

Mahin must still wire `evaluateTrip` / `getScheduledTransitOption` into trip APIs and preserve objective-version, quote-freshness, provider-verification and pickup-permission gates. Rishit must show results/source/fallback labels. This task did not modify their screens or orchestration, publish the app, push a branch, or merge code.

Weather context was valid until **07:00 UTC** at this run and must be refreshed before a later demo. The 12 reports are a selected historical sample, not comprehensive route risk; lighting and phone operation remain unknown. A recommendation is not a safety guarantee.
