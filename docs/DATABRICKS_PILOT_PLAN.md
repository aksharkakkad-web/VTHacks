# Expanded Beacon pilot implementation

Baseline: `fcf339d`, September 19, 2026. Implements the user-supplied expanded data-track handoff. This plan supplements, not replaces, the prior completed finish plan.

## Global constraints

- Local implementation and public-source reads only. No push, merge, deployment, paid service, or production mutation without explicit approval.
- Preserve the original checkout's uncommitted product-PRD edits and all teammate-owned files. No shared type/API/demo-value changes.
- Scheduled is not live; simulated is not booked; unknown is not zero, lit, open, or safe. Never infer sobriety or individual crime risk.
- Existing deterministic SQL and local parity, privacy, confirmation and location gates remain authoritative.
- Pilot zones need team agreement. Candidate zones may be proposed, not silently approved. Data-access gaps must remain explicit.

## Task 1: Complete official transit archive and 14-day service expansion

Owner: backend specialist. Worktree `/tmp/beacon-finish.cUGnBI`. You are not alone in the codebase: preserve others' work. Own only NEW `databricks/ingest/full_transit.py`, `databricks/ingest/test_full_transit.py`, `data/campus/transit-full/`, and `docs/DATABRICKS_FULL_TRANSIT.md`. Read AGENTS and required relevant track/data contracts; reuse existing `refresh_campus.py` helpers without modifying that file. No cloud writes, shared types, UI, runtime wiring, global setup changes, or new dependencies. Do not spawn agents.

Implement a standard-library importer for the complete official BT GTFS feed already configured in refresh_campus.py. Preserve the raw archive with source hash and normalized agency/stops/routes/trips/stop-times/calendar/exceptions/feed metadata. Validate referential integrity, sequence, finite coordinates and times; retain full current feed, not just demo stops. Expand at least 14 service dates into compact service-trip records with agency timezone and >24-hour timestamps; avoid materializing a quadratic all-stop-pairs table. Include an on-demand direct-journey query across arbitrary verified feed stop IDs that respects active service, later alighting order, pickup/drop-off restrictions, access walking time, missed buses, and overnight service. Return scheduled data only; unsupported transfers remain explicit rather than invented. Handle exceptions-only calendars and empty service dates honestly. Use source dates rather than hardcoded demo dates.

TDD: add and run failing fixture tests before implementation, then verify calendar additions/removals, overnight service, sequences/loops, missing or invalid references, non-finite coordinates, missed boarding after access walk, reverse/unsupported service and full-file retention. Run importer against the real official source; write capture/hash/counts/horizon/limitations/rights and refresh requirements to its manifest and documentation. CLI should support an explicit service-date start and days (minimum 14). Tests use small in-memory zip fixtures; preserve the existing demo importer unchanged.

Commit only your owned files, with a complete packet: outcome, files, decisions, RED/GREEN evidence, exact live source counts/hash, limitations, commit, and questions. No Git push. Write report to the task report path supplied by manager.

## Task 2: Honest decision evidence and pilot source contracts

Owner: manager. Own decision-client/evaluator files, new public-context validators, pilot coverage tooling and related documentation. First test and correct missing-transfer representation and misleading comparison explanations without silently reweighting the frozen policy. New ranking rules must have a new policy version and explicit contract. Research official lighting, pickup/waiting and live transit sources; capture evidence and unknowns. Build tests for source freshness, lighting outages, waiting windows and disconnected coverage. Do not turn draft pilot zones into enabled routes until agreed.

## Task 3: Verification and handoff

Owner: manager. Measure existing warehouse decision latency using 20 sequential read-only decisions; distinguish audit-disabled measurement from full end-to-end acceptance. Prepare repeatable full acceptance tooling without production writes. Run track, importer and repository checks; review specialist diff. Update inventory, data/route contracts, evidence, PRD addendum and Mahin/Rishit handoff with achieved quantities and external dependencies. Do not claim broad coverage, live UI wiring, operational lighting, visual dashboard acceptance or full end-to-end latency until actually verified.

## Interface checks

| Tasks | Shared boundary | Resolution |
| --- | --- | --- |
| 1 / 2 | Public transit files vs runtime decision | Additive full archive; existing two-corridor runtime stays stable until reviewed adapter |
| 1 / 3 | Manifest counts and live evidence | Report source hash and actual horizon; importer pass is not cloud deployment |
| 2 / 3 | Policy and unknown labels | Tests cover local/SQL parity; limitations included in handoff |
| 1 | Tests vs implementation | Small full-feed fixtures plus actual official fetch; no fixture advertised as live |
| 2 | Scope vs team contracts | No teammate-owned files or unapproved shared semantics |
| 3 | Measurement vs claim | Read-only ranking numbers cannot substantiate audited end-to-end target |

## Task 4: Proposed pilot network and complete coverage matrix

Owner: backend specialist. Manager found authoritative Town service: `https://tobmaps.blacksburg.gov/server/rest/services/transportation/Paths_to_the_Future/FeatureServer/0` (Existing layer; layer 1 is Proposed and MUST NOT be used). Service root says it mixes sidewalks, trails and bike lanes. Read field/type values before filtering; permit only explicitly pedestrian-compatible existing infrastructure, never bike-only/unknown classification. Reuse official VT graph tools and existing campus network without modifying existing route files or code.

Own NEW `databricks/ingest/pilot_coverage.py`, `databricks/ingest/test_pilot_coverage.py`, `data/campus/pilot/`, `docs/DATABRICKS_PILOT_COVERAGE.md` only. You are not alone: preserve all other edits. No subagents, runtime/shared/API/UI changes, cloud writes, push or merge.

Build a standard-library coverage tool accepting exactly five public departure anchors and five public destination anchors, checking all 25 forward pairs AND 25 reverse pairs. Reuse sourced geometry only; no straight-line connector, proximity-only component stitch, or proposed infrastructure masquerading as path. Return exact mapped geometry/distance/estimated walking minutes/source hashes/end offsets for connected network routes; for disconnected or outside coverage return explicit unsupported with null path/distance/time. Unknown entrances, closures, lighting, and accessibility must remain explicit. This matrix is network coverage, not operational clearance or a claim of current passability.

Fetch paginated existing Town geometry in WGS84 with completeness/coordinate validation, preserve raw snapshot and source metadata, combine only exact shared vertices with VT network. Missing crosswalk geometry must yield disconnected—not fake connectors. Add a DRAFT zone config proposed from authoritative named BT stop coordinates: cover downtown departure points and campus/residential destinations where data supports names. Explain every anchor's source stop ID; choose five distinct departure and five distinct destination locations. If five appropriate verified anchors cannot be chosen, use an empty proposed config and demonstrate 25-pair contract in fixtures, report selection blocker. Do not describe draft zones as team approved or enable them in runtime.

TDD: test 50 directional results, no invented lines for disconnected/out-of-range anchors, reverse geometry, wrong zone count/duplicate anchors/invalid coordinates, and rejection of bike-only/proposed Town edges. Real output must state proposed/unapproved and supported counts honestly; zero supported is preferable to fabricated connectivity. Store source capture/hash/attribution/freshness/limitations and command in owned doc. Commit only owned files and report tests (RED/GREEN), source quantities, coverage counts, decisions, limitations and exact integration contract at supplied report path.

## Task 5: Prepare native full-transit import and direct-query handoff

Owner: backend specialist. Own NEW `databricks/full-transit-native.mjs`, `databricks/full-transit-native.test.mjs`, `databricks/sql/full-transit-direct.sql`, `docs/DATABRICKS_FULL_TRANSIT_NATIVE.md` only. No edits to source data, existing native jobs, setup/runner, shared types/API/UI or runtime. You are not alone: preserve other work. No subagents, cloud writes, deployments, push or merge.

Prepare a bounded native Spark notebook generator for the validated Task 1 full-feed archive. Reuse existing native-public-import patterns. CLI defaults to printing summary and can write a generated notebook locally, but DOES NOT upload/run it. Use fixed `workspace.beacon` managed Delta table identifiers for stops, routes, trips, stop times, service trip dates and source manifest/calendar archive, with explicit schemas and source-version keys. Validate source archive hash, normalized table counts, keys/references and limits before packaging; avoid source names as SQL identifiers. Preserve immutable source versions with insert-only MERGE, count checks and completion marker last. Native notebook is a deployment candidate, not live proof. Do not make source JSON/SQL injection possible or put credentials in notebook. Keep notebook bounded; compress public payload once; retain numeric times/coordinates/stop sequence as typed fields suitable for SQL.

Supply a parameterized direct scheduled-journey SQL file joining completed feed version, active service date, ordered from/to stop occurrences and typed seconds, respecting access walk, pickup/drop-off restrictions, missed boarding, evaluation horizon and earliest arrival. Same-trip only; no arbitrary pedestrian access assumption or live-arrival label. Consumer passes public stop IDs, explicit verified access duration and evaluated time. No new server API/agent fields. Include source freshness/window constraints so expired capture cannot be advertised current; source refresh before demo documented.

TDD: generator tests must execute on small controlled fixtures and real validated capture; assert payload values/types/counts, invalid hash/reference rejection, completion order via executing or inspecting generated import plan (not tautological code strings). Document render/preview command, exact table/parameter/response contract, size/counts, source limitations and approval needed for deployment. Commit only owned files and report RED/GREEN and local verification; no live claim.
