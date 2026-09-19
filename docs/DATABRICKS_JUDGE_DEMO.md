# Beacon: 90-second Databricks story

**Status:** Live Databricks ranking, managed GTFS lookup, weather-context join, persisted audits, spatial/H3 queries, and the three-record AI extraction ran successfully on September 19, 2026. A native dashboard draft was created and read back through the API. Visual widget inspection is not yet verified because the console blocks automated browser control. See [statement IDs and limitations](DATABRICKS_LIVE_EVIDENCE.md). Provider offers remain simulated; historical timetable runs remain labeled replay.

## The story

| Time | Show | Say |
| --- | --- | --- |
| 0–20 seconds | The evaluator's chosen plan, budget, walking time and source labels | “We compare the options for this student's needs. These providers are simulated; the system never claims that a historical crime count proves a route is safe.” |
| 20–40 seconds | Cancel Campus Ride, then lower the budget from $10 to $6 | “The logic first replaces the canceled provider, then changes its choice again when the budget changes. It can also say no option fits.” |
| 40–60 seconds | A real query's statement ID and the matching audit row | “Databricks computes the decision and keeps the explanation and policy version. If unavailable, our local fallback is visibly labeled.” **Only say this after a verified live ranking.** |
| 60–80 seconds | Public campus phone locations, source/expiry table and one official incident record | “The data layer joins campus information with clear provenance. Unknown lighting stays unknown. A mapped emergency phone is not a guarantee that it is operating.” |
| 80–90 seconds | One concrete next step | “A campus pilot would add participating providers and operationally maintained campus feeds, then measure replan success, cost and walking time.” |

Before a live run, warm the SQL warehouse, refresh the small source snapshot, run the local demo, then run one live evaluation. Keep its sanitized output and statement ID. If access is still missing, demonstrate the local decision engine and label these SQL assets **prepared, not connected**. Never disguise a saved replay as a live result.

## Prepared native SQL assets

Each `.sql` file is one read-only statement. The setup runner substitutes `__SCHEMA__` with the trusted, quoted catalog/schema. In the Databricks SQL editor, replace it with the project catalog/schema before running. Do not substitute untrusted request values into SQL.

| File under `databricks/sql/showcase/` | Demonstration | Evidence / limitation |
| --- | --- | --- |
| `01_what_if.sql` | Six budget, cancellation and walking scenarios | Frozen simulation quotes. Expected winners: Campus Ride → Independent Ride → Transit → Transit → Walk → no feasible plan. This is a sensitivity exhibit, not the app's runtime query. |
| `02_recent_decisions.sql` | Explainable recent decisions and statement IDs | Reads real stored events; empty means no events have been recorded. Deduplicates retries by evaluation ID. These are evaluations, not users or completed trips. |
| `03_context_freshness.sql` | Context provenance, expiry and unknown fields | Uses imported route context. A recent import does not validate the completeness of crime reports or guarantee path conditions. |
| `04_emergency_resources.sql` | Native spatial distance and H3 labels | Uses real public GIS phone locations around a fixed public campus reference. Spherical straight-line meters, not walkable routes. Requires supported non-Classic SQL compute. |
| `05_phone_hexagons.sql` | H3 resource-distribution aggregates / GeoJSON | Phone count by hexagon. Never a “safe area” heatmap. |
| `optional/06_ai_extract_public_reports.sql` | Native AI structured extraction with citations and confidence | Optional, explicitly gated, at most three public reviewed records. Not in the decision path and not automatically run. |

The saved native dashboard has the six-scenario table, recent-decisions table, source-freshness table and resource-location map using query 04's longitude/latitude. Query 05 separately supplies GeoJSON hexagons. Labels distinguish **simulated quote scenario**, **recorded evaluation**, and **public resource location**. The draft is not publicly published or shared by this task.

`databricks/sql/showcase/dashboard-request.mjs` builds a [Lakeview draft-create request](https://docs.databricks.com/aws/en/dashboards/tutorials/dashboard-crud-api) from the same queries, including a table/map layout. Run `node databricks/sql/showcase/dashboard-request.mjs CATALOG SCHEMA WAREHOUSE_ID` to print the JSON request; it does not send it or create anything. It uses the [Databricks-maintained widget specification](https://github.com/databricks/databricks-agent-skills/blob/main/plugins/databricks/copilot/skills/databricks-aibi-dashboards/references/1-widget-specifications.md). Test all four dataset queries on the workspace before creating the draft, then visually check every widget. No publish, schedule, public share or embedded credentials are included.

## Optional AI: useful proof, honest scope

Only enable the optional extraction query after the actual workspace supports it and its quota/cost use is accepted. Bind `enable_ai` as BOOLEAN `true` to run; leave this query out of setup and normal demo scripts. Supported regions and compute vary. Native [`ai_extract` 2.1](https://docs.databricks.com/aws/en/sql/language-manual/functions/ai_extract) can provide field citations and confidence metadata, but those are model outputs, not independent evidence.

This query reconstructs short text from **already reviewed public incident rows** and extracts their date, offense and reported location. Show the original text and the reviewed columns beside the AI output. Reject a mismatch, missing citation or unsupported fact; nothing is automatically written back. Confidence is about extraction, **not** the likelihood of crime. Automated PDF ingestion is a possible later improvement, not implemented by this query.

## What is genuinely Databricks-native?

The core is managed Delta data plus SQL ranking and auditable results, with a TypeScript fallback for availability. The prepared resource queries additionally use native [`ST_DistanceSphere`](https://docs.databricks.com/aws/en/sql/language-manual/functions/st_distancesphere) for meters and [`H3 indexing`](https://docs.databricks.com/aws/en/sql/language-manual/functions/h3_longlatash3string) / [GeoJSON boundaries](https://docs.databricks.com/aws/en/sql/language-manual/functions/h3_boundaryasgeojson). No extra GIS service or vector database is needed. AI extraction is optional enrichment, not the judge of which ride is safest.

Before claiming success, capture one real statement using an imported context row, demonstrate an explainable choice change, and run the cancellation sequence three times. Report exactly which runs used Databricks versus local fallback. Do not invent adoption, crime reduction, operational coverage or realized savings.
