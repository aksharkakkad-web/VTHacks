# Databricks track — execution evidence

## Version 5: local expansion and read-only warehouse measurement (September 19, 17:00–17:12 UTC)

The [expanded-pilot report](DATABRICKS_EXPANDED_PILOT_STATUS.md) is the current completion boundary. Full GTFS capture, wider pedestrian coverage, waiting/lighting helpers and native-import preparation are local additions, **not a cloud deployment**. No new import/job/audit write occurred in this increment. The successful native runs below belong to the prior version.

Actual 20-run read-only measurement is recorded in `data/campus/latency-readonly.json`, including individual statement IDs. The warehouse began STOPPED; the separate warmup took 13,728 ms (`01f1b44b-d887-1bdb-9b2b-9186fdac15b7`). Median measured decision was 2,104.5 ms, slowest 10,003 ms; 19 used Databricks and one timed out to labeled local fallback. Audits, provider discovery, map/AI and HTTP/UI were excluded. The full audited end-to-end under-10-second target therefore **has not passed**. A 20-run sample is not a production reliability estimate.

Dashboard visual QA remains pending: the current browser visit redirected to Databricks sign-in. API widget readback is not visual verification. Local fresh construction/weather and routes have not been uploaded, so managed version mismatch must remain visible. Public-source quantities, source hashes and capture times are in the linked full-transit/pilot manifests and current report.

Fresh local verification: 92 track, 74 agent, 73 ingestion, six refresh-job and 17 public-import/native-public-import/latency tests passed; `./scripts/pre-pr.sh` passed lint, four checkpoint tests, typecheck and production build. Ingestion used bundled workspace Python because the shell-default interpreter lacks the existing PDF parser. The full-transit generator has a separate local test/review record; no real Spark/SQL execution is implied by these tests.

## Version 4: expanded evidence and local backend integration (September 19, 15:08–15:34 UTC)

This candidate builds on Mahin's PR #14 at `dcaeedd`. The original checkout is preserved; the integration is local on `codex/integrated-data-finish`. It has **not** been deployed or merged. Older acceptance below remains historical evidence, not a description of current dataset sizes or integration status.

### Native managed data actually loaded

- Public serverless import run `1068888673678627`, task `481140875156226`: **SUCCESS**. Notebook `/Shared/Beacon/import-public-52d3e28dcdd51a72`.
- Completed import ID `88c483ad49b430d4e77e0c35b59243e3727477803ff74a283e548f5bc20719b9`: 386 reconstructable JSON snapshot parts, 3,519 item parts, 2,067 typed records and one completion marker. The first slower SQL-batch attempt timed out; it is not counted as successful acceptance. The native run supersedes it without deleting older partial versions.
- Counts from actual SQL: crime719, lighting1,179, activity4, construction14, emergency equipment65, notices20 and weather66. Count statement `01f1b43e-b183-1b13-8d8e-8f045f35ef85`; archive/completion check `01f1b43e-b23c-161a-90f0-7b891dcfe806`.
- `provider_outcomes` exists and has no fabricated history: `campus_ride` reliability is `unknown`, sample size0, checked by `01f1b43e-b2be-134c-8f57-020e447267c6`. The ingestion contract is unit-tested; no pretend production observation was inserted for proof.
- Managed weather/context and448 timetable departures were refreshed. New connected construction-avoidance maps were uploaded: Newman1,077.34m/four nearby phones, Eggleston626.55m/two phones. Both add22.29m and preserve original endpoints/network capture. Route import statements `01f1b43e-75df-19da-a2f6-a1769586fd33` and `01f1b43e-7807-15ed-97be-17c045ab505e`.

### Real SQL and local HTTP acceptance

`node databricks/run.mjs evidence --live --profile beacon` passed: completed bundle counts, initially unknown reliability, actual managed route, actual ranking and persisted audit, $0-budget selection, unsupported-downtown evidence. Ranking statement `01f1b43e-b42f-1471-8917-9afc82ee7ad2`; $0 statement `01f1b43e-b89e-1404-9c2e-e9e987fa8839`. At this clock the short mapped walk won; no ride was forced for presentation. Safety output remained `routeExposureScore:null`, with partial historical coverage and no route-wide clearance.

A production-built **local** Next server, isolated local trip storage and three local HTTP demo providers exercised real Databricks without live ANS, Redis, QStash or Telegram credentials:

- `BEACON_SMOKE_DECISION_ENGINE=databricks node src/agents/smoke.mjs`: passed discovery→evaluation→confirmation→trust gate→simulated booking→automatic cancellation replacement→arrival; overdue simulated alert occurred once; ownership and callback protection passed. This is real HTTP/SQL execution, not real transportation or a sent Telegram message.
- `node databricks/integrated-smoke.mjs`: passed named Eggleston route discovery, managed map version, audited real-SQL choice of the free626.55m walk, owner-only evidence, confirmation→navigation→arrival, no provider coordinate release, and invalidation of the completed selection. SQL `01f1b43f-552c-137c-b6ad-5073f604d53a`; managed route `01f1b43f-540e-1dd1-909c-1aa0bc7e9d6d`. Public synthetic endpoints were used; nobody actually walked the route.

Research adapter real retrieval at15:25:44–45 UTC returned two official NWS pages with source-generated timestamps and SHA-256 hashes, no gaps. Output was metadata-only with `rankingEligible:false`; retrieval does not establish a new hazard. This workspace's exposed models did not include the Gemini/OpenAI GPT-5 models documented for native web search, so no search model/service was enabled. The previously verified native fact-ID briefing remains optional and separate from ranking.

### Checks and remaining boundary

- 82 Databricks track tests,74 agent tests,60 Python source/import/route tests,6 native-refresh tests and15 public-import tests passed. The public-import15 include three new native Spark generator checks.
- Repository pre-PR lint, four checkpoint tests, typecheck and production build passed. Tests were updated for the actual detour clock/distance/phone count; synthetic closure tests retain independent artificial geometry. Final delivery rechecks are recorded in Git/task output.
- **Late cloud repeat, around15:47 UTC:** `demo --live` and `intelligence --live --enable-ai` timed out; one sequential `demo --live` retry also timed out. The live-required scripts correctly failed instead of labeling fallback as cloud success. Query history shows provisioning delay on the first requests (`01f1b441-5184-1437-baf5-37cd90cc2186`, `01f1b441-50e7-191a-b8e1-0f22f9a429f2`) and a later evaluation canceled at9,718ms (`01f1b441-7420-17c9-9a94-74df04f59fd9`); the warehouse reports healthy/running. Earlier successful statements above remain valid evidence, but reliable cold-start cloud latency is not established. No compute upgrade or timeout loosening was made. A final judge rehearsal must check the running warehouse; the app retains its explicit local fallback.
- Construction avoidance is current only until **2026-09-19T16:08:05.497499Z** (12:08 Eastern); before a later demo use the [refresh runbook](../databricks/NATIVE_PUBLIC_IMPORT.md). Missing/stale evidence removes the detour option rather than silently renewing it. This does not certify physical safety or complete closure coverage.
- Rishit's PR #16 is available and CI-green but uses frontend simulation and an illustrative map. It still needs API/evidence wiring and visual acceptance. Mahin's PR #15 reports deployed ANS/storage/monitoring acceptance but missing hosted Databricks credentials; our local SQL proof does not cure that deployment configuration gap. Those PRs have not been merged into this candidate.

The data/backend wiring is tested locally; the complete deployed student-facing product is **not** claimed done. Measured lighting, current foot traffic, comprehensive crime coverage, observed provider reliability and real provider bookings remain unavailable.

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
