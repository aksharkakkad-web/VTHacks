# Databricks intelligence completion — September 19

**Historical plan:** This describes the earlier bounded intelligence implementation. The later [expanded-pilot plan](DATABRICKS_PILOT_PLAN.md) and [current status](DATABRICKS_EXPANDED_PILOT_STATUS.md) supersede it for the new 5×5-area request. Earlier completion does not mean that wider pilot, teammate UI integration or deployment is complete.

Akshar approved completing the remaining safety/cost intelligence, data refresh and grounded AI in this track. Build on `cdb4ff6`; preserve teammates' API/UI/shared contracts. This plan supersedes the old restriction against an explanatory LLM, not the ban on invented safety predictions.

## Global constraints

- Use the existing Free Edition workspace/profile `beacon`, existing SQL warehouse and native model endpoints. No purchases, paid upgrades, external model vendors, public deployment or Git push/merge in this change.
- Public named campus places and sources only; no student GPS, identities, contacts or free text sent to models or persisted.
- Keep deterministic eligibility/ranking authoritative. AI may prioritize evidence explanations but may not select or authorize a ride, invent evidence, infer danger or remove unknown-data warnings.
- Unknown lighting, closures, incident coverage and device condition remain unknown. More historical reports do not justify a crime probability.
- Local tests plus actual live statements must substantiate completion; no claim that teammates' app integration is done.

## Task 1: Route data and evidence

Owner: backend specialist. Files: new `databricks/ingest/route_data.py`, `databricks/ingest/test_routes.py`, `data/campus/walking-*.json`, `data/campus/route-evidence.json`, new `src/lib/decision-client/route-evidence.ts` and its tests, `docs/DATABRICKS_ROUTE_DATA.md`.

Collect a bounded, attributed campus pedestrian network from official GIS if suitable or OpenStreetMap public data. Compute real connected walking paths for named demo landmarks, with source and geometry. Match nearby official emergency phones by actual path geometry; associate historical reports by documented coarse place matches only. Never draw straight lines and call them walkable. Explicit incomplete/unknown coverage. Produce route-evidence records for Newman/Eggleston/Pritchard and downtown where verifiable; no invented routes. Unit-test routing disconnection, evidence bounds, unknown tags, and nearby-resource distances. Do not modify refresh_campus.py, run.mjs, setup.mjs, SQL, server.ts, shared types, agents or UI. Report the JSON contract early.

## Task 2: Grounded model explanation and personalized comparisons

Owner: manager. Add an evidence-card builder and native Databricks model call that selects/reorders only valid fact IDs; render citations and exact facts locally. Include selected trip, alternatives/cost/walking tradeoffs, route evidence, unknowns, and explicit source labels. No unvalidated free-form generated safety advice. Bounds, invalid model IDs, outage fallback, emergency skip, and quote expiry covered by tests. Add `evaluateTripIntelligence` without changing `evaluateTrip` or shared types. Live model demo must prove invocation and validated output.

## Task 3: Repeatable refresh and acceptance

Owner: manager. Create an idempotent native scheduled refresh job in the existing hackathon workspace, with an end-of-hackathon bound, failure reporting and manual command. Refresh current official weather/transit/phones and merge typed tables; preserve static reviewed incident facts. No tokens in files. Tests check source freshness, severe weather and idempotent job settings. Execute a live job run, read success/output, and test the combined intelligence flow. Update PRD/runbooks/evidence with exact results and unresolved external data limits. Independent focused final review.

## Interface review

| Producer → consumer | Boundary | Decision |
| --- | --- | --- |
| Task 1 → Task 2 | route-evidence JSON | Versioned public route evidence, not user location or risk rating |
| Task 1 → Task 3 | static route snapshots | Manager imports; route rebuild remains explicit rather than scraping every refresh |
| Task 2 → Mahin | additive server export | Existing evaluateTrip and Recommendation remain stable |
| Task 3 → ranking | existing route_context | Same validated freshness and integer-policy checks |

Progress: all three tasks completed within this track. Independent focused review passed. Final checks: 48 Node tests, 19 importer/route tests, six native-job tests, repository lint/checkpoints/typecheck/build, seven live decision scenarios and two combined intelligence scenarios passed. Native refresh run 748744025713625 succeeded and its finite schedule is enabled. Dashboard draft was updated/read back; visual rendering and teammate app integration are not claimed. Exact evidence, limitations and handoff are in [DATABRICKS_LIVE_EVIDENCE.md](DATABRICKS_LIVE_EVIDENCE.md). Git push/merge requires separate approval.
