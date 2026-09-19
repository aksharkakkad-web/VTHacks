# Beacon — START HERE

> 24-hour sprint update: begin independent track work now using the shared types and mocks. Complete account access, demo sign-off, and remaining checklist items in parallel; use checkpoints A–G in the phase plan to integrate. The checklist below remains a risk tracker, not a reason to idle all three tracks.

**Read this together before anyone splits off.**

This document is only for kickoff/setup.<br>
Once the final checklist is complete, stop using this file and move to your individual tracks in the phase plan.

---

# Team Ownership

## Akshar — Databricks / Data / Recommendation Engine

After the split, Akshar owns:

- Databricks Free Edition setup
- Databricks AI Dev Kit
- Unity Catalog / Delta
- SQL Warehouse
- recommendation engine
- feasibility / safety filtering
- safety-first ranking
- cost / ETA / walking optimization
- reason codes + explanations
- replanning evaluation
- provider reliability
- GTFS / incident data if time
- optional MLflow

Primary output:

```text
CandidatePlan[]
↓
Databricks
↓
Recommendation
```

---

## Mahin — Agents / GoDaddy ANS / Trip State

After the split, Mahin owns:

- Student Agent
- provider-agent contract
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
- cancellation
- autonomous replanning
- trip state machine
- trip-monitor backend
- overdue trigger
- emergency-contact orchestration

Primary output:

```text
GET ME HOME
↓
Provider Agents
↓
CandidatePlan[]
```

and later:

```text
Recommendation
↓
ANS verification
↓
Provider coordination
↓
Trip state
```

---

## Rishit — Product / PWA / Demo Experience

After the split, Rishit owns:

- onboarding
- saved preferences
- TAKE ME HOME
- loading / agent activity UI
- selected-plan UI
- map/navigation UI
- trip status
- replanning UI
- overdue UI
- arrival UI
- judge technical view
- demo/reset controls
- mobile polish

Primary input/output:

```text
Trip
↓
Beautiful user experience
```

Rishit builds against mocks immediately and should never wait for backend work.

---

# Step 1 — Create One Shared Repo

Create one repo.

Recommended stack:

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
```

Recommended structure:

```text
/src
  /app
  /components

  /agents
    /student
    /transit
    /campus-ride
    /independent-ride

  /integrations
    /ans
    /databricks
    /maps
    /notifications

  /lib
    /trip-state
    /authorization
    /demo

  /types

/databricks
  /notebooks
  /sql
```

Everyone:

- clone repo
- install dependencies
- run app locally
- confirm same package manager
- confirm same Node version if needed

Do not split yet.

---

# Step 2 — Create Shared Types

Create these files:

```text
/src/types/provider.ts
/src/types/recommendation.ts
/src/types/trip.ts
```

## CandidatePlan

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

## Recommendation

```ts
export type Recommendation = {
  selectedPlanId: string
  runnerUpPlanId?: string

  reasonCodes: string[]
  explanation: string

  evaluatedAt: string
}
```

## TripState

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

## Trip

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

### Rule

These are shared contracts.

After the split, nobody changes them silently.

If a shared type must change:

```text
post in team chat
↓
everyone acknowledges
↓
change it once
```

---

# Step 3 — Freeze API Paths

Rishit will mock these immediately.

Mahin will implement them later.

Freeze:

```text
POST /api/trips
POST /api/trips/:id/discover
POST /api/trips/:id/evaluate
POST /api/trips/:id/confirm
POST /api/trips/:id/verify
POST /api/trips/:id/request
POST /api/trips/:id/events
POST /api/trips/:id/location
POST /api/trips/:id/arrive

POST /api/demo/trips/:id/cancel-provider
POST /api/demo/trips/:id/expire-deadline
POST /api/demo/reset
```

Do not rename these casually after splitting.

---

# Step 4 — Freeze the Judge Demo Scenario

Everyone builds against the exact same scenario.

Use one fixed origin and destination.

Example:

```text
Origin:
Downtown Blacksburg

Destination:
Pritchard Hall

Budget:
$10

Preference:
Minimize walking

Emergency Contact:
Maya
```

Freeze demo candidate values.

Example:

```text
Campus Ride
$0
8 min wait
11 min travel
1 min walking

Independent Ride
$7
5 min wait
10 min travel
1 min walking

Transit
$0
15 min wait
14 min travel
5 min walking

Walk
$0
22 min walking
```

Before splitting, agree on:

- initial winning plan
- provider cancelled in the demo
- replacement winning plan
- expected ETA
- overdue grace period
- exact demo copy if useful

Do not keep changing these numbers independently.

---

# Step 5 — Create `.env.example`

Create one shared template.

At minimum reserve:

```text
DATABRICKS_HOST=
DATABRICKS_TOKEN=
DATABRICKS_WAREHOUSE_ID=

ANS_API_KEY=
ANS_BASE_URL=

MAPBOX_TOKEN=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

DEMO_MODE=true
```

Use actual sponsor variable names if different.

Never commit secrets.

---

# Step 6 — Sponsor / Service Setup

Do this in parallel while still together enough to help each other.

## Akshar

Confirm:

- Databricks Free Edition account works
- workspace opens
- SQL Warehouse exists
- can create/query a table
- install/use Databricks AI Dev Kit
- note workspace host + auth method

Minimum proof before split:

```sql
SELECT 1;
```

works in the environment.

---

## Mahin

Confirm:

- GoDaddy ANS credentials/docs available
- registration path understood
- domain/identity requirements understood
- start registering at least one Beacon provider agent immediately

External registration/verification can take time, so start early.

---

## Rishit

Confirm:

- Next.js app runs
- UI library works
- map provider account/token works
- PWA can request browser geolocation

No need for final UI yet.

---

# Step 7 — Protect File Ownership

After splitting:

## Akshar owns

```text
/databricks/**
/src/integrations/databricks/**
/src/lib/decision-client/**
/data/**
```

## Mahin owns

```text
/src/agents/**
/src/integrations/ans/**
/src/lib/trip-state/**
/src/lib/authorization/**
/src/integrations/notifications/**
/src/app/api/trips/**
/src/app/api/demo/**
```

## Rishit owns

```text
/src/app/**
/src/components/**
/src/lib/client/**
/src/lib/demo-ui/**
```

## Shared / protected

```text
/src/types/**
.env.example
package.json
README.md
```

If you need to edit someone else's owned area, message them first.

---

# Step 8 — Freeze the Core Pipeline

Everyone should be able to say this pipeline from memory:

```text
Provider Agents
↓
CandidatePlan[]
↓
Databricks
↓
Recommendation
↓
Student Agent / Trip
↓
PWA
```

And after selection:

```text
Selected Provider
↓
GoDaddy ANS
↓
Authorization
↓
Precise Location Release
↓
Provider Coordination
```

Failure:

```text
Provider Cancelled
↓
Mahin replans
↓
Akshar reevaluates
↓
ANS verifies replacement
↓
Trip continues
```

Monitoring:

```text
Home reached
→ no SMS

Overdue
→ automatic emergency-contact SMS
```

---

# Step 9 — Decide Git Rules

Do not use 3 giant long-lived personal branches.

Use small feature branches.

## Akshar examples

```text
feat/databricks-connect
feat/recommendation-engine
feat/gtfs
feat/incident-context
```

## Mahin examples

```text
feat/provider-contract
feat/student-agent
feat/ans-discovery
feat/replanning
feat/trip-monitor
```

## Rishit examples

```text
feat/home-flow
feat/navigation-ui
feat/replan-ui
feat/judge-view
```

Merge small PRs continuously.

---

# FINAL SPLIT CHECKLIST

Do not split until every box is checked.

## Repo

- [ ] repo created
- [ ] everyone can clone
- [ ] everyone can run locally
- [ ] package manager agreed
- [ ] base folder structure exists

## Contracts

- [ ] `CandidatePlan` frozen
- [ ] `Recommendation` frozen
- [ ] `TripState` frozen
- [ ] `Trip` frozen
- [ ] API paths frozen

## Demo

- [ ] origin frozen
- [ ] destination frozen
- [ ] budget frozen
- [ ] provider values frozen
- [ ] initial winner frozen
- [ ] cancelled provider frozen
- [ ] replacement winner frozen
- [ ] overdue behavior agreed

## Environment

- [ ] `.env.example` committed
- [ ] real secrets are NOT committed
- [ ] Akshar can access Databricks
- [ ] Mahin can access ANS setup/docs
- [ ] Rishit can run PWA + map/geolocation setup

## Ownership

- [ ] Akshar understands Databricks ownership
- [ ] Mahin understands agent/ANS ownership
- [ ] Rishit understands product/PWA ownership
- [ ] everyone understands protected/shared files

---

# ✅ YOU MAY NOW SPLIT

Once every checklist item above is complete:

## Akshar

Open:

**`Beacon_Phase_Based_Parallel_Build_Plan.md`**

Start with:

> **Databricks recommendation engine against mocked CandidatePlans**

Do not begin by cleaning large datasets.

---

## Mahin

Open:

**`Beacon_Phase_Based_Parallel_Build_Plan.md`**

Start with:

> **2–3 provider endpoints + Student Agent returning valid CandidatePlan[]**

Also keep ANS registration moving immediately.

---

## Rishit

Open:

**`Beacon_Phase_Based_Parallel_Build_Plan.md`**

Start with:

> **the complete visual TAKE ME HOME → REPLAN → HOME / OVERDUE flow using mocks**

Do not wait for backend.

---

# After the Split

Stop using this START HERE file.

Use:

## Product decisions / architecture questions

`Beacon_Final_Hackathon_PRD.md`

## What to build next / when to reunite

`Beacon_Phase_Based_Parallel_Build_Plan.md`

The team reunites at the explicit integration checkpoints in that document.

---

# Final Kickoff Rule

Before separating, everyone says out loud:

> **Akshar makes the decision engine.<br>
> Mahin makes the agents coordinate securely.<br>
> Rishit makes the product real to the user.**

Then build.
