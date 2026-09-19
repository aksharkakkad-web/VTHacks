# Databricks track — execution evidence

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
