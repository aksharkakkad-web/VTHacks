# Backend completion — September 19

## Current completion run: full scenario demo

Akshar approved a complete, clearly identified synthetic campus demonstration, including simulated ride progress, while real Uber Guest Rides access remains unavailable. The private Application ID/client-secret authentication attempt returned HTTP 401 `unauthorized_client`; that is an app authentication/configuration blocker, not proof of a particular missing permission. Google still needs an approved configured key for real walking routes.

The new demo uses explicit `DEMO_MODE` + `BEACON_DEMO_SCENARIO` flags, complete numeric scenario conditions, scenario-only v2 scoring, per-trip condition changes, owner-scoped ride playback, the real managed Codex worker, and native Databricks ranking when configured. Public data and the v1 policy remain separate. See [DEMO_BACKEND_RUNBOOK.md](DEMO_BACKEND_RUNBOOK.md) for the one-command runtime and Rishit's combined API handoff.

### Final scenario-demo verification

Completed locally on September 19, 2026 (acceptance receipt: `2026-09-20T00:20:40.346Z`). This is the demo backend completion record; the historical sections below describe the earlier candidate.

| Check | Final result |
| --- | --- |
| Full authenticated HTTP journey | Passed with actual managed Codex `gpt-5.6-sol` explanations and native Databricks ranking, not fixture inference or local-ranking fallback. |
| Evidence changes the decision | Baseline selected walking (score 1024); synthetic lighting outage selected the free campus ride (1140). Cancellation selected the independent demo ride ($7, score 1600) within budget and required fresh consent. |
| Ride and arrival lifecycle | Driver/car/plate, elapsed-time pickup countdown, approaching, arrived, in-trip and completed passed. Ride completion did not claim home arrival; three accurate synthetic location samples spanning 30 seconds completed arrival and cleared private journey data. |
| Preferences and contact monitoring | Zero budget plus less walking selected the free campus ride. Overdue monitoring recorded a simulated trusted-contact notification. |
| Backend agent suite | 237 passed, zero failed. |
| Data/decision suite | 180 passed, zero failed. |
| Repository gate | Lint, 25 state/checkpoint tests, typecheck and production build passed. Two demo-environment tests also passed. |
| Independent review | Snapshot/explanation consistency and launcher shutdown findings resolved and narrowly re-reviewed; regression coverage added. |

Native SQL statements: baseline `01f1b488-f09b-18ef-ba9c-4fc07b3730c8`; lighting change `01f1b488-f60c-1d4c-b2cc-f1c3603f0217`; cancellation/replanning `01f1b488-fc6d-1098-b3dd-ef0d8726f167`; zero-budget preference `01f1b489-187c-114c-b3e8-871df8d3ba1d`.

Private local receipt: `/var/folders/qr/0gfz5v8d76gch8wdknd578gc0000gn/T/beacon-demo-6nnNDL/demo-acceptance.json`. It is a temporary artifact, not a portable repository dependency; `npm run demo:check` regenerates receipts. Native checks were read-only: no new cloud audit/import, deployment, real booking, charge or contact message occurred. The full offline fixture check also passed.

Rishit's remaining task is UI wiring against the combined journey response in [DEMO_BACKEND_RUNBOOK.md](DEMO_BACKEND_RUNBOOK.md). Live Google/Uber access, hosted operation and real contact delivery are outside this completed local simulated-demo milestone. The synthetic walking line is illustrative, not navigation; maps handoff delegates the actual path to Google/Apple Maps.

## Earlier integration record

Akshar now owns coordination and Databricks. Rishit owns UI. This is local integration work, not authorization to deploy, push, merge a PR, enable billing, or book a real ride.

## Approved direction

One server-owned journey joins Google walking directions, Databricks evidence/ranking, provider quotes, confirmation, booking, status, recovery and home-arrival monitoring. The model interprets bounded preferences and selects/orders validated explanation facts; it cannot override constraints or spend without consent. Map only walking legs; expose driver/vehicle/ETA through the atomic journey response. Unknown evidence stays unknown. Uber Guest Rides sandbox replaces the proposed Lyft simulator; the API family is confirmed, but credentials and enabled sandbox permissions remain unavailable.

## Work and ownership

1. Manager: preserve and combine both handoffs; repair baseline tests, runtime wiring and route adapter compatibility; verify whole branch; document exact access blockers.
2. Backend journey implementation: connect complete-journey evaluation to StudentAgent and the atomic journey API; preserve exact quote/location/version bindings, budget liabilities, approval, monitored arrival and replanning. Own journey/service/model/planner integration, not provider transport or runtime composition.
3. Uber boundary implementation: sandbox-only transport client and normalization, configuration checks and fixture tests. Do not assume a generic client ID proves Riders/Guest Rides access. Do not call live Uber or silently choose a production endpoint.
4. Independent final review and local HTTP smoke: inspect integration and test no duplicate bookings, stale consent, cancellation, model outage, arrival and overdue behavior. Test APIs without real notifications or commercial trips.

## Gates

- [x] Mahin checkpoint d95e41e and data handoff 277fd8f combined locally (652e7d1).
- [x] Whole-journey coordinator integration and Google routing adapter compatibility (fixture-verified, not live Google).
- [x] Uber Guest Rides sandbox client, durable ProviderAgent bridge and runtime configuration (fixture-verified, not a live Uber run).
- [x] Model worker, status, cancellation/recovery and arrival regression checks.
- [x] Lint, typecheck, production build and end-to-end local HTTP verification.
- [ ] Live checks after approved Uber OAuth access and Google billing/key are available.

## Current blockers and boundaries

No Google Routes key or Uber credential is configured on this machine. Google paid activation is not authorized. Mahin's earlier Lyft handoff only established an application, not approved access. A fixture test is not live service verification. Hosted Redis/monitor deployment, cloud refresh activation, real contact messages and physical-phone acceptance are separate gates and cannot be reported as complete from local tests.

## Progress

- Baseline Mahin agent tests: 163 passed, 4 failed. Repaired three older expectations conflating provider completion/single GPS sample with home arrival, and fixed completion-outcome flushing plus continued overdue monitoring.
- The proposed Lyft simulator was interrupted before it wrote files; no real Lyft API was configured.
- Confirmed by Akshar: Uber **Guest Rides sandbox**, not Riders or Direct. Credentials pending private transfer. No production permission is asserted.
- Actual model smoke on Akshar's laptop passed: managed ChatGPT, gpt-5.6-sol, structured output, zero tools, about 4.8 seconds. Worker/monitor tests: 17 passed.
- Databricks track tests after routing activation/attribution updates: 167 passed. State/checkpoint/client helper tests: 32 passed. These are not final integrated acceptance results.
- Fixed read-only planner polling to avoid restarting inference. Explicit planning remains the action that starts/restarts work.
- Synthetic public-point pickup sidecar is separately opt-in; it never turns unverified real access into a fact.

### Final verification evidence

| Check | Result |
| --- | --- |
| Backend agent suite | 226 passed, zero failed, including real StudentAgent sandbox cancellation/decline recovery fixtures. |
| Data/decision track | 167 passed, zero failed. |
| Databricks tooling | 39 passed; public ingestion/import validators use fixtures, not new cloud writes. |
| Worker and monitor | 17 passed. |
| Token setup utility | 10 offline tests passed; no real credentials read or token requested. |
| State/checkpoint/client helpers | 32 passed. |
| Final integrated candidate | Lint, typecheck, production build and `git diff --check` passed; final fixture HTTP smoke passed with the context-service boundary exercised. |
| Real Codex HTTP acceptance | Passed with `gpt-5.6-sol`, `llm_grounded` explanation, simulated transport/payment and accurate-location dwell arrival. Optional extra context was not requested on this run. |
| Independent review | Cancellation settlement, drinking context and terminal decline findings resolved; narrow re-review found no remaining issues in those fixes. |
| Real Databricks, read-only at 23:34 UTC | Reachability, 20 Delta tables, transit metadata and audit reads succeeded; native ranking succeeded (`01f1b482-b6ad-1c89-9395-0b5cdfc0b255`). No audit written. One direct-bus query timed out; three returned no reachable departure. Routing remained explicitly fixture-only; this is not an end-to-end live route/ride test. |

## Acceptance and operation

Run after `npm run build`:

```sh
node scripts/local-backend-smoke.mjs
node scripts/local-backend-smoke.mjs --actual-model
```

The harness starts isolated loopback providers and the built app, creates private temporary state and ephemeral service secrets, disables external routing/Uber/Databricks credentials and real notifications, runs the authenticated HTTP journey, then stops only its own children. It fails if required ports are occupied. Artifacts remain in the printed temporary directory. The second command uses the existing approved managed Codex login for synthetic inputs; it does not enable API billing or modify global configuration.

Verified HTTP flow: paired owner; anonymous rejection; network provider quotes; bounded optional context lookup; complete-journey comparison; exact revision/quote confirmation; booking; cancellation/reconciliation; replacement requiring new confirmation; rejection of stale approval; home arrival from three accurate location samples spanning 30 seconds; and explicit worker-offline reporting. All transport/payment values are simulated. The fixture run intentionally requests context; the real model may decide no additional context request is needed, while mandatory planner evidence/constraint checks still run.

Independent integration review found and prompted fixes for terminal cancellation settlement, subsequent provider decline recovery, and disclosed drinking-context walking weighting. Model acceptance initially used a safe template because its instructions permitted paraphrasing while the grounding check required exact facts; the instructions and one-fact output schema now agree. Invalid model output still falls back safely.

Local data status at 23:27 UTC: weather, scheduled transit, reviewed September 19 waiting hours and lighting inventory were current snapshots; closure snapshot was stale; crime and measured lighting remained historical. Runtime keeps these limitations explicit. Refreshing a source does not verify working lamps, prove no crime, or confirm indoor/curb access. New cloud writes were not activated.

## What is not claimed complete

- **Uber live sandbox:** needs Client ID + secret to obtain `guests.trips` token, any required allowlisting/organization, verified test guest, active run and available campus product. Token setup utility is ready; no credentialed Uber call has occurred.
- **Google live walking:** needs an approved server key, billing-enabled project and permission to make routing requests. Missing configuration never substitutes invented navigation.
- **Hosted operation:** deployment, persistent shared state and an always-on monitor are not activated by local acceptance.
- **Rishit's UI:** must adopt the atomic `journey.nextStep`/`journey.complete` response and provider status fields; the existing frontend follow-ups in BEACON_BACKEND_CONNECTIONS.md remain separate work.
- **Commercial rides/payments and contact delivery:** this run books no real vehicle, charges no account and sends no real contact message.
