# Beacon Provider Network Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one coherent Beacon journey in which the Student Agent discovers compatible provider agents, Databricks chooses a feasible offer, the student authorizes it, and the provider handles booking while Beacon coordinates recovery.

**Architecture:** Retain the Student Agent/Trip API, ANS identity gate and Databricks decision boundary. Introduce a versioned developer-provider contract and bounded booking/payment authorization. Prove the flow with explicitly simulated transport and payment before enabling any commercial provider.

**Tech Stack:** Existing Next.js/TypeScript PWA, HTTP provider services, GoDaddy ANS, Redis trip persistence and Databricks SQL/local policy. Keep current Telegram integration. No payment processor or new dependency is selected by this plan.

---

**Team handoff, September 19, 2026.** Read [what changes](../specs/2026-09-19-beacon-provider-network-pivot-design.md) first. Product direction is approved; proposed wire fields need owner alignment before code changes. All unchecked items below are remaining work or verification, not completion claims.

## Who does what

| Owner | Your job in plain English | First deliverable |
| --- | --- | --- |
| **Mahin** | Make Beacon work with developer agents, enforce identity/permissions, delegate bookings and keep the whole trip moving | A versioned provider contract plus two compatible simulated services exercising booking and recovery |
| **Rishit** | Make the student experience feel like one service: one profile, one recommendation, clear confirmation and actual trip progress | Existing mobile UI connected to the real Trip API, with honest provider/payment/source labels |
| **Akshar** | Choose the best feasible offer using price and actual trip burden, and explain the decision from supported evidence | Network-offer adapter requirements and matched SQL/local decisions, preserving unknowns and excluding unusable offers |

Akshar does not book rides; Rishit does not decide winners in the browser; Mahin does not replace Databricks with a platform-specific ranking rule. Provider developers own their credentials, permitted platform access and booking execution. Mahin owns the reference developer implementation and admission checks.

## Build order and first integration gate

1. **P0 — reconcile baseline and agree the shared contract.** Start from `main` including data integration `64e0c04`. Review changes since that commit before implementation. Incorporate Rishit's [PR #16](https://github.com/aksharkakkad-web/VTHacks/pull/16) and the relevant post-PR14 backend fixes deliberately; do not blindly replay the entire historical PR stack over the integrated backend.
2. **P1 — build the first complete simulated journey.** Mahin implements the provider/authorization boundary; Akshar adapts eligible offers; Rishit builds against shared fixtures while wiring the existing API. Freeze one contract before independent implementation.
3. **P2 — verify the combined experience.** Test cancellation, uncertain bookings/payments, expiry, unavailable data and a mobile journey from confirmation to arrival.
4. **P3 — activate a real provider/payment path only after its access and commercial requirements are settled.** This is a separate milestone, not necessary to demonstrate the pivot honestly.

### Task 1 — P0 shared contract and baseline alignment

**Lead:** Mahin. **Review:** Akshar for decision semantics; Rishit for customer-visible fields.

**Files:** `src/types/provider.ts`, `src/types/recommendation.ts`, `src/types/trip.ts`, `src/agents/contract.ts`, `src/agents/API.md`, `docs/TEAM_CONTRACT.md`. These are proposed edit targets, not changes made by this plan.

- [ ] Preserve the integrated public-route/evidence handoff from main. Check whether the integration branch has already incorporated the missing-transfer fix from [PR #17](https://github.com/aksharkakkad-web/VTHacks/pull/17); port it if needed. Omission must remain unknown through normalization, decision, SQL/audit and UI.
- [ ] Publish a short contract-change note for all three owners before editing shared types. Freeze sample payloads for quote, no offer, confirmation, booking accepted, booking uncertain, cancellation, replacement confirmation and no feasible plan.
- [ ] Agree the following proposed fields/semantics. Mahin owns the schema; Akshar and Rishit consume the same fixtures. Names below are proposed, not existing API fields.

| Proposed object | Fields/semantics to freeze |
| --- | --- |
| `ProviderManifest` | `profileVersion`, `operatorAnsId`, stable `serviceId`, verified endpoint, supported modes/operations/service area, `executionMode`, auth/payment requirements. Service identity must distinguish two services of the same mode from one operator. |
| `ProviderOffer` | `quoteId`, `serviceId`, offer version, issued/expiry times, availability, price kind, currency, total/fees or explicit unknowns, pickup details, burden facts and cancellation terms. USD minor units at the new boundary; an explicit adapter converts to legacy dollar `cost`. |
| `DecisionEnvelope` | Eligible `CandidatePlan` values plus private server mapping to offers; evidence/freshness/unknown fields and policy version. Never put payment grants, exact GPS, passenger identity or contact details into Databricks inputs. |
| `BookingIntent` | Selected quote/version, provider service, consent reference, allowed data/actions, booking-attempt ID and retry key. Exact trip fields remain server-only until the verified-and-authorized release. |
| `PaymentGrant` | Opaque reference restricted to provider/quote/attempt, currency, maximum amount and expiry. A demo grant has `simulated` provenance and cannot charge. Grant references stay out of browser responses, SQL, URLs and logs. |
| `BookingResult` / UI view | Provider booking reference, actual status, last update, pickup instructions, cancelability/fees, payment state and required user action. Authenticated server state is authoritative. |

- [ ] Keep existing Trip API paths and demo amounts unless an explicit shared change is recorded. Adapt the legacy provider profile alongside the new version; reject unsupported versions rather than guessing.
- [ ] Keep trip objectives immutable with `objectiveVersion: 0` for this slice. A mutable objective/version protocol requires a separate agreed change. Bind re-evaluations to the current offer/consent so old decisions cannot book after a replacement.
- [ ] Define which replacement actions a confirmation allows. Default to reconfirming a new paid offer unless the user explicitly approved bounded automatic replacement; total spend includes existing charges/fees. Pending refunds do not restore available budget.

**Acceptance:** All three can consume the same fixtures without inventing fields or exposing secrets. Shared change is reviewed before owner-specific consumers land. Commit this contract separately from runtime implementation.

## Mahin: agents, permissions and trip coordination

### Task 2 — P1 developer-provider discovery and compatibility

**Existing files:** `src/agents/contract.ts`, `operator-profile.ts`, `discovery.ts`, `http-provider.ts`, `provider-credentials.ts`, `src/integrations/ans/directory.ts`, `src/lib/authorization/policy.ts`.

**New files proposed:** `src/agents/provider-manifest.ts`, `docs/PROVIDER_DEVELOPER_GUIDE.md`, `src/agents/provider-conformance.test.ts`.

**Depends on:** Task 1.

- [ ] Separate registered operator, transport brand, unique service and transport mode. Keep `beacon-mobility-v1` identified as Beacon's profile, not an ANS protocol.
- [ ] Discover a bounded set of compatible agents through ANS. Check endpoint identity, supported contract, service area and required capabilities before admitting an offer. Preserve URL/redirect/credential protections; registry results are untrusted input.
- [ ] Define supported service authentication. Scope credentials/grants to the verified recipient and operation. Provider handlers must authenticate Beacon and validate issuer, audience, scope, expiry and replay protection; do not treat an arbitrary `providerId` as proof.
- [ ] Document how a developer publishes a manifest, configures its own platform access and implements quote/book/status/cancel/reconcile behavior. No platform keys belong in the Student Agent or browser.
- [ ] Run two compatible simulated services through the same adapter. Configure an additional service without adding platform-specific branches to the Student Agent. Record whether operators are actually independent; use truthful labels if both are Beacon-operated.

**Acceptance:** Compatible service succeeds; unsupported version, mismatched identity/endpoint, missing capabilities and expired offers fail before precise data or grants are released. Conformance tests exercise independently callable endpoints, not only in-process mocks. Commit discovery/contract support separately.

### Task 3 — P1 delegated booking and simulated payment; P2 recovery

**Existing files:** `src/agents/student/service.ts`, `src/agents/student/databricks.ts`, `src/agents/demo-provider.ts`, `src/agents/hosted-provider.ts`, `src/lib/authorization/policy.ts`, `src/lib/trip-state/{model,runtime,redis-store}.ts`, `src/app/api/trips/**`, `src/agents/API.md`.

**New modules proposed:** `src/lib/authorization/booking-grant.ts`, `src/lib/payments/simulated.ts`.

**Depends on:** Tasks 1–2; Task 5's decision input agreement.

- [ ] Enforce selected-offer freshness and consent again immediately before booking. A provider that needs extra passenger data or account authorization must return a required-action state, not silently receive the whole profile.
- [ ] Add simulated limited payment grants and separate payment states. Bind consent, booking attempt and payment authorization to the same service/quote/terms. No real card entry or charge in this milestone.
- [ ] Make retries safe across provider execution, persistent trip state and payment operations. Reconcile timeout/unknown results before retrying or replacing. Cancel/refund operations return their actual result; an HTTP timeout is not confirmed cancellation.
- [ ] Account for confirmed charges, unsettled authorizations and cancellation fees during replanning. Reconfirm changed terms; never auto-cancel a nonrefundable future ticket without the required permission.
- [ ] Return an owner-protected UI view with operator/source labels, pickup instructions, booking/payment progress and required action. Keep grants, credentials and contact data private.
- [ ] Preserve monitoring and consent-based Telegram behavior. Routine tests use simulated notifications or `BEACON_SMOKE_NO_CONTACT=true`; they do not send real alerts.
- [ ] Emit sanitized final provider outcomes using Akshar's existing ingestion contract only when facts and provenance qualify. Mark simulations as simulated; do not create a fake reliability history.

**Acceptance:** One confirmation produces at most one logical booking/payment under duplicate requests; an uncertain old attempt cannot cause a second charge; unselected providers receive no precise data; cancellation/replan/arrival remain persisted and recoverable. Commit booking/payment and recovery in reviewable chunks.

## Rishit: the student experience

### Task 4 — P1 connect the UI; P2 show the whole journey

**Existing branch files:** `src/components/safecircle/{safe-circle-app,screens,dialogs,provider-card,map-surface,technical-panel}.tsx`, `demo-controller.ts`, `src/app/onboarding/intro/page.tsx`. These are on `feat/beacon-design-system` at `17fa00f`, not main at the review baseline.

**New client module proposed:** `src/lib/client/trips.ts`.

**Depends on:** Task 1 fixtures; Task 3 responses for final integration.

- [ ] Preserve the mobile design and replace demo-controller events with actual Trip API/evidence responses for connected trips. Browser timers must not manufacture verification, booking or arrival.
- [ ] Adjust onboarding around a Beacon profile, destination/preferences and explicit location consent. Remove mandatory platform-linking assumptions. For the demo, clearly identify the profile/payment as a preview; a durable account system is a separate live milestone.
- [ ] Show the selected operator/service, price and any estimate/cap, walking/waiting burden, pickup steps, uncertainty and cancellation terms before confirmation. Keep one clear recommended action, with alternatives available.
- [ ] Distinguish **Identity verified**, **Simulated ride**, **Scheduled bus**, **Demo payment — no charge** and **local decision fallback**. An ANS badge must not imply platform affiliation or transport safety.
- [ ] Render extra-permission requirements, expired offers, payment declined/unknown, reconnection, no feasible plan and reconfirmation explicitly. Never turn unknown transfers into “0 changes,” or unknown access into “Indoor waiting available.”
- [ ] Draw actual route evidence with mode-appropriate labels. The full mapped walking alternative is not the ride's trajectory or pickup path; unsupported routes must not become invented straight-line guidance.
- [ ] Keep `geta36.app` out of consumer-facing copy and provider display names. An independently verified operator can have a friendly name; preserve a separate technical identity detail view. A web browser may expose the hosting origin, so a branded public URL is a separate hosting task, not something the PWA can conceal.
- [ ] Keep demo controls separate from the student journey; do not cache private API/trip responses in the service worker. Refresh authoritative state after reconnecting.

**Acceptance:** On a phone-sized screen, complete create → recommend → confirm → booking → cancellation/replan → required confirmation → arrival using backend state. Refresh/reconnect recovers the same trip. Capture a short demo showing honest labels; no real booking/payment/alert is required. Commit API wiring before UI polish.

## Akshar: Databricks, offer comparison and evidence

### Task 5 — P1 comparable offers; P2 policy and hosted evidence

**Existing files:** `src/lib/decision-client/{decision,server,intelligence,journey-evidence,provider-outcomes}.ts`, `src/integrations/databricks/{evaluate,sql,provider-outcomes}.ts`, `databricks/**`, `docs/DATABRICKS_APP_HANDOFF.md`, `docs/DATABRICKS_TRACK_PRD.md`.

**Depends on:** Task 1; Mahin supplies eligible offers and private offer mapping, not platform credentials.

- [ ] Retain current SQL/local evaluation, evidence provenance and cancellation exclusions. Review the newly integrated main baseline before duplicating full-transit, waiting/lighting or outcome work.
- [ ] Agree eligibility with Mahin: service-area match, supported auth/payment, fresh offer, known acceptable total/cap and supported mode/currency. For the first slice accept USD and existing modes only; reject unsupported comparisons rather than mixing units.
- [ ] Preserve offer identity/version through the adapter so the chosen `planId` maps to exactly the offer that can be confirmed. Never make Databricks responsible for issuing booking/payment grants.
- [ ] Preserve unknown transfer counts end to end. The current policy explicitly omits unknown transfer cost; that limitation is not solved merely by returning `null`. Agree a new policy version before changing unknown penalties, waiting/pickup burdens or weights, with identical SQL/local results.
- [ ] Add comparable sourced burdens where available: pickup/access walking, wait, transfers, pickup complexity and applicable conditions. Waiting inside requires actual access/pickup evidence; weather forecasts, pole maps and published hours cannot establish it by themselves.
- [ ] During recovery, evaluate remaining feasible plans using Mahin's current exclusions and remaining approved budget after existing liabilities. Return no feasible plan when necessary; do not relax hard constraints without new user permission.
- [ ] Connect observed reliability only under the existing source/sample rules. Unknown remains unknown; simulated bookings and provider self-reports do not become independent observations.
- [ ] Keep optional AI limited to supported explanation facts. Preserve source/engine/policy/expiry labels and sanitized audits; no exact location, personal impairment statements, credentials or payment grants in public data/model prompts.
- [ ] Verify the hosting environment has working renewable server access and matching activated data versions. Record actual SQL/audit evidence and post-import readback for any activated snapshot. Previous successful local checks do not establish current deployed access.
- [ ] Keep wider pedestrian/transit expansion separate from this pivot's first demo. Activate only agreed routes and verified access assumptions; report the full-feed/native-import and wider-pilot gates accurately.

**Acceptance:** SQL and local policy agree on common fixtures; an expired/ineligible offer cannot win; unknowns and missing price components cannot silently improve ranking; replacement respects outstanding costs. UI explanation matches the selected offer and distinguishes real SQL from fallback. Commit adapter/parity work separately from policy expansion and data activation.

## Joint acceptance and release gates

### Task 6 — P2 one reproducible combined demonstration

**Owners:** All three. Mahin runs integration; Rishit verifies the mobile journey; Akshar verifies decisions/provenance.

**Files:** existing `src/agents/*test.ts`, `src/agents/smoke.mjs`, decision-track tests; update each owner's handoff with actual results.

- [ ] Run the relevant provider/agent tests: `bash src/agents/test.sh`.
- [ ] Run decision tests: `node databricks/run.mjs test`. Run importer tests only when data/importer code changes.
- [ ] Run required repository checks: `./scripts/pre-pr.sh`.
- [ ] Exercise a newly configured compatible service, failed identity, denied authorization, expired quote/grant, duplicated request, payment decline, uncertain booking, cancellation with fees, no feasible replacement and stale/offline UI.
- [ ] Demonstrate Databricks choosing an eligible offer, the student confirming, the provider executing a simulated booking and Beacon recovering without duplicate booking/payment or unauthorized data release.
- [ ] Verify a mobile browser against the deployed integration candidate and record the commit, environment, actual decision engine and simulated/live boundaries. Unit tests alone do not prove that journey.
- [ ] Preserve the frozen $10 budget, $0 Campus Ride and $7 Independent Ride scenario unless the team explicitly changes it. Named campus-route scenarios remain separate from the default downtown demo.

**Done for the pivot demo:** common provider contract + two callable simulated services + ANS identity checks + evidence-backed decision + bounded simulated authorization + connected UI + tested recovery. Mark independence, payment and transport simulation accurately.

### Task 7 — P3 prerequisites before live accounts, money or commercial transport

| Owner | Concrete evidence needed before activation |
| --- | --- |
| Mahin + provider developer | Approved platform access and supported operations; documented operator identity/service scope; successful permitted booking/cancel/status tests |
| Mahin + payment provider | Selected payer/merchant/settlement arrangement, accepted provider onboarding, processor-backed saved-method flow, bounded charges and verified refund/reconciliation behavior |
| Mahin + Rishit | Durable Beacon account/profile backend, authenticated session/account ownership, location/data consent, safe saved-payment UI and account deletion/retention behavior |
| Akshar + Mahin | Current hosted Databricks access, policy parity, activated data versions and privacy-preserving outcome ingestion; verified service areas/route access for any expansion |
| All three | Agreed live scope, cost/terms disclosures and verified end-to-end behavior. Rail/air/multi-leg travel needs a separate contract and acceptance plan. |

No live commercial provider or payment system is declared ready by these documents. Keep each gate closed until its evidence exists.

## Git and handoff rules

Use short branches and small commits. Land agreed schema/fixtures first, then producers/adapters, then consumers/UI, then the combined integration. Keep shared types, dependencies, environment names, API paths and demo values coordinated. Do not modify another owner's data or interface assumptions silently. Preserve unrelated teammate work during merges.

Each PR should say what changed, which contract version it uses, tests actually run and what is simulated. A completed document or passing mock test does not earn a live-integration checkpoint.
