# Journey-track acceptance record

Verified September 19, 2026. Local branch `codex/complete-journey-track`, worktree `/private/tmp/beacon-finish.cUGnBI`. Its starting tree was identical to fetched `origin/main` (`ef8b2bd`, merged PR #22); original worktree tip `34a3c63` and unrelated `docs/BEACON_COMPLETE_APP_SCREEN_INVENTORY.md` were preserved. PR #23 remains open at `bcf8d946b6dda5eb2bc66b4a011ab8c134216410`; its pickup protocol limitations are documented in the handoff.

## Completion gates

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Walk, direct bus, provider ride generation | Implemented and tested with routing/offer fixtures; live walking configuration missing. Native direct-bus query executed, with no eligible departure for that real test's nearby pairs. |
| 2 | Waiting/pickup selection and departure | Passed current-location, short pickup walk, confirmed shelter relocation, closed/unknown access, closing-time and bus boarding-buffer tests. |
| 3 | Budget, walking, closures, expiry, liabilities | Passed zero/no-walk, aggregate walking, exact failed-service exclusion, liability cap, offer expiry and future closure interval regressions. |
| 4 | Honest lighting/crime evidence | Passed provenance, matched geometry/building names, stale/missing coverage, historical measurements and no safety-score tests. |
| 5 | One selection, up to three alternatives | Passed distinct IDs and bounded output tests. |
| 6 | Geometry/timing/next instruction/offer binding | Passed exact provider geometry, disconnection, continuous legs, time agreement, duplicate quote and local-stop/native-source binding tests. |
| 7 | Cancellation/replanning inputs | Passed updated objective, budget/liabilities, failed service and replacement-offer tests. Booking reconciliation remains coordinator-owned. |
| 8 | Databricks validation/audit/fallback | Passed native score/order/cardinality validation, read-only default, opt-in audit success/failure/privacy, expiry-after-audit labeling and local fallback tests. Real ranking/read checks passed; no new cloud audit was authorized or attempted. |
| 9 | Refresh implementation/status | Local weather/closures/transit/lighting refreshed and activated in canonical local data. Existing finite Databricks job enabled/latest run successful. New cloud imports/job coverage need approval. Crime refresh reported a published missing-cell gap and preserved history. September 19 waiting hours were re-reviewed in the rendered official pages and imported locally; future dates require review. |
| 10 | Regression/lint/typecheck/build | All final commands passed; counts below. |
| 11 | Complete journey against real services | **Blocked by approved routing key.** Real SQL plus fixture routing/simulated offers is documented as partial service verification, not a complete live journey. |
| 12 | Mahin/Rishit callable interface/examples | Delivered `getCompleteJourney`, typed request/result, complete fixture JSON, source/expiry rules and exact remaining API/UI/provider wiring in `JOURNEY_HANDOFF.md`. No messages sent or teammate code silently changed. |

## Actual final checks

- `node databricks/run.mjs test`: **165 passed, 0 failed**.
- `node --test databricks/*.test.mjs`: **39 passed, 0 failed**.
- `bash src/agents/test.sh`: **76 passed, 0 failed**.
- `bash scripts/pre-pr.sh`: **lint passed, typecheck passed, production build passed**, plus **25 checkpoint/UI-state tests passed**.
- Existing bundled Python, `unittest discover -s databricks/ingest -p 'test_*.py'`: **73 passed**.
- Same Python, `unittest discover -s databricks/jobs -p 'test_*.py'`: **6 passed**.
- `git diff --check`: passed.
- Complete fixture example regenerated successfully; no service or booking claim.

Failures found and fixed during this task included a Next-specific `ProcessEnv` typing requirement, legacy tests assuming source refresh renews derived geometry, future closures inside later legs, SQL tie/order mismatch, conflicting quote bindings, and same-GTFS-hash recapture metadata. Tests preserve the production expiry behavior instead of loosening it. System Python lacked `pdfplumber`; the existing bundled runtime passed the full ingestion suite without installing dependencies.

## Real checks and activation boundary

[Journey handoff](JOURNEY_HANDOFF.md) records actual SQL statement IDs: warehouse reachability, 20 Delta tables, transit marker, 51 existing audit rows and the new native journey rank query. All were read-only. No complete live walking route was exercised.

[Refresh runbook](JOURNEY_REFRESH.md) records real public fetches and existing Databricks job/run IDs. Canonical local status was checked at `2026-09-19T22:24:44.820Z`: weather current until 23:00 UTC, closures until 23:11:47 UTC, transit daily review deadline September 20 22:11 UTC, lighting inventory current, September 19 waiting hours subsequently re-reviewed and imported, crime/measured lighting historical. These are expiring snapshots, not continuing guarantees. Run `node databricks/refresh-track.mjs --status` for the current state. The last local attempt reports the successful waiting review import. The earlier crime refresh remains partial with prior history preserved.

## Smallest actions to resume live completion

1. Configure an already approved walking-routing account/key (`BEACON_WALKING_ROUTER=google_routes`, server-only `GOOGLE_ROUTES_API_KEY`) and authorize its live requests; no paid setup has been approved.
2. Approve the exact reviewed cloud imports/job coverage change if activating refreshed managed data. Prepared local import generators and readbacks are documented; no cloud writes occurred. Enable journey audit writes only if explicitly approved.
3. Mahin supplies a supported, quote-bound pickup/drop-off/timing sidecar; PR #23's current coarse fixture does not establish pickup permission. He wires this handoff through the existing coordinator/API, and Rishit renders these legs. Those integration tasks remain distinct from data implementation.

No push, merge, deployment, paid activation or external publication was performed. All twelve gates are not met, so this record does not declare the Databricks track complete.
