# Beacon — Phase-Based Parallel Build Plan

**Purpose:** Let 3 people build independently while keeping integration predictable.

**Core rule:** Do not organize the hackathon around elapsed hours. Organize it around **phase gates**.

A phase ends only when its exit criteria are met.

Everyone can work independently inside a phase using mocks, but the team must stop and integrate at each checkpoint before moving forward.

---

# 0. Team Ownership

## Rishit — Product / PWA / Demo Experience

Owns:

- onboarding
- saved preferences
- `TAKE ME HOME`
- analysis/progress UI
- recommendation state
- navigation/trip UI
- map
- ETA
- current location display
- replanning UI
- overdue/emergency-contact UI
- arrival UI
- judge technical view
- demo controls
- polished final experience

Does not own:

- Databricks ranking internals
- ANS logic
- provider-agent internals

---

## Mahin — Student Agent / Provider Agents / GoDaddy ANS / Trip State

Owns:

- Student Agent
- provider contract
- Transit Agent
- Campus Ride Agent
- Independent Ride Agent
- provider discovery
- provider quote collection
- GoDaddy ANS registration
- ANS discovery
- ANS resolution / verification
- authorization policy
- precise-location gate
- provider coordination
- provider status
- cancellation
- autonomous replanning
- trip state machine
- trip monitor backend
- overdue trigger
- trusted-contact alert orchestration

Does not own:

- final UI
- Databricks scoring internals

---

## Akshar — Databricks / Data / Recommendation Intelligence

Owns:

- Databricks environment
- Databricks AI Dev Kit
- Unity Catalog / Delta
- SQL Warehouse
- CandidatePlan evaluation
- feasibility/safety filtering
- safety-first ranking
- practical optimization
- reason codes
- explanation
- replanning evaluation
- provider reliability
- GTFS if feasible
- historical incident context if feasible
- optional MLflow

Does not own:

- PWA
- ANS
- trip orchestration

---

# 1. Shared Contracts — Freeze Before Phase 1

Before anyone starts serious feature work, all 3 developers agree on these contracts.

These files are protected:

```text
/src/types/**
.env.example
package.json
```

Any shared-contract change must be announced to the team first.

---

## 1.1 CandidatePlan

```ts
export type CandidatePlan = {
  planId: string
  providerId: string | null
  providerName: string

  mode:
    | "walk"
    | "transit"
    | "campus_ride"
    | "independent_ride"

  available: boolean

  cost: number
  waitMinutes: number
  travelMinutes: number
  walkingMinutes: number
  totalMinutes: number

  transfers?: number
  reliability?: number

  historicalExposure?: number
  weatherPenalty?: number

  requiresProviderVerification: boolean
}
```

---

## 1.2 Recommendation

```ts
export type Recommendation = {
  selectedPlanId: string
  runnerUpPlanId?: string

  reasonCodes: string[]
  explanation: string

  evaluatedAt: string
}
```

---

## 1.3 TripState

```ts
export type TripState =
  | "IDLE"
  | "OBJECTIVE_RECEIVED"
  | "DISCOVERING"
  | "COLLECTING_QUOTES"
  | "EVALUATING"
  | "SELECTED"
  | "VERIFYING_PROVIDER"
  | "COORDINATING"
  | "NAVIGATING"
  | "WAITING_FOR_PICKUP"
  | "IN_TRIP"
  | "PROVIDER_FAILED"
  | "REPLANNING"
  | "OVERDUE"
  | "ARRIVED"
  | "FAILED"
```

---

## 1.4 Trip

```ts
export type Trip = {
  id: string
  state: TripState

  candidates: CandidatePlan[]
  recommendation?: Recommendation
  selectedPlan?: CandidatePlan

  providerVerified?: boolean
  sensitiveDataReleased?: boolean

  expectedArrivalAt?: string
  alertDeadlineAt?: string
  lastKnownLocation?: {
    lat: number
    lng: number
    recordedAt: string
  }

  alertSent?: boolean
  statusMessage?: string
}
```

---

# 2. Shared API Contract

Rishit builds against these from the beginning.

Mahin later replaces mocks with real implementations.

```text
POST /api/trips
POST /api/trips/:id/discover
POST /api/trips/:id/evaluate
POST /api/trips/:id/verify
POST /api/trips/:id/request
POST /api/trips/:id/events
POST /api/trips/:id/location
POST /api/trips/:id/arrive
POST /api/demo/trips/:id/cancel-provider
POST /api/demo/trips/:id/expire-deadline
POST /api/demo/reset
```

---

# 3. Parallel Development Rule

Each person must mock the other two subsystems.

## Rishit mocks

- provider responses
- Databricks recommendation
- ANS verification
- trip state

## Mahin mocks

- Databricks `DecisionEngine`

## Akshar mocks

- `CandidatePlan[]`

This is what keeps everyone moving independently.

---

# PHASE 1 — Skeleton + Contracts

## Goal

Create a complete fake end-to-end Beacon flow before sponsor integrations.

## Rishit

Build clickable states:

```text
TAKE ME HOME
↓
Finding options
↓
Recommendation
↓
Navigation
↓
Provider cancelled
↓
Replanning
↓
New plan
↓
Arrival
```

Also build:

- onboarding shell
- saved home
- saved budget
- emergency contact
- map shell
- monitoring indicator
- overdue screen

All data may be mocked.

## Mahin

Build:

- Student Agent skeleton
- provider interface
- Transit Agent mock endpoint
- Campus Ride Agent mock endpoint
- Independent Ride Agent mock endpoint
- Trip state machine
- mock provider directory
- cancellation event handling
- trip monitor structure

## Akshar

Build:

- Databricks environment
- project catalog/schema
- first table/query
- deterministic recommendation logic against mock `CandidatePlan[]`
- reason codes
- explanation response

---

## PHASE 1 EXIT GATE

Do not move on until:

### Product

- [ ] full UI flow can be clicked end-to-end with mocks
- [ ] navigation screen exists
- [ ] overdue screen exists
- [ ] arrival screen exists

### Agents

- [ ] Student Agent can call at least 2 provider endpoints
- [ ] provider endpoints return valid `CandidatePlan`
- [ ] state machine transitions correctly

### Databricks

- [ ] mock `CandidatePlan[]` can be sent to Databricks logic
- [ ] Databricks returns a valid `Recommendation`

### Integration Checkpoint A

Together, confirm:

```text
Provider response schema
=
CandidatePlan schema
```

and:

```text
Databricks response schema
=
Recommendation schema
```

Only then continue.

---

# PHASE 2 — Real Provider Pipeline

## Goal

Replace fake transportation cards with actual backend agent calls.

## Rishit

Connect UI to:

```text
POST /api/trips
POST /api/trips/:id/discover
```

Render real trip state.

Do not care yet whether ANS/Databricks are real.

## Mahin

Implement:

- real Student Agent quote collection
- at least 2 real provider HTTP endpoints
- provider timeout/error handling
- walking candidate adapter
- normalized `CandidatePlan[]`

## Akshar

Keep recommendation interface stable.

If necessary, continue using mock candidates while Mahin finishes.

---

## PHASE 2 EXIT GATE

Must demonstrate:

```text
TAKE ME HOME
↓
Student Agent calls actual provider endpoints
↓
CandidatePlan[] returned
↓
UI renders real provider results
```

No static provider array in the UI.

### Integration Checkpoint B

Rishit + Mahin run the complete discovery flow together.

If this fails, do not start adding data features.

---

# PHASE 3 — Databricks Becomes the Decision Engine

## Goal

Replace local/mock recommendation logic with Databricks.

## Rishit

Wire recommendation UI to real backend response.

Show:

- one selected plan
- explanation
- reason codes translated into human language

## Mahin

Replace mocked `DecisionEngine` with Akshar's Databricks client.

Student Agent sends:

```text
CandidatePlan[]
+
TripContext
```

to Databricks.

## Akshar

Implement authoritative pipeline:

### Stage 0
Emergency boundary.

### Stage 1
Feasibility/safety filtering.

### Stage 2
Safety-first ranking.

### Stage 3
Cost/time/walking/transfer optimization.

### Stage 4
One recommendation.

Log decision.

---

## PHASE 3 EXIT GATE

Must demonstrate:

```text
TAKE ME HOME
↓
real providers respond
↓
Databricks evaluates
↓
one recommendation appears
```

And the team can answer:

> Why did Databricks choose this plan?

with actual data/reason codes.

### Integration Checkpoint C

Change one input:

- budget
- walking duration
- provider availability

The selected recommendation must change predictably.

If it does not, Databricks is not yet meaningfully integrated.

---

# PHASE 4 — GoDaddy ANS Becomes the Trust Layer

## Goal

Make identity/discovery functionally necessary.

## Rishit

Add visible states:

```text
Discovering provider
Verifying provider
Verified provider
Precise location released
```

Technical panel should expose this clearly.

## Mahin

Implement:

- ANS provider registration
- ANS discovery or real registry lookup where feasible
- ANS resolution
- provider identity verification
- SafeCircle authorization policy
- sensitive-location gate

Before verification:

```text
coarse origin/destination only
```

After verification:

```text
exact pickup may be released
```

## Akshar

No architecture changes.

Keep Databricks contract stable.

---

## PHASE 4 EXIT GATE

Must prove:

1. a provider is found/resolved through real ANS flow
2. selected provider identity is verified
3. exact location is unavailable before verification
4. exact location becomes available only after:
   - verification
   - authorization

### Integration Checkpoint D

Run this exact flow in front of all 3 teammates:

```text
TAKE ME HOME
↓
providers
↓
Databricks decision
↓
ANS verification
↓
precise pickup release
↓
provider request
```

This is the minimum sponsor-complete demo.

Tag/commit a stable version here.

---

# PHASE 5 — Navigation + Trip Monitoring

## Goal

Make Beacon actually continue after the recommendation.

## Rishit

Complete P0 navigation:

- map
- route polyline
- current position
- destination
- ETA
- remaining time
- next simple step
- trip-monitoring state
- Need Help

## Mahin

Implement:

- trip start
- expected arrival time
- grace period
- last-known-location storage
- location heartbeat endpoint
- home geofence check
- overdue server-side trigger

## Akshar

Optional contribution:

- route context
- transit context

Do not destabilize the recommendation contract.

---

## PHASE 5 EXIT GATE

Two deterministic tests must pass.

### Test 1 — Normal arrival

```text
trip starts
↓
location enters home geofence
↓
state = ARRIVED
↓
alert cancelled
↓
NO SMS
```

### Test 2 — Overdue

```text
trip starts
↓
destination not reached
↓
deadline + grace expires
↓
state = OVERDUE
↓
trusted contact SMS automatically sent
↓
last known location included
```

### Integration Checkpoint E

Both paths must work from the deployed app/demo environment.

Emergency monitoring is not P1.

It is P0.

---

# PHASE 6 — Autonomous Recovery

## Goal

Prove Beacon owns the objective after a provider failure.

## Rishit

Build polished transition:

```text
Your ride cancelled.
We're handling it.
```

Then:

```text
Finding another option...
```

Then:

```text
New ride confirmed
```

## Mahin

Implement:

```text
provider.cancelled
↓
PROVIDER_FAILED
↓
REPLANNING
↓
collect new quotes
↓
call Databricks again
↓
verify replacement with ANS
↓
request replacement
```

## Akshar

Ensure Databricks:

- receives updated candidates
- excludes failed provider
- selects replacement
- returns updated explanation

---

## PHASE 6 EXIT GATE

The user touches nothing after cancellation.

Must demonstrate:

```text
provider cancelled
↓
Databricks reevaluates
↓
replacement selected
↓
ANS verifies replacement
↓
replacement accepts
↓
trip continues
```

### Integration Checkpoint F

Run this from beginning to end without manual backend intervention except the hidden demo cancellation trigger.

At this point Beacon is hackathon-competitive.

Create another stable tagged build.

---

# PHASE 7 — Real Data Depth

## Goal

Strengthen sponsor depth without risking the core demo.

Only enter this phase after Phases 1–6 pass.

## Akshar leads

Add in order:

1. provider reliability
2. Blacksburg Transit GTFS
3. historical VT incident context
4. weather if time
5. MLflow if easy

## Rishit

Expose better human explanations.

Example:

```text
Chosen because:
- minimal walking
- within budget
- shorter wait
```

## Mahin

Do not alter core orchestration unless required.

---

## PHASE 7 EXIT GATE

At least one real campus dataset visibly changes or supports a Databricks decision.

Do not require every dataset.

---

# PHASE 8 — Production-Realism Additions

## Goal

Make the product feel less like a closed demo.

P1 only.

Potential additions:

- Uber deep link
- real transit handoff
- unverified-agent rejection proof
- trusted-contact polish
- provider reliability analytics

### Uber P1

Flow:

```text
Beacon recommends rideshare
↓
Open Uber
↓
pickup prefilled
↓
destination prefilled
↓
user confirms/pays in Uber
```

Do not implement direct Uber payment/booking.

---

## PHASE 8 EXIT GATE

Only keep an addition if it is:

- reliable
- demoable
- clearly helpful

Remove anything flaky before judging.

---

# PHASE 9 — Demo Hardening

## Goal

Make the demo impossible to break.

No new product features.

Everyone switches to integration mode.

Required:

- deterministic demo origin
- deterministic destination
- seeded provider offers
- deterministic first winner
- deterministic cancellation
- deterministic replacement
- demo reset
- cached external responses where necessary
- production deployment
- bad-Wi-Fi fallback
- screenshot/video backup
- environment variables checked
- mobile test
- second-device test

---

## PHASE 9 EXIT GATE

Run the full demo 3 times consecutively from the deployed URL.

All 3 runs must succeed.

If not:

- simplify
- cache
- remove flaky features

Do not proceed to presentation polish until it does.

---

# PHASE 10 — Sponsor Proof + Pitch

## Goal

Make each judge understand why their sponsor technology is essential.

## GoDaddy proof checklist

- [ ] dynamic provider discovery
- [ ] agent capability visible
- [ ] ANS resolution
- [ ] identity verification
- [ ] precise location withheld before verification
- [ ] authorization after identity
- [ ] precise location released after approval
- [ ] replacement provider reverified after cancellation

## Databricks proof checklist

- [ ] real Databricks environment
- [ ] real data/query
- [ ] candidate plans evaluated
- [ ] feasibility/safety filtering
- [ ] one recommendation
- [ ] reason codes
- [ ] changed inputs change recommendation
- [ ] replanning runs through Databricks again

## Consumer proof checklist

- [ ] TAKE ME HOME
- [ ] minimal decisions
- [ ] navigation
- [ ] provider failure recovery
- [ ] home geofence
- [ ] arrival means no alert
- [ ] overdue means automatic SMS

---

## PHASE 10 EXIT GATE

Every teammate can answer in one sentence:

### Why Beacon?

> It coordinates the entire trip when the user does not want to.

### Why Databricks?

> It turns fragmented transportation, route, provider, and user context into one explainable plan and replans when conditions change.

### Why ANS?

> It lets Beacon discover and verify independent provider agents before precise location is shared.

---

# PHASE 11 — Final Freeze

No new features.

Allowed:

- bug fixes
- copy improvements
- visual polish
- deployment fixes
- Devpost
- pitch rehearsal
- backup recording

Every change must answer:

> Does this make the core demo more reliable or understandable?

If no:

do not merge it.

---

# Integration Checkpoint Summary

## Checkpoint A — Contracts

```text
Provider → CandidatePlan
Databricks → Recommendation
Backend → Trip
```

## Checkpoint B — Real Providers

```text
TAKE ME HOME
→ real provider endpoints
→ CandidatePlan[]
```

## Checkpoint C — Real Databricks

```text
CandidatePlan[]
→ Databricks
→ one recommendation
```

## Checkpoint D — Real ANS

```text
recommendation
→ ANS verify
→ authorization
→ precise-location release
→ provider request
```

## Checkpoint E — Monitoring

```text
arrive → no SMS
overdue → automatic SMS
```

## Checkpoint F — Recovery

```text
provider fails
→ Databricks replans
→ ANS verifies replacement
→ new provider accepts
```

## Checkpoint G — Full Demo

```text
TAKE ME HOME
→ HOME / OVERDUE
```

from deployed URL, repeatedly.

---

# Phase Dependency Map

```text
PHASE 1
Skeleton
   ↓
PHASE 2
Real providers
   ↓
PHASE 3
Databricks
   ↓
PHASE 4
ANS
   ↓
PHASE 5
Navigation + monitoring
   ↓
PHASE 6
Recovery
   ↓
 ┌─────────────┐
 │ CORE LOCKED │
 └─────────────┘
   ↓
PHASE 7
Data depth
   ↓
PHASE 8
Production realism
   ↓
PHASE 9
Hardening
   ↓
PHASE 10
Pitch
   ↓
PHASE 11
Freeze
```

---

# What Each Person Does When Blocked

## Rishit blocked by backend

Continue with mocks.

Work on:

- polish
- state transitions
- map
- judge panel
- fallback states

Never wait.

## Mahin blocked by ANS

Continue with:

- local AgentDirectory adapter
- provider contract
- trip state
- authorization
- cancellation/replanning

Swap in real ANS later.

## Akshar blocked by datasets

Continue with:

- CandidatePlan scoring
- reason codes
- Databricks API path
- provider reliability seed data

Never spend the whole hackathon cleaning data.

---

# Final P0 Definition

Beacon is build-locked only when all of these pass:

```text
TAKE ME HOME
↓
real provider agents
↓
Databricks safety-first recommendation
↓
one plan automatically selected
↓
ANS verification
↓
precise-location gate
↓
provider coordination
↓
basic navigation
↓
trip monitoring
↓
provider cancellation
↓
automatic replacement
↓
home geofence
├─ reached → no SMS
└─ overdue → automatic SMS
```

Everything outside that chain is optional until this chain works.
