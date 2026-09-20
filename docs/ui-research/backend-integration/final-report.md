# Beacon backend integration handoff

**Current verdict: Beacon’s polished UI is fully connected to the backend.** All functional integration and regression gates below pass against the real local backend. The final port-3000 presentation smoke also passes with `gpt-5.6-sol` laptop-model inference. External providers remain explicitly simulated.

## Preservation and recovery

The preserved UI checkpoint is `4f00f4c`; integration branch is `codex/beacon-backend-integration`. Merge `cf26f9f` retains that checkpoint and `origin/main d252f6a` as parents. Nothing was pushed or deployed. To inspect/recover the checkpoint without overwriting the active worktree, use a separate worktree from `4f00f4c` or inspect files with `git show 4f00f4c:<path>`.

The four recorded merge conflicts were resolved individually: `next.config.ts` retains PWA/custom output-directory behavior and backend tracing; `src/app/page.tsx` preserves the polished entry; `src/components/safecircle/safe-circle-app.tsx` preserves the polished screen system; `docs/ui-research/integration-notes.md` combines both sets of integration notes. Polished components and newer backend routes coexist. This list is the integration owner's recorded conflict log, not an inference from the combined diff.

## Connected product

Normal `/demo` renders `BackendBeaconApp`, with one `useAtomicJourney` lifecycle, one atomic normalized response model, and one transport to `/api/trips/**`. The prior reducer/transport is isolated behind explicit fixture/manual mode and never activates after backend failure. The rough ConnectedJourney interface is not the normal consumer screen.

Onboarding saves preferences. Home creates an owned backend trip; discovery/planning supplies dynamic candidates. Screen 08 displays the actual recommendation and submits exact consent identifiers. `journeyContract: "beacon-journey-v1"` belongs on create; confirmation uses `journeyRevision`, selected `planId`, and provider `quoteId` when applicable. Changed/expired offers need fresh confirmation. Alternative cards are comparison-only because upstream has no arbitrary alternative-selection endpoint.

Verification, authorization, payment and booking stay distinct. Pickup/travel use supplied instructions, driver/vehicle/plate, ETA and update timestamps; absent values stay unavailable. Local demo identity and simulated rides/payment are labeled. No Lyft integration is claimed.

Active walking legs use backend geometry and navigation handoff. Waiting/riding/arrival hide walking maps. A provider-completed ride remains distinct from home arrival; the next walking leg or arrival action is preserved. The browser does not call a routing provider directly.

Recovery reconciles the original attempt, reflects changed terms and remaining budget, and requires new consent. Added public user cancellation uses a durable `cancellation` sidecar (`pending`/`resolved`) while keeping shared TripState unchanged. Same-attempt cleanup and payment settlement retry through the monitor; user cancellation does not trigger replacement or claim arrival.

Restoration persists an opaque trip ID and reloads the authoritative owner-scoped response. Missing/unauthorized trips retain their identity and never silently create another trip. Frontend polling is centralized, visibility/offline-aware, abortable, and rejects old revisions/response ordering. GET journey is read-only. The existing backend runtime independently calls `agent.monitor()` every 10 seconds outside Vercel; the isolated launcher removes `VERCEL` so this monitor runs. The protected monitor endpoint is also available for configured deployment scheduling. No browser timer manufactures trip status.

Arrival can be explicitly confirmed or established by backend location dwell. Cleanup-pending status does not claim provider access ended. Overdue and notification sidecars report exactly what the backend knows: simulated means no message sent; Telegram acceptance does not mean the contact read it. Saved phone contacts remain call shortcuts, not Telegram destinations.

## Latest completed checks

| Check | Latest result |
| --- | --- |
| Backend `bash src/agents/test.sh` | 242 passed (includes 2 active-planner snapshot race regressions) |
| Combined client/frontend tests | 94 passed, including 21 atomic adapter tests (main report) |
| `./scripts/pre-pr.sh` | Passed lint, 54 focused units, typecheck, production build (main report) |
| Real local backend browser | 43 checks, 52 screenshots, 3 recordings, 174 sanitized requests; no page/console/request/5xx errors; no healthy slow-request flashes |
| Lifecycle | 24 checks passed, including riding/arrival reload and labeled discovery/replanning snapshots |
| Edge states | 45 checks passed; injected cases separately labeled, actual denied browser permission and HTTP verification fault |
| PWA | 3 groups passed on production |
| Setup | 85 checks passed |
| Gallery | 46 examples passed in development (intentionally absent in production) |
| Explicit manual integration | 26 groups, 52 screenshots passed |
| Legacy flow/preferences/planning/sheets | Passed; planning 6 groups/13 screenshots, sheets 9 checks |
| Other repaired legacy suites | Complete 3 groups/16 shots; scenarios 17/44; trip-final 13 groups/24 audits; details 11/10 (main report) |
| `verify-safecircle.mjs` | 56 checks passed after updating obsolete fixture assumptions (main report) |
| Strict `verify-beacon-signoff.mjs` | 24 checks passed; zero page, console or request failures (final production rerun, main report) |

See `browser-results.json`, `lifecycle-results.json`, `edge-results.json`, `pwa/pwa-results.json`, and `acceptance-matrix.md`. Historical baseline failures remain preserved in `../beacon-signoff/tests/baseline/results.json`; individual reruns supersede them rather than hiding them.

## Evidence and operational scope

Recordings: `recordings/normal.webm`, `recordings/recovery.webm`, `recordings/cancellation.webm`. Screenshots: `screenshots/`. The browser verifier and main agent reviewed all three regenerated clips as 2fps filmstrips: normal recommendation/travel/arrival/Home, recovery fresh offer/travel/arrival, and cancellation pending/terminal are present without the earlier error flash. Fast verification/request steps also have dedicated screenshots captured while holding their actual responses; no arbitrary product linger was added to make synchronous states appear in recordings. Raw signed quote visuals were removed; superseded clips were quarantined outside the repository. Earlier fixture-transport recordings are not backend proof. Authenticated monitor startup smoke passed in `monitor-startup.json`.

Actual backend pickup layouts were checked at 360×800, 390×844, 393×852, 430×932 and 1440×900. Injected long/unknown data was checked separately. Setup verifies 44px controls/16px input fonts. This is not a claim that every keyboard/screen-reader/safe-area state was independently exercised.

The repeatable browser runtime executes real local API/session/planner queue/provider-request logic, with fixture planner inference, offline ranking, simulated rides and simulated notifications. The final port-3000 smoke additionally completes 11 checks with real `gpt-5.6-sol` inference (`modelSource: codex_subscription`, `explanationSource: llm_grounded`), while keeping ranking/providers/notifications honest. It does not prove live Databricks, ANS, Google Routes, or delivered Telegram messages. Operator credentials remain private temporary files, excluded from evidence. Production build uses a separate Next output directory; see `browser-testing.md`.

## Reproducible command inventory

Run from the repository root. The actual production proof URL is `http://localhost:3123`; the final presentation runtime may use port 3000. The private operator-file path is printed by the launcher; substitute its path without copying its contents into this document or chat. Browser suites use installed Chrome.

```sh
export PLAYWRIGHT_MODULE='/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
export BEACON_URL='http://localhost:3123'
export BEACON_BROWSER_URL='http://localhost:3123'
export SAFECIRCLE_URL='http://localhost:3123'
export BEACON_OPERATOR_FILE='/replace/with/private/runtime/operator.json'
```

Start repeatable production proof runtime in its own terminal (fixture model outputs, not real inference):

```sh
node scripts/start-beacon-browser-backend.mjs --production
```

Unit, contract and release checks:

```sh
bash src/agents/test.sh
node --test scripts/*.test.mjs
node --test scripts/beacon-atomic.test.mjs
npm run lint
npm run typecheck
npm run build
git diff --check
./scripts/pre-pr.sh
```

Current backend HTTP/UI proof (requires matching private operator file):

```sh
node scripts/verify-beacon-backend.mjs
node scripts/verify-beacon-lifecycle.mjs
node scripts/verify-beacon-edge-states.mjs
BEACON_EVIDENCE_DIR=docs/ui-research/backend-integration/pwa node scripts/verify-safecircle-pwa.mjs
```

Onboarding, explicit fixture regression, and repaired historical suites:

```sh
node scripts/verify-beacon-setup-final.mjs
node scripts/verify-beacon-integration.mjs
node scripts/verify-beacon-signoff.mjs
node scripts/verify-beacon-flow.mjs
node scripts/verify-beacon-preferences.mjs
node scripts/verify-beacon-sheets.mjs
node scripts/verify-beacon-complete.mjs
node scripts/verify-beacon-scenarios.mjs
node scripts/verify-beacon-trip-final.mjs
BEACON_DETAILS_ONLY=1 node scripts/verify-beacon-trip-final.mjs
node scripts/verify-safecircle.mjs
```

The gallery is deliberately developer-only. In a separate terminal start a gallery server; do not expect `/beacon-system` in a production build:

```sh
BEACON_DIST_DIR=.next-beacon-dev npm run dev -- --port 3124
```

Then run both developer gallery and mixed production-planning/developer-gallery checks:

```sh
BEACON_URL=http://localhost:3124 node scripts/verify-beacon-gallery.mjs
BEACON_GALLERY_URL=http://localhost:3124 node scripts/verify-beacon-planning-final.mjs
```

Keep fixture results separate from actual backend results. Rebuilding/restarting the isolated runtime changes its private operator file; refresh `BEACON_OPERATOR_FILE` before backend suites. `BEACON_OPERATOR_FILE` is not needed for fixture-only or gallery checks. Final strict signoff status must be checked in current results rather than inferred from this command list.

## Acceptance and final presentation runtime

All functional gates are closed: final canonical proof, all named historical-suite reruns, strict 24-check signoff, backend 242, combined client 94, and the final pre-PR lint/54-unit/typecheck/build checks pass. Historical baseline failures remain available and are superseded by individually passing current runs. Expanded restoration and error proof distinguish actual HTTP state, controlled response snapshots and deliberate HTTP faults.

**Port 3000 real-model presentation smoke: passed.** `real-model/results.json` records 11 checks, 0 page/console/failed-request/backend errors, grounded `gpt-5.6-sol` explanation, simulated booking, backend arrival, and Finish → Home. The ready presentation runtime is `http://localhost:3000/demo?walkthrough=1`.

Live Databricks, ANS, Google Routes, real ride booking/payment and delivered Telegram messages remain external, unverified integrations. These are not silently replaced with live-service claims. Arbitrary alternative selection and explicit walk-complete/board actions are absent upstream; the UI faithfully uses the supported recommendation and leg/location contracts.

Next visual-polish scope after acceptance: hierarchy and spacing with long real backend content, denser trip details, source/fee copy refinement, and motion consistency. Preserve the now-connected contracts and privacy semantics.
