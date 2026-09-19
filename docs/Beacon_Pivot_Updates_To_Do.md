# Beacon provider network — team implementation plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task by task. Checkboxes represent outstanding work, not completion claims.

**Goal:** Demonstrate a Student Agent coordinating compatible provider agents,
with Databricks choosing the plan and the student retaining control.

**Architecture:** [Approved pivot / what changes](Beacon_Pivot_What_Changes.md).
Keep existing Trip APIs and privacy gates while introducing an agreed, versioned
provider contract. Simulate new payment behavior before any live integration.

**Tech stack:** Existing Next.js/TypeScript app, ANS, persisted trip backend,
Databricks SQL/data adapters, and Rishit's PWA components.

## Who owns what

| Person | Owns | First deliverable |
| --- | --- | --- |
| Mahin | Student Agent, developer-agent contract, ANS, booking authorization, trip state, payment backend boundary | One conforming external provider can participate without Student Agent changes |
| Rishit | Student journey, onboarding, recommendation/confirmation, trip progress and recovery UI | Existing UI driven by real Trip API responses, with honest simulated-service labels |
| Akshar | Databricks feasibility/ranking, evidence, explanations, normalized offer input and outcome analysis | Existing evaluator consumes approved offers and exposes unknowns and rejected choices |
| All three | Shared types, API changes, price/consent semantics, final demo | One common contract and a repeatable combined journey |

## 0. Align once before changing shared interfaces

- [ ] Use the consolidated `main`; preserve Akshar's expanded data/backend work,
  Mahin's later transfer/privacy/regression fixes, and Rishit's UI. Do not build
  another long chain of dependent PRs.
- [ ] Mahin proposes the contract below; Rishit checks display/consent needs and
  Akshar checks ranking input. Record their agreement in `docs/TEAM_CONTRACT.md`
  before changing `src/types/**`, API paths or frozen fixture values.
- [ ] Keep first-demo support to existing modes and USD. Retain the $10 budget,
  $0 campus ride and $7 replacement fixtures as simulated examples.
- [ ] Agree the first demo payment mode as **simulated**. Select a real processor
  and commercial arrangement only in a later live-payment task.

### Contract to agree — proposed, not implemented shared fields

| Object | Required meaning |
| --- | --- |
| Provider manifest | Protocol version; actual operator/ANS identity; stable service ID distinct from transport mode; endpoint; service area; capabilities; live/simulated execution; required authorization and payment model |
| Offer | Provider/service and quote IDs; expiry; currency; total/fee semantics; estimate versus binding price; availability; known or unknown walking/wait/transfers; pickup requirements; evidence source |
| Booking intent | Exact accepted offer and terms; trip attempt/idempotency ID; student consent; minimum required private data; bounded authorization |
| Payment authorization | Server-side opaque reference; intended provider; amount cap/currency; offer/attempt binding; expiry; permitted operation; retry/revocation rules. No raw card or reusable payment secret in UI, quotes or Databricks |
| Booking result | Provider reference; explicit pending/accepted/rejected/unknown status; pickup instructions; status lookup; cancellation terms and reconciliation support |
| UI read model | Operator name, service name, simulation label, verification versus authorization, offer validity, required next action, payment display state and source-backed explanation |

Preserve current `CandidatePlan`, `Recommendation` and `Trip` until the agreed
additive contract is merged. Unknowns must not silently become zero. Normalize
USD minor units at the new boundary; explicitly adapt to the current evaluator's
dollar input. Reject unsupported currencies before comparing costs.

## 1. Mahin — make the provider network work

**Existing files:** `src/agents/{contract,operator-profile,discovery,http-provider,provider-credentials}.ts`,
`src/agents/student/**`, `src/integrations/ans/**`, `src/lib/authorization/**`,
`src/lib/trip-state/**`, `src/app/api/trips/**`.

- [ ] Publish the agreed protocol and example payloads in a new
  `docs/PROVIDER_DEVELOPER_GUIDE.md`. Include registration, compatibility,
  credentials, error handling, quote expiry and a conformance test command.
- [ ] Replace the assumption that one mode uniquely identifies an operator's
  service. Admit only compatible, configured/trusted providers with supported
  operations and valid service areas. ANS registration alone cannot grant access.
- [ ] Preserve coarse quoting. Require identity and authorization before exact
  location release. If precise coordinates are needed to finalize a price,
  obtain scoped consent first; do not silently distribute location to bidders.
- [ ] Bind confirmation and booking to the same offer, identity and terms. Fail
  closed on stale quotes, changed endpoints, unsupported auth or missing capabilities.
- [ ] Add a simulated payment adapter with provider/offer/amount/expiry binding.
  Payment state must be separate from booking state. Never treat a network
  timeout as proof that a booking or charge failed.
- [ ] Extend recovery to reconcile pending bookings and payment attempts before
  replacements. Preserve idempotency, budget and cancellation-fee bounds;
  obtain new confirmation when approved terms no longer cover the replacement.
- [ ] Expose a minimal owner-protected UI read model. Keep tokens, private
  authorization details and exact location out of public evidence/audits.
- [ ] Exercise a separately configured provider service through the contract.
  Label it Beacon-operated unless a genuinely independent operator participates.

**Acceptance:** a conforming service is added without editing Student Agent
selection logic; malformed/expired/unauthorized offers are rejected; exact data
reaches only the authorized provider; retries cannot create duplicate bookings
or simulated charges; changed terms require confirmation.

**Commit slices:** developer contract and validation → provider compatibility →
bounded booking/payment simulation → reconciliation and conformance tests.

## 2. Rishit — make the student experience match

**Existing UI files:** `src/components/safecircle/{safe-circle-app,screens,provider-card,technical-panel,map-surface}.tsx`,
`src/components/safecircle/{demo-controller,types}.ts`,
`src/app/onboarding/intro/page.tsx`. Add a Trip API client under `src/lib/client/`.

- [ ] Keep one Beacon onboarding journey: destination, budget, walking preferences
  and explicit permissions. Do not make linking Uber/Lyft accounts a universal
  prerequisite. The current local preview profile is not a server account system.
- [ ] Replace demo event production with owner-authenticated Trip API responses
  for the integrated journey. Keep deterministic simulation controls visibly
  separate for judging and regression testing.
- [ ] Show the recommendation, total/estimate, operator, service, expiry and
  material terms before confirmation. Display identity verification separately
  from booking authorization and simulated/live execution.
- [ ] Show actual pickup instructions or “pickup instructions unavailable.” Do
  not invent driver location, indoor access or a ride trajectory from walking geometry.
- [ ] Render waiting, booking pending, payment declined/unknown, provider failure,
  replanning, new confirmation required, no feasible plan and arrival from backend state.
- [ ] Add a clearly labeled simulated payment display. Do not collect card
  numbers or claim a saved payment method until the real account/processor flow exists.
- [ ] Preserve source distinctions: scheduled bus versus live ETA, local fallback
  versus Databricks, unknown transfers versus zero, mapped lights versus verified lighting.
- [ ] Verify the combined journey on a small phone viewport, including reconnect
  and repeated taps. Service workers must not cache private trip/API responses.

**Acceptance:** the UI cannot book before confirmation; it does not claim success
from a timer; backend failure/recovery is visible; the selected ride's map does
not display the full walking alternative as its route.

**Commit slices:** API client/state wiring → recommendation/consent → provider
and simulated payment states → mobile recovery verification.

## 3. Akshar — adapt the decision engine, keep the evidence

**Existing files:** `src/lib/decision-client/**`, `src/integrations/databricks/**`,
`databricks/**`, `data/**`. Start with `decision.ts`, `sql.ts`, `server.ts`,
`trip-options.ts` and the provider-outcomes modules.

- [ ] Reuse the implemented ranking, public evidence, route matching, scheduled
  transit and grounded explanation. The pivot does not require rebuilding datasets.
- [ ] Map approved offers into the bounded evaluator. Exclude expired,
  unavailable, incompatible and ineligible offers before recommendation.
  Do not choose an unbookable service as an automatically bookable plan.
- [ ] Keep cost comparison honest: supported currency, consistent totals/fees,
  estimate labels and offer expiry. Bind the result back to the precise quote
  version Mahin can authorize, not just a provider name.
- [ ] Preserve unknown transfer values through the full pipeline. Current
  v1/v2 policy omits their transfer cost with a warning; changing that treatment
  or adding waiting/pickup burdens requires a new agreed policy version and SQL/local parity.
- [ ] Add outdoor waiting, pickup complexity or verified access evidence only
  when the contract and sources support them. Published hours alone do not
  establish access or provider-approved pickup permission.
- [ ] Replanning receives fresh offers and exclusions. Current objectives are
  immutable with `objectiveVersion: 0`; mutable budgets/destinations require
  an explicit shared change, not an independent counter increment.
- [ ] Connect the existing provider-outcome contract when real observations
  exist. Simulations and provider self-reports cannot become observed reliability.
- [ ] Recheck deployed Databricks credentials, table/source versions and import
  readback before calling the combined deployment live. Preserve a labeled local
  fallback. Wider pilot/full-feed activation remains a separate verified step.

**Acceptance:** SQL and local policy agree on fixtures; stale or unsupported
offers cannot win; partial evidence remains labeled; an explanation cannot
invent a safety score or override the deterministic winner; no payment secrets,
exact student coordinates or personal trip identifiers enter public data/audits.

**Commit slices:** normalized offer adapter → agreed policy changes and parity
tests → outcome integration → deployment evidence and source/version checks.

## Build and merge order

1. Consolidate existing work and run the shared baseline.
2. Merge the agreed contract and fixtures in one small PR.
3. Mahin implements its provider producer/authorization path; Akshar implements
   its decision consumer; Rishit builds against the same fixtures.
4. Integrate backend behavior, then UI consumption. Each owner resolves their
   boundary conflicts without overwriting another track's newer work.
5. Run `bash src/agents/test.sh`, `node databricks/run.mjs test` and
   `./scripts/pre-pr.sh`. Run relevant data importer tests for data changes.
6. Verify a combined HTTP/mobile demo: recommend → confirm → verify/authorize →
   simulated booking → cancellation → reconcile → replacement → arrival.
   Use simulated notifications or `BEACON_SMOKE_NO_CONTACT=true`; routine tests
   must not send messages to a real contact.

## Release gates

- [ ] **Demo ready:** integrated UI/backend, compatible provider contract,
  honest simulation labels, consent/location gates, recovery and tests demonstrated.
- [ ] **Live provider ready:** operator identity and approved platform access,
  supported auth, real booking/status/cancellation tests and operating ownership verified.
- [ ] **Live payment ready:** processor and merchant/payer roles agreed, provider
  settlement supported, bounded authorization, reconciliation, refund/fee behavior
  and end-to-end sandbox verification complete before any real charge.

The latter two are future gates, not prerequisites for an honest simulated demo.
Do not describe the network as an active commercial marketplace until actual
independent providers and their operating permissions are verified.

Detailed task dependencies and proposed modules are in the
[implementation checklist](superpowers/plans/2026-09-19-beacon-provider-network-pivot.md).
