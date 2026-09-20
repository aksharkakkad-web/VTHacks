# Backend integration acceptance matrix

Evidence checkpoint: 2026-09-19/20 local integration work on `codex/beacon-backend-integration`. This matrix distinguishes real local HTTP integration from injected browser responses, isolated fixture transport, and external services. **Beacon’s polished UI is fully connected to the backend; functional integration sign-off and the port-3000 real-model smoke pass.** Local backend integration is not live-provider proof.

## Preservation and architecture

| Requirement | Evidence / current status |
| --- | --- |
| Recoverable UI checkpoint | Local commit `4f00f4c` precedes integration merge. Main agent owns original file inventory and recovery evidence. |
| Backend merge | Merge `cf26f9f` integrates `origin/main d252f6a`; no unresolved merge reported. Final repository checks remain main-agent responsibility. |
| Default `/demo` is backend | `SafeCircleApp` selects `BackendBeaconApp`; fixture implementation requires explicit fixture/manual route or injected transport. No silent fallback. |
| One atomic adapter | `atomic-journey.ts` validates and normalizes `/api/trips/:id/journey`; `atomic-transport.ts` owns endpoint calls. Polished screen components retained. |
| One lifecycle | `use-atomic-journey.ts` owns requests, polling, identity, restoration, command locking, unmount abort, sequence and revision rejection, visibility/offline gating. Local storage contains opaque trip ID. |
| Provider/deadline monitoring | Atomic GET is read-only. Existing `src/lib/trip-state/runtime.ts` calls `agent.monitor()` every 10 seconds outside Vercel; local launcher removes `VERCEL`. This backend monitor is distinct from the single frontend polling owner. Vercel deployments need the protected monitor endpoint scheduled externally. |
| No frontend state simulation | Default lifecycle polls authoritative response and renders request-in-flight UI. Fixture timing remains isolated behind explicit mode. |
| Consent | Create sends `journeyContract`; confirm sends exact `journeyRevision`, `planId`, optional provider `quoteId`. Contract does **not** require `journeyContract` on confirm. Backend rejects changed revision/selection/quote. |
| Dynamic plans | Returned candidates, selected plan, prices, quote, operator, fees and budget populate normalized model; no frozen plan-ID allowlist. Alternative cards are comparison-only because backend has no arbitrary selection action. |
| Privacy | Backend ownership, revision consent, identity/authorization and exact-location gate preserved; browser proof rejects another browser reading trip. Test runtime uses synthetic campus positions and simulated notifications. |

## Screen families

| Screen / family | Backend mapping | Proof available / remaining limitation |
| --- | --- | --- |
| 01 Splash/restoration | Saved trip ID → atomic GET; reconnecting while pending | Setup/gallery browser; lifecycle real HTTP restores recommendation and verified ride. |
| 02 Welcome | UI-local onboarding | Setup 85-check suite; backend journey starts through visible onboarding. |
| 03 Home setup | Saved profile form; synthetic demo destination clearly described | Setup verified. Address text is not silently geocoded or sent as coordinates. |
| 04 Preferences | Profile/temporary context → create payload | Setup + adapter payload test. |
| 05 Home | No active ID; start creates real owned trip, planner pairing when configured | Backend browser proof, Finish → Home verified. |
| 06 Discovery | OBJECTIVE_RECEIVED/DISCOVERING/COLLECTING_QUOTES and planner progress | Real backend creation/planning; synchronous backend work may skip a visual stage. Do not insert fictional delay. |
| 07 Comparison | EVALUATING/planner evaluation | Stage adapter coverage; real backend ranking produces recommendation. Individual visual dwell is not required by backend. |
| 08 Recommendation | SELECTED + current offer/confirmation action | Real browser consent; stale revision rejected. Exact payload tests; replacement approval separately verified. |
| 09 Identity | VERIFYING_PROVIDER / verify request loading | Real browser workflow and reload at verification; local-demo identity labeled separately from ANS. |
| 10 Authorization | Confirmed SELECTED/VERIFYING_PROVIDER and request loading | Backend privacy tests and adapter consent-resume tests; Continue resumes existing consent without new approval. |
| 11 Booking | COORDINATING / request loading / check_booking | Actual ride booking plus injected pending-response browser test. Unknown must not render accepted. |
| 12 Pickup/boarding | WAITING_FOR_PICKUP + active leg + ride stage | Real pickup details and responsive screenshots; actual backend selects transit after free-provider failure. Assigned/unknown/long-data states tested by injected responses. |
| 13 Travelling | IN_TRIP or NAVIGATING + active leg | Real normal/replacement demo events reach arrival; injected in-trip state proves map hidden. Backend final-walk semantics covered by unit tests. |
| 14 Arrival | ARRIVED + cleanup flag | Real UI arrival, Finish, GPS dwell test. Cleanup-pending copy checks sensitiveDataReleased; final production snapshots/clips reviewed. |
| Walking-only | NAVIGATING + active walk nextStep | Real zero-budget walking route; real location samples prove dwell arrival; no map after arrival. |
| Transit | Backend complete journey bus/transit leg | Actual backend transit selection/waiting verified after free-provider failure; traveling-leg UI uses a labeled response fixture and shows scheduled guidance, no driver or map. |
| Rideshare | Ride observation and response-backed pickup data | Real simulated providers through HTTP, no Lyft branding; missing fields remain absent. No live rideshare proof. |
| R1 Provider failure | PROVIDER_FAILED / provider cancellation event | Recovery browser journey triggers real owner-scoped demo event. Synchronous recovery may immediately expose later state. |
| R2 Reconciliation | check_booking / unknown payment / old attempt | Backend settlement/idempotency tests; fixture browser uncertainty. No proof of every real network failure timing. |
| R3 Replacement search | REPLANNING + planner state | Real backend recovery recording and new revision. |
| R4 New offer | SELECTED + fresh confirmation | Real replacement consent/booking/arrival; changed response fees/budget, no reuse of old consent. |

## Errors and interruptions

| ID / behavior | Evidence | Status / caveat |
| --- | --- | --- |
| E1 No feasible offer | FAILED mapping, backend feasibility tests, atomic snapshot browser fixture | No confirmation/map offered for unavailable plan. |
| E2 Expired/changed offer | Backend revision/expiry tests, real stale-revision rejection, atomic expired-offer browser fixture | Fresh offer required; no silent booking. |
| E3 Identity/access failure | VERIFICATION_DENIED mapping, backend gate tests, HTTP403 fault browser case | Verification denial blocks request and exact-location release. |
| E4 Payment declined | Backend tests, adapter mapping, atomic declined-payment browser fixture | No accepted-booking or approved-payment claim. |
| E5 Payment/booking unknown | Backend reconciliation tests, adapter mappings, injected browser pending booking | Unknown retains identity; no duplicate booking. Real outage timing not separately exercised in browser. |
| E6 Offline/reconnecting | Real browser offline/reconnect, no mutation, authoritative restore | Verified; malformed and delayed-response cases intentionally injected. |
| E7 Missing/unauthorized session | Browser missing/unauthorized restoration, original ID retained, no create | Verified. Backend session-error hides local reset. |
| E8 Location unavailable | Actual Chromium permission denial on backend UI | Explanation appears; no fabricated coordinates sent. |
| E9 Slow/failed request | Planner unavailable/needs-input adapter mapping, malformed-response browser recovery | Transient planner snapshot race fixed with leased progress-only view; 2 regressions pass and final browser observer finds no healthy slow-request flash. |
| E10 Overdue | Real backend deadline event + UI + notification null assertion | Verified with no consented destination; actual notification sent/simulated/uncertain states have backend tests, not all current browser states. |
| E11 User cancellation | Real public cancel, terminal response and reload; pending fixture; backend retry/fee tests | Resolved browser path verified; pending preserves attempt in fixture and backend tests. Three new backend regressions prove owner scope/idempotence/retry. |
| Route unavailable | Adapter unavailable geometry test and fixture gallery/integration | No fabricated map. Current real walking route browser verified separately. |
| Stale provider update | Injected old timestamp browser check | Warning verified; no invented fresh timestamp. |
| Unsupported/malformed response | Boundary rejection tests, browser injected malformed atomic response | Retry recovers and never claims arrival. |
| Duplicate/conflicting action | Backend consent/request tests; lifecycle busy lock and delayed-response tests | Confirm exact IDs; arbitrary alternative selection intentionally unsupported. |
| Notification status | Backend sidecar mapped into details | Never treat simulated as sent; Telegram acceptance is not recipient read/delivery proof. |

## Test evidence at this checkpoint

| Suite | Result | What it proves |
| --- | --- | --- |
| `bash src/agents/test.sh` | Last directly run: **242 passed** (237 existing + 3 user-cancellation + 2 planner snapshot-race regressions) | Active evaluation shows gathering without stale prose; expired lease or changed objective remains blocked. |
| `scripts/beacon-atomic.test.mjs` | Main reports **21 adapter tests passed**, combined client/frontend total **94 passed** | Adapter, contract payload, all 16 actual TripState values, errors/unknown values. Main owns final combined command log. |
| `verify-beacon-backend.mjs` / `browser-results.json` | **43 passed**, 52 screenshots, 3 recordings, 174 sanitized requests; zero page/console/request/5xx errors | Final production actual HTTP/UI with fixture planner inference, offline ranking, simulated providers/notifications. No healthy slow-request screen observed. Three 2fps filmstrips reviewed after last fix; rapid request stages have held-response screenshots. |
| `lifecycle-results.json` | **24 checks passed**, no failures/page errors | Real recommendation/verification/riding/arrival restore; discovery/replanning snapshots explicitly injected. Offline, unauthorized/missing trip, stale/malformed response behavior covered. |
| `edge-results.json` | **45 checks passed**, no failures/page errors | Real transit/GPS dwell/held booking and cancellation responses. E1/E2/E4 atomic snapshots, HTTP verification-denied fault, actual browser location denial, and labeled unknown/stale/long-data/final-leg fixtures. |
| `verify-beacon-setup-final.mjs` | **85 passed**, no tap/font/page/console issues | Current default onboarding/home at 360/390/393/430 widths after pairing-input correction. |
| `verify-beacon-gallery.mjs` | **46 examples passed**, no errors | Screen/sheet inventory rendering only. |
| `verify-beacon-integration.mjs` | **26 groups passed**, 52 screenshots, no errors | Explicit `transport=manual` legacy fixture integration; not real backend evidence. |
| `verify-safecircle-pwa.mjs` | **3 groups passed on frozen production** | Manifest/installability, public-only offline cache/reconnect, blocked-storage onboarding and visible persistence warning. `pwa/pwa-results.json`. |
| `verify-beacon-planning-final.mjs` | **6 groups passed, 13 screenshots**, production app + separate dev gallery | Explicit manual fixture consent facts, controls, source, distinct phases, privacy retry, focus/status, reduced motion. `/beacon-system` intentionally returns 404 in production; `BEACON_GALLERY_URL` selects the developer-only gallery without removing its assertions. |
| `verify-beacon-flow.mjs` | **Passed on frozen production** | Onboarding, exact budget, search/cancel, recommendation, identity, arrival, returner, 320/390/1440 widths, zero-budget walking and blocked-storage warning. Journey explicitly uses fixture transport; onboarding uses normal entry. |
| `verify-beacon-preferences.mjs` | **Passed on frozen production**, 4 layouts | Assets, no overflow, visible Save, exact budget, switches, saved navigation. |
| `verify-beacon-sheets.mjs` | **9 checks passed on frozen production** | Forms, contact shortcut, context, real permission denial, alternatives, explicit unknown-response resolution, cancellation outcome, explicit local reset. Manual fixture mode. |
| `verify-beacon-signoff.mjs` | **24 checks passed**, zero page/console/request failures (final main report) | Explicit `transport=fixture` full journeys; final production rerun supersedes the prior `_rsc` abort failure. |
| `./scripts/pre-pr.sh` | Main reports **passed**: lint, 54 focused units, typecheck, production build | Final check after planner, quote-display and prefetch corrections; diff clean. |
| Other repaired legacy browser suites | Main reports complete **3 groups/16 shots**, scenarios **17/44**, trip-final **13 groups/24 audits**, details **11/10** passed | Explicit fixture-compatible tests; no substitute for atomic backend proof. |
| `verify-safecircle.mjs` | Main reports **56 checks passed** | Obsolete fixture setup/selectors updated; current behavior asserted. |

The historical baseline `../beacon-signoff/tests/baseline/results.json` contains **12 scripts: 1 pass, 11 failures**. Passing: gallery. Failures: complete, flow, integration, planning-final, preferences, scenarios, setup-final, sheets, trip-final, safecircle-pwa, safecircle. Current passing reruns above supersede every individual failure without deleting historical evidence. The additional strict signoff network failure is also superseded by its final 24-check production pass. All named browser suites now pass, with fixture results kept distinct from actual backend proof.

## Phone QA and recorded proof

Real backend pickup overflow checks: 360×800, 390×844, 393×852, 430×932, 1440×900. Injected long/unknown provider fields: 360/390/430/1440 widths, no overflow. Setup confirms 44px controls and 16px inputs. This does not by itself establish full keyboard/focus/screen-reader/safe-area coverage across every backend state.

New backend recordings exist at `recordings/normal.webm`, `recordings/recovery.webm`, and `recordings/cancellation.webm`; phone screenshots and sanitized network assertions are in this directory. Browser verifier reviewed all three final 2fps filmstrips after scroll/copy/planner fixes: no healthy error flash, no raw signed quote visuals, cancellation terminal visible, normal/recovery offer-travel-arrival visible. Fast verification/request states have separate screenshots with actual responses held. Earlier `beacon-signoff` recordings use fixture transport and are not final backend proof.

Restoration proved: real recommendation, verified/confirmed plan, pickup, riding and arrival; held booking/cancellation responses followed by reload of authoritative server outcome; missing/unauthorized trip; delayed replacement revision. Discovery and replanning-inflight restoration use explicitly labeled controlled atomic snapshots. Persistently unknown pending stages are response fixtures, which remain labeled.

## Accepted integration and external limitations

1. All functional gates pass: canonical 43, lifecycle 24, edge 45, strict signoff 24 and every named legacy rerun; backend 242, client 94 and final pre-PR lint/54 units/typecheck/build pass. Final diff check is clean (main report).
2. All three final filmstrips were inspected by the browser verifier and main agent. Rapid synchronous stages have dedicated actual-response-held screenshots, not arbitrary product linger added for recordings.
3. Expanded restoration/error proof retains the distinction between actual HTTP state, HTTP fault injection and controlled atomic snapshots.
4. Port-3000 real-model smoke passes 11 checks with `gpt-5.6-sol`, grounded explanation, simulated booking, backend arrival and Finish → Home; see `real-model/results.json`.
5. External proof remains absent for live Databricks ranking, live ANS, live Google Routes and actual Telegram delivery. Repeatable browser proof labels fixture inference/offline ranking/simulated transport and notifications. No live ride, charge or notification is claimed.
6. No arbitrary alternative-selection API or explicit walk-complete/board API upstream: UI uses returned recommendation and supported location/leg semantics. This is a contract limitation, not permission to simulate authoritative progress.

Broader visual redesign is deferred. Necessary integration corrections (wrapping, control sizing, status wording, scroll reset) belong to this task.
