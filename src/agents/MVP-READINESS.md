# Mahin backend readiness — September 19, 2026

Mahin's deployed coordination path passed three consecutive API runs with live
ANS verification and the explicitly labeled local decision fallback. This is
backend checkpoint G evidence. It does not mark the deployed mobile UI, a live
Databricks decision, or actual transportation as verified.

## Deployed version

- App: <https://beacon-kappa-sepia.vercel.app>
- Runtime commit: `dcaeedd2f5147fe02a9ffae01b786c9524031a92`.
- Vercel production deployment: `dpl_HC93Meb3kHUi8p2jsEuFsS8v24H2`, reported READY.
- Public evidence: <https://beacon-kappa-sepia.vercel.app/api/demo/campus-data>.
- ANS, public/provider HTTP, Vercel, Redis, and QStash are real integrations.
  Transportation offers and bookings describe simulated services. One registered
  operator exposes three callable provider services; these are not three
  independently verified businesses.
- The Student Agent calls Akshar's `evaluateTrip` adapter. This deployment still
  returns `LOCAL_POLICY_FALLBACK`: approved hosted Databricks credentials are absent.

## Requirement audit

| Mahin responsibility | Verification and result |
| --- | --- |
| Coarse discovery and normalized quotes | Three provider HTTP services; tests cover privacy allowlisting, malformed/expired/unavailable offers, timeout isolation, and capacity limits. |
| One recommendation and user confirmation | Deployed flow selects Campus Ride; requesting before confirmation returns 409. Fallback and simulated-source labels are asserted. |
| ANS identity and precise-location permission | Each deployed initial and replacement selection emits `ANS_VERIFIED`; local-demo trust is absent. Tests cover registration, certificate, lifecycle, expiry, and capability mismatches. |
| Booking and status | Actual authenticated HTTP calls to the hosted simulated services; Redis persistence and idempotency are covered by the existing integration tests. |
| Autonomous provider replacement | Cancellation collects fresh options, uses the decision adapter, verifies Independent Ride, and requests it without another confirmation. |
| Uncertain requests and interrupted recovery | Tests cover lost responses, request reconciliation, cancellation tombstones, delayed cleanup, persisted recovery, and no unconfirmed replacement. |
| Arrival and private-data cleanup | Deployed geofence arrival reaches ARRIVED, clears sensitive-data release, suppresses alerts, and resets only the synthetic session's trips. |
| Overdue and trusted-contact alert | Current regressions reach OVERDUE with no recipient and send no message. Earlier hosted schedule/arrival-suppression and one authorized Telegram acceptance test are recorded in `IMPLEMENTATION.md`. A read receipt is not claimed. |
| Server monitoring | QStash schedule `beacon-trip-monitor-v1` was unpaused and retained its two-minute cadence and expected authenticated endpoint. A read-only log check at 14:37 UTC confirmed DELIVERED/HTTP 200 for the 14:30, 14:32, 14:34, and 14:36 scheduled invocations. This check did not manually trigger the monitor. |
| Public safety evidence | All seven datasets are served from the production API. Current weather enters trip evaluation. Source-bound mapped walking candidates can use fresh intersecting closures. Historical/community/unknown labels and source links are preserved. |
| Teammate integration | Akshar's `fcfcb4d` track is incorporated. A fresh remote check found no additional commits on that branch or `main`; the existing PR stack was conflict-free. |

## Repeatable hosted verification

```sh
BEACON_SMOKE_URL=https://beacon-kappa-sepia.vercel.app \
BEACON_SMOKE_LIVE_ANS=true BEACON_SMOKE_NO_CONTACT=true \
node src/agents/smoke.mjs
```

Three consecutive runs completed between 14:33:45 and 14:34:03 UTC on September 19.
Measured total script durations were 6.31, 5.58, and 5.72 seconds. Each run checked
initial booking, automatic replacement, ANS events, owner-only evidence, arrival,
overdue handling, callback rejection, and fixture cleanup. Each used two synthetic
trips and submitted no notification contact. These are three functional checks,
not a production latency or reliability estimate.

Fresh local validation passed 67 backend tests, 48 decision/Databricks tests, and
the repository pre-PR checks: lint, four checkpoint tests, typecheck, and production
build. The backend suite initially hit the execution sandbox's loopback-listen
restriction; the same suite passed with that access enabled, without code changes.

## Remaining team integration

1. **Live Databricks in this deployment (checkpoint C):** add approved server-only
   `DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_ID`, and `DATABRICKS_TOKEN`, then verify
   an actual hosted trip emits `DATABRICKS_EVALUATION`. Akshar's separately recorded
   workspace tests are not evidence that this deployment has those credentials.
   The additive research uploader is prepared but no warehouse upload was executed
   from this checkout. See `docs/PUBLIC_EVIDENCE_DATABRICKS.md`.
2. **Mobile presentation and navigation (Rishit):** wire the documented trip calls
   and evidence view, show fallback/source labels, display provider names rather
   than backend domains, and run the phone/second-device demo. The API regression
   is not a mobile-browser acceptance test.
3. **Team review/merge:** the changes remain in the dependent PR stack. A checkpoint
   letter on this branch becomes a shared board signal only after merge to `main`
   and successful CI; no approval or merge was bypassed.

Mahin's A/B/D/E/F/G readiness is recorded; C remains open. Telegram replaces SMS
per the user's instruction. New private Telegram recipients still require their
own bot start, explicit contact consent, and server allowlisting.

The imported datasets are captured snapshots, with bounded refresh scripts and
expiry checks. There is no live pedestrian-count feed, measured route-wide
illumination, comprehensive crime history, or observed provider reliability data.
The lighting/crime/activity records do not produce a fabricated safety score.
For sources, exact counts, refresh commands, and data limits, see
`docs/PUBLIC_CAMPUS_EVIDENCE.md`.
