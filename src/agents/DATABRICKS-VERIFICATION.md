# Mahin's live Databricks integration check

Verified September 19, 2026, 16:11–16:17 UTC, from runtime commit `9139668`.
The local Student Agent now has direct evidence of a real Databricks decision
and a completed trip flow. This is separate from the hosted Vercel deployment,
which still lacks Databricks configuration.

## Authenticated workspace checks

The locally supplied credential successfully executed SQL in the intended
workspace `dbc-6b71bd46-0c51.cloud.databricks.com`, using warehouse
`586a1b427679f515`. No credential values are included in this document or Git.

| Managed table | Rows observed before the test writes |
| --- | ---: |
| `workspace.beacon.route_context` | 285 |
| `workspace.beacon.source_manifest` | 6 |
| `workspace.beacon.route_evidence` | 3 |
| `workspace.beacon.transit_departures` | 754 |
| `workspace.beacon.decision_events` | 36 |

A subsequent aggregate-only check at 16:23 UTC found 2,067 rows in
`workspace.beacon.public_evidence_records` and zero in
`workspace.beacon.provider_outcomes`. The latter has outcome/timing fields but
does not yet contain observed provider reliability history. The public archive
import below does not populate provider outcomes or silently rebuild the separate
normalized evidence table.

The normalized table's dataset counts were activity 4, closures 14, crime 719,
emergency equipment 65, lighting 1,179, notices 20, and weather 66. Each category
contained one import version at this check (statement
`01f1b447-1f58-1bc0-8268-3b1bde2cdf0c`). These are stored record counts; source
coverage, age, and community-versus-official provenance still govern their use.

The timetable covers September 18–23. These are scheduled departures, not live
vehicle locations or current provider availability. The current weather-window
query found eligible rows for all three named corridors; the actual evaluator
successfully joined the managed forecast version below. Historical or superseded
context rows are retained and do not all represent current conditions.

The existing native refresh job `1118599535446767` was also read back without
starting or changing it. Its schedule was `UNPAUSED` and exactly matched the
repository's bounded six-hour configuration, with one concurrent run and a
600-second timeout. The latest run, `858791858455685`, completed `SUCCESS` from
12:00:03.738 to 12:06:26.932 UTC on September 19. This verifies that scheduled
refresh ran; it does not establish continuous or real-time source coverage.

## Live decision runner

`node databricks/run.mjs demo --live` passed all seven decision scenarios. Every
decision asserted `engine: databricks` and a successfully persisted audit. The
transportation offers remain explicitly simulated.

| Scenario | Result | Statement ID |
| --- | --- | --- |
| Normal choice | Campus Ride demo | `01f1b444-e38d-1da0-a737-30c58fdd6351` |
| Campus ride cancels | Independent Ride demo | `01f1b444-eaa5-1921-bc91-3e9648a05850` |
| Budget reduced to $6 | Transit demo | `01f1b444-eda7-12ae-ba7d-703d86365b17` |
| Cheapest after cancellation | Transit demo | `01f1b444-f05c-1679-b087-0437d71f1a7f` |
| Zero walking allowed | No feasible plan | `01f1b444-f2f3-18dc-9ca2-c6ac720722a3` |
| Current managed weather | `nws-934020001f77-3b42f56865fc-2026-09-19T16:00:00Z`, clear | `01f1b444-f5d1-14d9-a8ae-ac275dc62602` |
| Historical GTFS replay | Scheduled $0 option | `01f1b444-fa68-1a44-a7f3-f553c1acfda7` |

The managed GTFS lookup statement was
`01f1b444-f984-1e79-ba92-6f0d2a0400e7`. The replay's access and egress walking
times are labeled demo assumptions; this does not prove a live bus arrival.

## Student Agent HTTP integration

An isolated local Next.js server used the actual Databricks credential, live ANS,
the existing hosted simulated providers, a temporary local trip store, and
simulated notifications. Its four Databricks table settings pointed to
`workspace.beacon.route_context`, `decision_events`, `transit_departures`, and
`route_evidence`. No production environment setting changed.

```sh
BEACON_SMOKE_URL=http://127.0.0.1:3100 \
BEACON_SMOKE_LIVE_ANS=true BEACON_SMOKE_NO_CONTACT=true \
BEACON_SMOKE_DECISION_ENGINE=databricks node src/agents/smoke.mjs
```

The existing HTTP smoke passed initial discovery and selection, confirmation,
ANS verification and authorization before booking, autonomous provider
replacement, arrival, overdue handling, owner-only evidence, callback rejection,
and cleanup. Initial recommendations asserted `DATABRICKS_EVALUATION` and
`SIMULATED_TRANSPORT`; both initial and replacement providers had live ANS
verification. No notification contact was submitted and no Telegram message was
sent. The local server was stopped and its temporary trip store removed afterward.

This meets Mahin's checkpoint C responsibility of feeding provider options into
Databricks and using the returned choice for a trip. It does not mark Rishit's
phone UI, actual transportation, or a hosted Databricks trip as verified.

## Public research verification

The pre-existing completed import
`88c483ad49b430d4e77e0c35b59243e3727477803ff74a283e548f5bc20719b9`
passed reconstruction and SHA-256 checks for all 22 JSON documents across 386
stored parts. Its 3,519 indexed parts and 3,505 distinct items matched its
completion manifest. No file failed verification.

Nineteen document hashes matched this checkout. `closures.json`,
`refresh-status.json`, and `weather.json` contained different captured versions.
A separate incomplete import matched this checkout's bundle ID; its four stored
parts initially had no completion marker. Resuming the insert-only upload then
completed all 282 statements at 16:30:36.574 UTC, including completion-marker
statement `01f1b447-702d-160f-8dcd-ffc1a9c0b791`. The current bundle's additional
checksum/count read-back was blocked after the local token expired; it is not
recorded as verified. See `docs/PUBLIC_EVIDENCE_DATABRICKS.md` for the exact bundle
ID, upload result, and remaining check.

## Remaining hosted authentication

Vercel production had no Databricks settings at this check. The local bearer
credential was accepted by the workspace, but its expiry claim is
`2026-09-19T16:41:29Z` (12:41 p.m. Eastern). It was not copied into Vercel.
The subsequent import read-back returned `WORKSPACE_AUTH_FAILED`; at the
16:55 UTC configuration check the same expired token remained saved, and no
OAuth client ID or client secret was configured. Fresh access is needed to
repeat live queries; the successful earlier trip test remains historical proof.

Durable hosted access needs an approved app credential and automatic token
renewal, or another approved server credential supported by this workspace. The
current server adapter reads a static `DATABRICKS_TOKEN`; OAuth client-secret
renewal is not implemented merely by saving client ID and secret variables.
Configure the approved managed-table names as well, then rerun the no-contact
HTTP smoke against Vercel with `BEACON_SMOKE_DECISION_ENGINE=databricks`.

No shared types, API paths, decision policy, fixture values, or student UI changed
for this verification.
