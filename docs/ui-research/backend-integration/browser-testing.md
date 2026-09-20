# Backend browser acceptance

`scripts/start-beacon-browser-backend.mjs` starts an isolated local runtime on port 3123 and simulated provider services on 4311–4313. It uses the actual `/api/trips/**` routes, session ownership, planner queue, journey response, provider requests, and notification implementation.

For repeatable UI checks only, the laptop planner returns explicit fixture outputs, ranking runs offline, providers are simulated, and notifications are simulated. A passing run proves the HTTP/UI integration, not real model inference, live rides, Databricks execution, or delivered messages.

Start the runtime:

```sh
node scripts/start-beacon-browser-backend.mjs
```

It prints the location of a private temporary `operator.json`, protected with mode 0600. Do not commit that file or copy its credentials into evidence. Run the browser checks using that location:

```sh
BEACON_OPERATOR_FILE=/private/runtime/operator.json node scripts/verify-beacon-backend.mjs
```

The browser pairs through the UI and completes onboarding. Real demo endpoints explicitly trigger scenario changes and simulated provider events. Normal consent, cancellation, and arrival actions use the visible student UI. Screenshots, three recordings, and a sanitized result report are written in this directory.

The default runtime uses `.next-browser-backend`, separate from the presentation app's build. `--production` builds and starts that directory; `--production --skip-build` reuses an existing compatible build. Next may add the separate generated type directories to `tsconfig.json` when starting dev mode.

Stop the runtime with Ctrl-C. It terminates only its child services and retains temporary state privately for diagnosis.

Set `BEACON_PORT=3000` to use the presentation port. Backend, browser, smoke, and context-agent URLs follow the selected port. The provider ports remain 4311–4313, so stop the previous runtime before starting a second one.

## Verified result

The completed frozen production browser run passed 43 checks with 52 screenshots, three 390×844 recordings, and zero page errors, console errors, failed browser requests, or HTTP 5xx responses. It covered UI onboarding and pairing, real trip creation, stale-consent rejection, cross-browser ownership protection, confirmation and booking, refresh, visibly rendered approaching/arrived/riding/completed provider stages, normal arrival and Finish → Home, provider failure with fresh replacement consent, cancellation pending during a held real request and restored after reload, backend walking geometry, and overdue without an invented contact notification. A UI mutation observer confirmed that healthy planning never flashed the slow-request error screen.

Pickup layouts were checked at 360×800, 390×844, 393×852, 430×932, and 1440×900. The test masks the short-lived pairing credential while recording. Failed development recordings were moved out of the repository into the private temporary runtime directory; the evidence directory contains only the three completed named recordings.

See `browser-results.json`, `screenshots/`, and `recordings/normal.webm`, `recordings/recovery.webm`, and `recordings/cancellation.webm` for the evidence. This result uses the explicit fixture inference/runtime described above.

`browser-results.json` includes a sanitized network trace: route path, HTTP method/status, UI-versus-test-driver origin, and confirmation identifiers only. It excludes request headers, pairing codes, credentials, coordinates, and other payload fields. Provider advancement waits for the actual visible status heading and a rendered screenshot before proceeding; no arbitrary recording sleeps are used.

All three final clips were reviewed using 2 fps filmstrips. Fast verification and booking calls do not artificially linger; screenshots captured while the real outgoing requests were held prove their pending screens. The screenshots and recordings use actual UI states and contain no fabricated status progression. The confirmation trace retains quote UUIDs but redacts their signed suffixes.

`monitor-startup.json` records a successful authenticated `/api/trips/monitor` startup check. Local monitoring is already owned by the server's single 10-second loop in `src/lib/trip-state/runtime.ts`; the launcher adds no duplicate scheduler. The loop reconciles uncertain bookings, provider cancellation and cleanup, and overdue status. Demo ride stages still require explicit provider/operator updates.

Diagnostic scope: the canonical 43-check fixture receipt was captured before aborted-request diagnostics were retained, so its zero failed-request count does not establish an abort count. The current harness records expected GET navigation/RSC/journey-read cancellations in `abortedRequests`; POST aborts and unclassified failures remain test failures. The separate real-model smoke uses that stricter recording from its first run and does not overwrite the canonical fixture evidence.

## Real laptop-model smoke

The presentation runtime was started with `BEACON_PORT=3000 node scripts/start-beacon-browser-backend.mjs --production --real-model`. This uses the existing bounded Codex planner connection; it does not request a new API credential. The launcher builds the correct public runtime label (`NEXT_PUBLIC_BEACON_TEST_RUNTIME=0`) and retains offline ranking, synthetic campus data, simulated providers/payments, and simulated notifications.

`scripts/verify-beacon-real-model.mjs` completed 10 checks against that runtime, with four screenshots and 26 sanitized API response records. The actual planner returned `model=gpt-5.6-sol`, `modelSource=codex_subscription`, and `explanationSource=llm_grounded`; the browser waited until that exact grounded explanation appeared in the offer. The UI completed consent, simulated pickup, manual arrival, and Finish → Home. Page/console errors, failed requests, and recorded aborted requests were all zero. See `real-model/results.json` and its screenshots; `real-model/monitor-startup.json` confirms the authenticated startup monitor check.
