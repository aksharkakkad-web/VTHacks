# Akshar: finish the Beacon backend integration

**Paused at the user's explicit request on September 19, 2026. This is a work-in-progress checkpoint, not a merge-ready or demo-ready release.** All implementation/review agents were interrupted. Continue from the branch below rather than recreating the work.

Repository: `https://github.com/aksharkakkad-web/VTHacks`

Branch: `feat/oauth-agent-demo`

Mahin's implementation checkout: `/Users/mahin/.config/superpowers/worktrees/VTHacks/provider-network-pivot`

Main checkout: `/Users/mahin/VTHacks` (a different branch; do not overwrite it).

On another machine, use a clean checkout/worktree:

```sh
git fetch origin
git switch --track origin/feat/oauth-agent-demo
```

If that local branch already exists, switch to it and inspect local changes before pulling. This branch already integrates the earlier provider-network backend and the Databricks main revision `ef8b2bd`; fetch main again and assess subsequent changes before merging. Do not cherry-pick only the final checkpoint: earlier commits contain necessary code.

## Product and ownership

Beacon owns a student's journey home: discover options, collect quotes/evidence, ask Databricks to select an admissible complete journey, validate it in code, obtain explicit consent, verify/authorize a provider, book, monitor, reconcile failure and replan. It does not predict crime or certify safety.

- Mahin owns backend coordination, journey state, provider adapters and **Google Routes/maps adapter**. The user explicitly assigned Google routing to Mahin; API access and billing remain pending.
- Akshar owns Databricks evidence, constraints, ranking and complete-journey evaluation. Preserve its policy; do not add a parallel LLM safety score.
- Rishit owns the frontend. The latest instruction was **backend only**. A previously committed frontend slice exists, with unresolved review findings listed below.
- Current transport/payment are simulated. `lyft-demo` is a developer example operated by Beacon, not a real Lyft integration. A separate task prepared a Lyft application form; it did not establish verified API/sandbox/booking access.
- Do not expose exact location to transport providers before current consent, verified identity and bounded authorization. Do not send new Telegram alerts during tests. Use simulated notifications or omit contacts.

The hybrid planner is: LLM interprets bounded intent; Databricks computes/ranks; code validates and authorizes; LLM explains validated facts. The laptop model uses official Codex app-server and the demonstrator's managed ChatGPT login. OAuth powers inference, not ANS verification or provider booking permissions.

## Read these documents

1. `AGENTS.md`, `docs/TEAM_CONTRACT.md`, `docs/Beacon_Product_Direction.md`.
2. `docs/superpowers/plans/2026-09-19-beacon-oauth-agents-demo.md` — complete original implementation/acceptance plan; its unchecked boxes are not current completion evidence.
3. `docs/BEACON_BACKEND_CONNECTIONS.md` — latest routing/journey/provider/arrival contract notes.
4. `docs/BEACON_OAUTH_DEMO_RUNBOOK.md` — setup and physical-phone acceptance. Some proposed names need reconciling: current implementation uses `BEACON_CONTEXT_SERVICE_TOKEN`, while the older runbook says `BEACON_CONTEXT_AGENT_TOKEN`.
5. `docs/MAHIN_MVP_CONTRACT.md`, `docs/MAHIN_MVP_STATUS.md`, `docs/PROVIDER_DEVELOPER_GUIDE.md`.
6. `docs/DATABRICKS_APP_HANDOFF.md`, `docs/DATABRICKS_FULL_VISION_COMPLETION.md`.

## What is already in the branch

Earlier checkpoints:

- `4e7bab8`: private OAuth adapter and real Sol smoke.
- `4083f8b`: connected PWA/activity UI (earlier scope, needs frontend follow-up).
- `2ff2b18`: laptop polling worker and sanitized activity storage.
- `d5d3b2b`: context service, Lyft-style simulated provider and gated Google adapter.
- The pause checkpoint containing this file adds all remaining in-progress queue/orchestrator/journey/arrival/status/monitor work. See `git log -1` for its hash.

### Model worker

`tools/beacon-laptop-worker/{client,schemas,worker,worker.test}.mjs`

- Official local JSON-RPC app-server, managed `chatgpt` auth, model discovery, Sol first/Terra fallback when available, low reasoning.
- Empty temporary workspace; inherited MCP/plugins/apps/hooks and execution tools disabled. OAuth credentials remain in Codex's managed store. No model API-key fallback.
- One model job at a time; claim/heartbeat/complete/tick loop; bounded job deadline; identical completion retry without rerunning inference; rate-limit/auth failure pauses model claims.
- `scripts/planner-auth-smoke.mjs`, `scripts/planner-generate-secret.mjs`.

### Backend planner

`src/lib/planner/{contracts,validation,store,queue,orchestrator,runtime,http}.ts`

- File storage for explicitly local single-process execution; Redis compare-and-set state for hosted concurrency.
- Hashed, single-use pairing codes; owner-bound pairing; queue caps; leases; stage leases; snapshot-bound completions; template explanation fallback.
- Static owner routes: `POST /api/demo/planner/pair`, `POST /api/trips/:id/planning`, `GET /api/trips/:id/activity`.
- Worker-only internal routes: `claim`, `heartbeat`, `complete`, `tick`, `pairing` under `/api/internal/planner/`.
- Student Agent snapshot/evaluation hooks and evidence planning sidecar. No model wait holds a trip-store lock.

### Real activity

`src/lib/agent-activity/{contracts,redaction,store,runtime}.ts`

- Separate per-trip storage, ordered events, deterministic IDs when caller provides correlation IDs, bounded retention, operation-specific allowlists.
- Call wrapper emits before dispatch and after completion; telemetry failure does not replay a booking. Trace gaps are exposed.
- Student service and planner have boundary instrumentation. Complete coverage and durable state-transition/outbox behavior still require review.

### Context and provider examples

- `src/agents/context/{contract,service,http-client,runtime}.ts`, `src/integrations/ans/context-directory.ts`.
- Context HTTP route and public agent card under `/api/demo/context-agent/`.
- Strict named-public-corridor inputs; local/managed public adapters, historical context, waiting-hours evidence; optional fixed official-source metadata retrieval. Leads stay non-ranking.
- Separate compatible ANS context capability parser; identity/TLS checks; exact scoped credentials; allowlisted peers with one-hop/two-peer limit.
- `src/agents/developer-demo.ts` adds `lyft-demo` without changing frozen existing fixtures. Hosted routes and standalone demo server support it.

### Latest backend-only additions — just written, integration unfinished

- `src/lib/routing/google-routes.ts`: injectable, disabled-by-default walking adapter. Returns actual response geometry, directions, seconds/meters, warnings and source labels; no rank/booking logic.
- `src/lib/journey/{contracts,snapshot,arrival,provider-status}.ts`.
- `GET /api/trips/:id/journey` returns one record's journey, trip, consent/payment view, ride observation, arrival policy and notification status.
- `journeyContract: "beacon-journey-v1"` on trip creation opts into mandatory `journeyRevision` on confirmation. Existing quote-bound consent remains required. Legacy clients remain compatible; assess whether opt-in is sufficient for release.
- `POST /api/trips/:id/replan` accepts current `journeyRevision` and reason `route_changed`, `pickup_changed` or `conditions_changed`; reconciles an existing booking before reevaluation.
- Provider trip responses accept optional typed `details` for stage, pickup ETA, instructions, driver/vehicle and provider timestamp. Existing lifecycle status remains unchanged; unknown details stay null.
- Arrival now requires sufficiently accurate fresh samples and continuous dwell. Provider ride completion was changed to keep the journey active for actual home arrival instead of treating a completed ride as proof of reaching home.
- `tools/beacon-monitor/monitor.mjs`: separate authenticated monitor loop, independent of OAuth and device location.
- `scripts/hybrid-demo-smoke.mjs`: complete-flow smoke scaffold using a paired owner, actual worker, simulated providers, no contact. **Not run yet.** Its fixture-model option must not be presented as actual inference.

## Verified evidence — do not extend these claims to the final checkpoint

- Before latest planner/journey edits, baseline agent suite: **131 passed**; Databricks suite: **125 passed**.
- Real managed-login smoke passed on installed Codex **0.155.0-alpha.9.2**, `gpt-5.6-sol`, low reasoning, structured JSON, no tool execution. Observed run was about 7.4 seconds. This proved local inference only.
- Worker + independent monitor focused tests: **17 passed**.
- Activity focused tests: **5 passed**.
- Context focused tests: **5 passed**.
- Provider HTTP conformance including Lyft-style example: **11 passed**.
- Google adapter mocked HTTP tests: **4 passed**; no live Google request.
- Arrival policy unit tests: **3 passed**.
- Ride detail tests: **2 passed**.
- Backend implementer reported **28 focused planner/network tests passing before the final journey edits**.
- Agent TypeScript compilation passed immediately after the parent added the journey/arrival/service changes. A new planner HTTP test was still being developed around the pause; rerun compilation and all suites.
- No final whole-branch typecheck/lint/build, complete hybrid HTTP smoke, deployed bridge test or physical-phone test has passed for the pause checkpoint.
- UI slice earlier had seven helper tests/scoped lint/typecheck passing; its spec review found the issues below.

Local loopback HTTP tests needed execution outside the restricted shell sandbox (`listen EPERM` otherwise). Earlier Turbopack production build also hit an environment port/process restriction. Do not misreport an environment failure as a passing build; try `next build --webpack` if needed and report the exact command.

## Finish in this order

### 1. Stabilize the checkpoint and review the latest changes

Run the full tests first and inspect actual failures. Do not assume the last checkpoint is green. No further implementation or review happened after the pause.

Important known unfinished points / review targets:

1. **Runtime wiring is incomplete.** `src/lib/trip-state/runtime.ts` still imports the original `demoDescriptors`; wire `configuredDemoDescriptors(origin, includeLyft)` for the new service and hosted endpoints. Keep tokens scoped and local trust honest. The current runtime also still passes `evaluateTripIntelligence` directly: disable its redundant AI (`enableAi:false`) for the hybrid path without changing Databricks scoring.
2. **Arrival integration changes need regression repair.** Older `trips.test.ts` and `src/agents/smoke.mjs` expect a single location sample or provider completion to cause ARRIVED. Update tests to the new intended behavior, not by weakening accuracy/dwell. Add full service tests for missing/poor accuracy, dwell, stale/out-of-order data, GPS loss, manual arrival and overdue handling.
3. **Provider completion/deadline control flow needs immediate inspection.** Monitor/reconciliation/recovery previously returned after `arrive()`. Some now return after `providerCompleted()` instead. Ensure the alert deadline is still checked for a completed ride while home arrival is unconfirmed; repeated completed status must not starve overdue handling. Do not suppress a real overdue alert just because the ride leg ended.
4. **Journey binding/consent needs end-to-end tests.** Ensure revision persistence is correct across selection, confirmation, authorization, new liabilities, recovery, expired route/weather evidence, explicit replan and arrival. `syncJourney` currently updates from service log calls; audit all mutation paths. Verify a stale revision/quote cannot book and that no mutation invalidates a valid confirmation before the initial booking unintentionally.
5. **Planner read/recovery race needs review.** `HybridPlanner.view()` currently may invalidate/restart a stale run while reading evidence. Trip snapshots include changing state/consent/liabilities. Check polling during evaluation/booking/recovery, one active run per owner, no repeated inference/evaluation, stage crash/restart idempotency, expiry, and invalidation after arrival/reset. A read must not cause uncontrolled model work.
6. **Context timeout/caching/trace coverage needs review.** Client timeout is 15 seconds while sequential option lookup + research + peer delegation can exceed it. Reuse already loaded evaluator evidence where possible instead of duplicate managed queries. Verify current-readiness/historical-lighting normalization and that context discovery/verification/delegation/source lookups emit real correlated trace events. Some exist only behind the coarse context.query trace today. Generic search is not implemented.
7. **Ride stages are not fully exercised.** Optional detail parsing and observations exist, and provider callbacks were extended. Verify timestamp ordering, contradictory terminal/detail stages, duplicate events and prevention of backwards stages. Existing simulated provider does not synthesize a driver/vehicle or progress through every stage. Missing values must remain unknown. Add provider-driven simulation controls only if explicitly labeled and server-authoritative.
8. **Notification semantics need review.** Existing send acceptance failure is `uncertain`; no blind retry (Telegram cannot guarantee idempotency). Separate known pre-send failure from ambiguous send where useful. Suppress unsent alerts after recorded arrival; retain conservative treatment of already-dispatched messages. Never send a real alert for these automated checks.
9. **Activity outbox/reliability not fully accepted.** Separate event storage is implemented, but not every state mutation has a transactional durable outbox. Check correlation/deduplication, trace-gap visibility, retention and no false source/identity labels.
10. The private model client's complete isolation/error mapping and worker deadline behavior had a review in progress; it was interrupted. Finish spec and quality review, especially auth/rate-limit classification, oversized output shutdown and dead/expired leases.

### 2. Wire complete journeys to Akshar's layer

Keep existing proven decision adapter until the explicit v2 offer mapper is tested. `ProviderWireOffer` and Akshar's `DecisionNetworkOffer` are different types. Preserve exact operator/service/quote/version binding. Deduct liabilities exactly once: original budget + committed liabilities OR remaining budget + zero liabilities. Never count a pending refund as released funds.

Connect the Google walking result into your complete-journey candidate builder once access is available. Do not draw a route from arbitrary points or fabricate access/egress segments while waiting for keys. Route geometry, walking duration, waiting/pickup locations, timings and provider offer must belong to one versioned journey. Changed conditions trigger reevaluation and fresh approval where required.

### 3. Complete local and hosted end-to-end checks

```sh
npm ci
bash src/agents/test.sh
node databricks/run.mjs test
node --test tools/beacon-laptop-worker/worker.test.mjs tools/beacon-monitor/monitor.test.mjs
node --test src/lib/client/beacon-client.test.mjs
./scripts/pre-pr.sh
node scripts/planner-auth-smoke.mjs
```

Then run an isolated Next server, demo providers, planner worker and context endpoint with fresh test secrets/state. Use `BEACON_NOTIFICATION_MODE=simulated` and no contact. `src/agents/serve-demo.sh` serves the provider HTTP fixtures (ports 4311–4314 when Lyft example is enabled). Do not kill unrelated listeners.

For the new smoke:

```sh
# Set the matching backend worker secret privately; do not print it.
BEACON_SMOKE_URL=http://127.0.0.1:3123 node scripts/hybrid-demo-smoke.mjs
```

The smoke expects the new journey endpoint and opt-in revision contract. It exercises initial plan → exact confirmation → verification → simulated booking → cancellation/settlement → replacement → rejection of stale consent → fresh confirmation → arrival → worker loss. It creates/cleans only its own owner session. Add wrong-owner (not just anonymous) checks, real Redis competing-worker tests, expiry during inference and crash recovery.

Do not run the smoke against a deployment without verifying it is configured for simulated providers and no real notifications. The script itself omits contacts.

### 4. Hand the frontend fixes to Rishit

Do not call the existing UI integration complete. Review found:

- Separate trip/evidence polls can mix an old operator with a new offer. Read the atomic journey, require matching revision and exact quote, and suppress approval during mismatch.
- Activity/evidence failure currently prevents a successful trip poll from updating UI because of a shared Promise.all. Degrade telemetry independently and refresh authoritative action state.
- Payment decline lacks a valid recovery path; cancellation terms, retained fees and remaining budget are not shown.
- Confirm/verify/request partially succeeding must refresh state even if the next call fails.
- Cancel/manual-arrival controls need state/capability gating.
- Programmatic smooth autoscroll must honor reduced motion.
- New journey clients must send `journeyContract` at creation and `journeyRevision` with approval/replan. Do not introduce frontend timer-driven authoritative stages.

### 5. Deployment and acceptance

Create a reviewable PR after tests pass; this handoff does not claim main was merged or a deployment occurred. Hosted trip/planner/activity/provider state requires Redis. Hosted providers/context must have reachable URLs, not laptop loopback addresses. Set up and verify an always-on authenticated monitor; a Vercel interval is insufficient. Existing QStash configuration names exist locally, but its live schedule was not verified in this work.

Finally test the installed phone PWA over cellular, with the laptop on another network. Test reconnection, provider cancellation/reconfirmation, accurate-location arrival/manual arrival, location loss, worker disconnection and notification failure. Report separately: actual model inference, actual HTTP, managed Databricks vs fallback, actual ANS vs local demo, simulated transport/payment, research freshness and notification acceptance. No safety guarantee.

## Secrets and setup boundaries

Mahin's existing `/Users/mahin/VTHacks/.env.local` remains local and ignored. It has Databricks, ANS, hosted-provider, Redis/KV, monitor, QStash and Telegram configuration names. Values were not printed or copied to this branch. This implementation worktree has no `.env.local`. Presence of a variable is not proof the credential or service is usable.

New names:

- Server: `BEACON_PLANNER_MODE=codex_laptop`, `BEACON_PLANNER_WORKER_TOKEN` (32+ random characters).
- Worker private file `~/.config/beacon-demo/worker.env`: matching worker token, `BEACON_BACKEND_URL`, optional `BEACON_CODEX_BIN`, `BEACON_PLANNER_MODEL=gpt-5.6-sol`.
- Context: `BEACON_CONTEXT_AGENT_URL`, `BEACON_CONTEXT_SERVICE_TOKEN`, optional `BEACON_CONTEXT_SOURCE_LOOKUP`, `BEACON_CONTEXT_PEER_ALLOWLIST`, `BEACON_CONTEXT_PEER_CREDENTIALS`.
- Demo: `BEACON_LYFT_DEMO=true`; existing provider token/origin/hosted variables. Ensure local and hosted tokens match only for the explicitly self-operated service.
- Routing: `GOOGLE_ROUTES_API_KEY` plus separate `BEACON_GOOGLE_ROUTES_ENABLED=true` only after access/billing confirmation.
- Monitor private file `~/.config/beacon-demo/monitor.env`: `BEACON_BACKEND_URL`, `BEACON_MONITOR_TOKEN`.

On Akshar's laptop, use that laptop's own supported Codex login, or leave the worker on Mahin's laptop. **Do not copy Mahin's OAuth tokens, auth.json, browser cookies or login store.** The phone sees only the Beacon backend and a short-lived pairing code. The model login is not a public multi-user inference service.

Keep credentials out of Git, logs, model input and activity. Do not show `geta36.app` in the phone UI; this is a display requirement, not a promise that a network hostname can be hidden from inspection. Do not buy API credits, enable billing, change DNS or send real contact messages as part of finishing routine tests.

## Completion report expected

Provide the tested commit/PR, exact check results, live-vs-simulated truth table, remaining access requirements and physical-phone result. Explicitly list anything still unverified. Continue committing/pushing scoped checkpoints; never force-push shared history.
