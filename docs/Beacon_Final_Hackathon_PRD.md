# Beacon — Final Hackathon PRD

**Status:** Build-locked, pivot-aware<br>
**Version:** 1.1 — journey coordination framing<br>
**Build window:** ~30 hours<br>
**Team size:** 3<br>
**Platform:** Mobile-first PWA<br>
**Primary sponsor targets:** Deloitte × Databricks, GoDaddy ANS<br>
**Primary Deloitte focus area:** Campus Life Intelligence Hub<br>
**Core demo path:** `GET ME HOME → discover → evaluate → verify → coordinate → fail → recover → arrive`

**September 19 data-track addendum:** The [expanded-pilot status](DATABRICKS_EXPANDED_PILOT_STATUS.md) records the current implementation, limitations and Mahin/Rishit handoff. The intended pilot helps provide an actionable alternative to an offered ride with a driver the user reports has been drinking; Beacon must never infer sobriety. A privacy-preserving exclusion contract still needs team integration. Wider transit/pedestrian data is prepared locally, not a completed or deployed downtown-to-home product. Existing consent, emergency-help and location-sharing gates remain mandatory.

---

## 0. Executive Summary

Beacon is a personal campus mobility agent for moments when a student does not have the attention, energy, or capacity to coordinate getting home themselves.

The user gives Beacon one outcome:

> **GET ME HOME**

Beacon then:

1. Loads the student's saved destination and preferences.
2. Interprets any temporary context or constraints.
3. Discovers independent transportation/service agents.
4. Requests non-sensitive quotes and availability.
5. Normalizes candidate plans.
6. Uses Databricks to evaluate the plans using campus, route, service, and user context.
7. Returns one recommended plan.
8. Lets the user confirm with one final action.
9. Uses GoDaddy ANS to resolve and verify the selected provider before sensitive trip data is released.
10. Coordinates the trip.
11. Monitors provider/trip state.
12. Automatically replans if the provider fails.
13. Ends temporary data access after the trip is complete.

### Product thesis

> **The student chooses the outcome. The agents handle discovery, intelligence, trust, coordination, and recovery.**

### Consumer tagline

> **Get me home. Beacon handles the rest.**

### Locked product framing

The problem is the chain of decisions between deciding to leave and actually arriving home. A student who is tired, overwhelmed, or impaired may need to compare options, reach the right pickup point, wait, verify the vehicle, and recover if a bus or ride falls through. A booked ride does not finish those steps by itself.

Uber or Lyft may be the best option; Beacon should recommend a commercial ride when a real integration or clearly labeled handoff makes it available. Beacon's distinctive job is to choose and coordinate the whole trip across available modes, then replan when a step fails. The goal is to reduce avoidable solo walking, outdoor waiting, and improvised choices, while honoring time, price, and user constraints. These are observable trip burdens, not predictions of personal safety.

For the hackathon, ride offers without live provider integrations must be labeled simulated. Current data does not verify street lighting, an open indoor waiting place, a staffed pickup zone, real-time crime risk, or an available sober companion. Do not display any of those as facts or assign a crime/safety score. A future campus pilot could add verified pickup/wait locations, lighting and outage data, official escort availability, and commercial ride handoffs through real partnerships. Shared walking is limited to known contacts who explicitly opt in; never match strangers or infer that someone is sober.

---

# 1. Why This Product Exists

Getting home late at night can require surprisingly high cognitive effort.

A student may need to:

- check public transit
- check campus transportation
- compare walking and riding
- compare cost
- compare wait time
- compare total trip time
- figure out where to wait and when to move to a pickup point
- check that the arriving vehicle matches the provider's details
- determine how much walking is involved
- understand transfers
- search several apps
- decide what service to trust
- share location
- restart everything if the original plan fails
- avoid being left alone with a failed or delayed plan

That process is especially bad when someone is:

- exhausted
- overwhelmed
- impaired
- anxious
- separated from friends
- unfamiliar with the area
- dealing with a failed ride
- trying to stay under a budget
- trying to minimize walking
- simply not in a state to make several small decisions

Existing tools solve pieces of the problem.

- Maps solve routing.
- Transit apps solve schedules.
- Rideshare solves one paid transportation mode.
- Campus services solve specific campus transportation needs.
- Historical public-safety data provides context.
- Friends provide accountability.

Beacon is not another one of those tools.

Beacon is the **coordination layer** that takes responsibility for assembling them into one outcome.

---

# 2. Primary Use Case

The hero use case is:

> It is late after a party, event, or night out. The student is tired, overwhelmed, impaired, separated from friends, or otherwise does not want to coordinate transportation themselves. They want one thing: to get home.

The product should be able to handle:

> “Get me home.”

Optional context may be added:

> “Get me home under $10.”

> “I’ve been drinking. Minimize walking.”

> “I’m exhausted.”

> “I don’t want to transfer.”

The system does **not** diagnose intoxication or impairment.

If a user explicitly says they have been drinking or are exhausted, that becomes user-provided context which can increase penalties for:

- long walking
- multiple transfers
- high-friction handoffs
- complex plans

The app does not claim medical expertise.

---

# 3. Secondary Use Cases

The product infrastructure should generalize to:

- late-night studying
- concerts/events
- a cancelled ride
- unfamiliar areas
- feeling uncomfortable walking alone
- limited mobility
- temporary injury
- transportation disruption
- low phone battery / low attention
- travel between campus and nearby off-campus areas

These are secondary use cases.

They should not make the pitch broad or vague.

The demo and product positioning should remain anchored on:

> **“I just want to get home. Handle it for me.”**

---

# 4. Product Positioning

## What Beacon is

Beacon is:

- an autonomous campus mobility coordinator
- a personal agent
- an open provider-agent ecosystem
- a decision and orchestration layer
- a trust-aware system for sensitive trip coordination
- a one-recommendation experience
- an agent that owns the task until the objective is complete

## What Beacon is not

Beacon is not:

- Uber for students
- a drunk-student rideshare
- a sobriety detector
- a drunk-driving detector
- a crime-prediction system
- a generic campus safety chatbot
- a Google Maps replacement
- an emergency dispatch system
- a student-driver marketplace
- a full payment platform
- a social network
- a police-reporting app
- a system that guarantees personal safety

---

# 5. Hackathon Strategy

Beacon is deliberately optimized for:

## GoDaddy / ANS

The project must show that independently operated agents can:

- advertise capabilities
- be discovered
- expose endpoints/functions
- identify who operates them
- establish verifiable identity
- communicate after trust is established
- perform a real task together

ANS must be architecturally necessary.

Removing ANS should materially weaken Beacon.

## Deloitte × Databricks

The project must show that Databricks:

- combines fragmented campus/service data
- stores and processes useful real-world context
- evaluates changing transportation options
- incorporates user preferences and current conditions
- produces one actionable recommendation
- supports replanning
- provides explainability and observability
- can scale beyond a single campus

Databricks must be the intelligence/data layer, not just storage.

## Overall hackathon judging

The build should visibly demonstrate:

- technical execution
- originality
- usefulness/impact
- completeness
- presentation quality
- difficulty
- sponsor-native integration
- an end-to-end working demo

---

# 6. Core UX Principle

The app should become **simpler** as the situation becomes harder.

The user should not see four giant transportation cards and be told to choose.

Internally, Beacon may evaluate many plans.

Externally, Beacon returns:

> **one recommended plan**

The user receives one final confirmation.

Show the recommendation's total time, price, walking, wait, and pickup steps when the underlying provider/data supports them. Distinguish a scheduled or estimated time from a confirmed booking. Show a waiting location only when its availability is verified; otherwise say it is unknown. Remind the user to match the vehicle and driver details supplied by the provider, without implying Beacon verified the physical car. A paid replacement or newly shared precise location requires the applicable confirmation and authorization gate.

Example:

## Campus Ride

**$0 · pickup in 7 min · home in 14 min**

- minimal walking
- within your budget
- verified provider

**GO**

Secondary controls:

- `Why this?`
- `Backup option` (optional)
- `Need help`

No comparison matrix is required.

---

# 7. One-Time Onboarding

Onboarding happens before a high-friction trip.

Store:

```ts
interface UserPreferences {
  home: Location;
  maxBudget: number;
  walkingPreference: "normal" | "minimize";
  transferPreference?: "normal" | "minimize";
  accessibilityNeeds?: string[];
  trustedContact?: TrustedContact;
}
```

Example:

```json
{
  "home": "Pritchard Hall",
  "maxBudget": 10,
  "walkingPreference": "minimize",
  "transferPreference": "minimize",
  "trustedContact": {
    "name": "Maya"
  }
}
```

The user can edit preferences later.

Do not ask the user to re-enter these on every trip.

---

# 8. In-the-Moment Input

The default action is:

# GET ME HOME

Optional temporary overrides:

- under $10
- minimize walking
- minimize transfers
- I have been drinking
- I am exhausted
- I need the simplest option

Beacon merges temporary context with the saved profile.

No questionnaire is required during the trip.

---

# 9. Transportation Modes

Beacon should reason over a small number of meaningful options.

## 9.1 Walking

Walking is a route/tool-generated option, not an external agent.

Features:

- walking duration
- walking distance
- route geometry
- weather
- time of day
- historical incident context
- outdoor exposure

Walking may be recommended if it is genuinely the best fit.

Walking should not be called “safe” or “unsafe.”

## 9.2 Transit Agent

Represents public transit.

Hackathon target:

- Blacksburg Transit

Capabilities may include:

- quote trip
- service status
- scheduled departure
- trip details
- stop information

## 9.3 Campus Ride Agent

Represents a campus transportation capability.

Hackathon behavior may be simulated where no programmatic live API exists.

Capabilities:

- quote trip
- request trip
- trip status
- cancel trip

## 9.4 Independent Ride Agent

Represents an independently operated point-to-point mobility provider.

For the hackathon:

- availability may be simulated
- price may be seeded
- ETA may be seeded
- communication must be real backend-to-backend communication

This gives the demo a true independent-provider agent.

Production expansion could later include commercial rideshare adapters/providers.

---

# 10. Agents vs Tools

Do not call every API an agent.

## Agents

Agents represent independent actors:

- Student Agent
- Transit Agent
- Campus Ride Agent
- Independent Ride Agent

## Tools

Tools provide capabilities/data:

- routing
- Databricks recommendation
- Databricks context queries
- weather
- historical incident lookup
- user preference store
- mapping

ANS should primarily apply to independent agents, not every internal function.

---

# 11. Student Agent

The Student Agent represents the user and owns the objective.

Responsibilities:

1. Receive `GET_ME_HOME`.
2. Load saved preferences.
3. Parse temporary constraints.
4. Discover provider capabilities.
5. Request non-sensitive quotes.
6. Generate walking candidate.
7. Normalize candidates.
8. Fetch relevant context.
9. Ask Databricks to evaluate candidates.
   Include measurable walking/waiting burden and pickup feasibility when available; leave unknown fields unknown.
10. Return one recommendation.
11. Wait for user confirmation.
12. Resolve/verify selected provider with ANS.
13. Apply authorization policy.
14. Release only permitted sensitive data.
15. Request trip.
16. Monitor provider state.
17. Replan on provider failure.
18. Complete trip.

Example objective:

> Get me to Pritchard Hall for no more than $10 while minimizing unnecessary walking and transfers.

---

# 12. Provider Agent Contract

All providers should conform to a common high-level contract.

## `POST /agent/quote`

Input:

```json
{
  "origin_zone": "Downtown Blacksburg",
  "destination_zone": "VT residential campus",
  "constraints": {
    "max_budget": 10,
    "minimize_walking": true,
    "minimize_transfers": true
  }
}
```

Before provider verification, use coarse information only.

Do not send:

- exact GPS
- student identity
- exact dorm address if not required
- trusted-contact information

Output:

```json
{
  "provider_id": "campus_ride",
  "provider_name": "Campus Ride",
  "mode": "ride",
  "available": true,
  "cost": 0,
  "pickup_eta_minutes": 8,
  "travel_time_minutes": 11,
  "walking_minutes": 1,
  "capacity": 2,
  "service_area": "Virginia Tech / Blacksburg"
}
```

## `POST /agent/request-trip`

Requires:

- provider ANS verification
- Beacon authorization
- user confirmation
- exact trip details

## `GET /agent/trip-status/:tripId`

Returns:

- accepted
- waiting
- cancelled
- in_trip
- completed

## `POST /agent/cancel-trip`

For demo/provider failure logic.

---

# 13. Normalized Candidate Plan

Every transportation option must normalize into one contract.

```ts
interface CandidatePlan {
  planId: string;
  providerId: string | null;
  providerName: string;

  mode:
    | "walk"
    | "transit"
    | "campus_ride"
    | "independent_ride";

  available: boolean;

  cost: number;
  waitMinutes: number;
  travelMinutes: number;
  walkingMinutes: number;
  totalMinutes: number;

  transfers?: number;
  reliability?: number;

  historicalExposure?: number;
  weatherPenalty?: number;

  requiresProviderVerification: boolean;

  metadata?: Record<string, unknown>;
}
```

Walking:

```text
providerId = null
requiresProviderVerification = false
```

---

# 14. Databricks Track Alignment

Beacon should enter:

## Campus Life Intelligence Hub

The project matches that focus because it:

- unifies fragmented campus services
- creates one personalized student experience
- uses real-time/changing context
- provides recommendations
- turns campus/service data into action

Do not primarily frame the project as:

- crime analytics
- policing
- institutional operations

Frame it as:

> **a connected campus-life experience built around mobility and coordination**

---

# 15. Databricks Responsibilities

Databricks owns three major layers.

## 15.1 Data

Databricks stores/processes:

- transit reference data
- public historical incident context
- provider reliability
- trip decisions
- optional weather-derived features
- optional aggregate trip analytics

## 15.2 Intelligence

Databricks:

- enforces hard constraints
- normalizes features
- evaluates candidates
- selects one recommendation
- returns evidence/reason codes
- reevaluates after state changes

## 15.3 Observability

Databricks should expose or log:

- candidate plans
- features
- selected plan
- reason codes
- replanning events
- optional MLflow traces

---

# 16. Databricks Environment Strategy

Because the sponsor gives a Free Edition environment, do not build the MVP around a feature that may not be available.

## Safe MVP foundation

Use:

- Databricks Free Edition
- Unity Catalog / Delta tables
- notebooks for ingestion
- Databricks SQL Warehouse
- Statement Execution API
- MLflow where available/useful
- Model Serving only if it is available and quick to use

## Optional upgrade

If the workspace exposes an Agent/Supervisor feature and it is easy to use, integrate it after the vertical slice works.

Do not allow that dependency to block the demo.

---

# 17. Databricks Catalog / Tables

Suggested organization:

```text
catalog: beacon
schema: hackathon
```

## `incidents`

```text
incident_id
event_timestamp
latitude
longitude
category
source
h3_cell
imported_at
```

## `transit_stops`

```text
stop_id
stop_name
latitude
longitude
```

## `transit_routes`

```text
route_id
route_name
```

## `transit_stop_times`

```text
trip_id
route_id
stop_id
arrival_time
departure_time
service_date
```

## `provider_stats`

```text
provider_id
completed_trips
cancelled_trips
avg_pickup_delay
reliability
updated_at
```

## `trip_decisions`

```text
trip_id
created_at
user_context
candidate_count
selected_plan_id
selection_reason
replanned
```

Optional:

## `trip_summary`

```text
trip_id
selected_mode
estimated_arrival
actual_arrival
alert_triggered
recommendation_reason
```

Do not permanently store a full GPS history for the hackathon.

---

# 18. Real-World Data

Prefer a small number of high-quality sources.

## Transit

Use public Blacksburg Transit GTFS/static transit data.

Use schedule language accurately.

Say:

> Scheduled in 6 min

unless real-time arrival is truly available.

## Historical incident context

Use official public Virginia Tech Police reported incident logs where practical.

Do not spend hours trying to ingest every historical record.

A high-quality subset is acceptable.

## Weather

Optional.

Use only if it meaningfully affects recommendations.

Examples:

- heavy rain increases walking friction
- severe weather may remove walking from consideration

Do not make weather a separate agent.

---

# 19. Historical Incident Context

This feature is optional and secondary. The current small, selected incident sample is insufficient for route-level comparison or a crime-risk score. In the hackathon, show incident records only as dated, source-labeled context with coverage limits.

Only consider the pipeline below in a future pilot with sufficiently complete, geocoded, time-bounded official records and a reviewed interpretation. Reported incidents remain historical context, not a forecast of what will happen on a trip.

It must not become a fake “danger score.”

Possible pipeline:

1. Geocode incident locations.
2. Store incident coordinates.
3. Convert incidents to spatial cells such as H3.
4. Convert candidate walking route/corridor to nearby cells.
5. Query reported incidents near route.
6. Optionally filter by comparable late-night hours.
7. Normalize by route distance.
8. Return an exposure feature.

Only a future pilot with suitable records may make a comparative route claim, and that claim must name its source, time range, and coverage limits.

Never say:

- this route is safe
- this route is dangerous
- crime probability
- attack probability
- guaranteed safer

---

# 20. User Context Model

Temporary context may include:

```ts
interface TripContext {
  hasBeenDrinking?: boolean;
  exhausted?: boolean;
  anxious?: boolean;

  minimizeWalking?: boolean;
  minimizeTransfers?: boolean;

  maxBudget?: number;

  currentTime: string;
  weatherContext?: WeatherContext;
}
```

If the user explicitly says they have been drinking:

- increase walking penalty
- increase transfer penalty
- increase plan-complexity penalty

Do not medically infer anything.

---

# 21. Databricks Recommendation Logic

Do not let an LLM freestyle the final decision.

Use a deterministic, explainable ranking pipeline.

## Stage 1 — Emergency boundary

If the user states:

- immediate danger
- serious injury
- medical emergency

do not run normal route optimization first.

Surface emergency-help options.

## Stage 2 — Hard filtering

Remove:

- unavailable providers
- impossible routes
- stale quotes
- options violating hard user constraints
- transit that is not operating
- providers outside service area

## Stage 3 — Feature normalization

Normalize:

- cost
- wait time
- travel time
- total time
- walking time
- outdoor waiting time and pickup steps when supported by actual data
- transfers
- provider reliability
- historical context only if a suitable, reviewed data set exists
- weather friction

## Stage 4 — Context weighting

Baseline weights may emphasize:

- reliability
- walking
- wait time
- total trip time
- cost

If user says they have been drinking or are exhausted:

- walking weight increases
- transfer complexity increases

## Stage 5 — Ranking

Conceptual utility:

```text
utility =
    - cost_weight * normalized_cost
    - wait_weight * normalized_wait
    - travel_weight * normalized_total_time
    - walking_weight * normalized_walk
    - complexity_weight * normalized_transfers
    - exposure_weight * normalized_observed_walk_and_wait_burden
    + reliability_weight * normalized_reliability
```

Higher utility is better.

Unknown lighting, indoor waiting availability, and pickup conditions must not silently become favorable scores. A future reviewed historical-context feature may be added separately; it is not a crime probability.

## Stage 6 — Explanation

Return structured reason codes and a short explanation.

Example:

```json
{
  "selected_plan_id": "campus_ride_042",
  "runner_up_plan_id": "independent_ride_023",
  "reason_codes": [
    "WITHIN_BUDGET",
    "LOW_WALKING",
    "LOW_WAIT",
    "HIGH_RELIABILITY"
  ],
  "explanation": "Campus Ride fits your budget and gets you home with minimal walking."
}
```

---

# 22. GoDaddy ANS Role

ANS must perform two major jobs.

## 22.1 Discovery

The Student Agent discovers independently operated agents it has never interacted with.

## 22.2 Identity

Before precise trip data is released, Beacon verifies who operates the selected provider.

This creates the architecture:

```text
Discover capability
→ request coarse quote
→ Databricks evaluates
→ user confirms
→ ANS resolves/verifies
→ Beacon authorization check
→ exact data released
→ provider coordinates
```

---

# 23. ANS Registration

Target provider identities:

```text
transit.beacon.dev
campusride.beacon.dev
ride.beacon.dev
```

Use whatever naming/registration format the actual sponsor tooling requires.

Preferred protocol:

> HTTP API

Do not over-engineer MCP/A2A unless the core system already works.

Advertised provider functions should include:

```text
quote_trip
request_trip
trip_status
cancel_trip
```

The provider agent should have actual callable endpoints.

---

# 24. ANS Discovery

Do not hard-code every provider into the sponsor demo.

The Student Agent should conceptually query the ANS registry for a transportation capability.

Example:

```text
capability: transportation
location: Blacksburg / Virginia Tech
functions:
  - quote_trip
  - request_trip
```

ANS returns agents exposing appropriate capabilities.

The Student Agent then requests quotes from discovered agents.

Fallback:

If ANS search is unreliable under hackathon conditions, keep:

- one real ANS-discovered agent
- one or more preconfigured demo agents

But clearly preserve the real discovery path.

---

# 25. ANS Sensitive-Data Gate

Before provider verification, permitted data:

- approximate origin zone
- approximate destination zone
- max budget
- general trip constraints
- requested capability

Withhold:

- precise GPS
- student identity
- exact residence
- trusted contact
- personally identifying details

After:

```text
ANS identity verified
+
Beacon policy authorizes provider
+
user confirmed plan
```

Beacon may release:

- exact pickup location
- exact destination
- trip identifier
- limited required user data

This makes ANS functionally necessary.

---

# 26. Identity vs Authorization

ANS answers:

> Who is this agent?

Beacon answers:

> What is this verified agent allowed to know?

Example authorization rules:

```text
verified ride provider
→ precise pickup allowed

verified transit agent
→ trip/route query allowed
→ student identity unnecessary

verified analytics agent
→ aggregate context only

verified unrelated agent
→ no precise location

unverified agent
→ no sensitive data
```

This distinction should be prepared for sponsor Q&A.

---

# 27. Initial Confirmation

The user retains one final confirmation.

Flow:

```text
GET ME HOME
↓
Beacon evaluates
↓
one recommended plan
↓
GO
```

After `GO`, Beacon may automatically recover from provider failures as long as the replacement stays within the user's already-approved constraints.

This balances low cognitive load with user control.

---

# 28. Trip State Machine

Primary states:

```text
IDLE
↓
OBJECTIVE_RECEIVED
↓
DISCOVERING
↓
COLLECTING_QUOTES
↓
EVALUATING
↓
AWAITING_CONFIRMATION
↓
VERIFYING_PROVIDER
↓
COORDINATING
↓
WAITING_FOR_PICKUP
↓
IN_TRIP
↓
ARRIVED
```

Failure/recovery:

```text
COORDINATING / WAITING_FOR_PICKUP
↓
PROVIDER_FAILED
↓
REPLANNING
↓
COLLECTING_QUOTES
↓
EVALUATING
↓
VERIFYING_PROVIDER
↓
COORDINATING
```

Terminal failure:

```text
FAILED
```

---

# 29. Autonomous Replanning

Autonomous replanning is P0.

It is the strongest proof that Beacon is truly agentic.

Example:

Initial plan:

```text
Campus Ride
$0
7 min pickup
```

Provider event:

```text
status = cancelled
```

The user does nothing.

Beacon:

1. marks provider unavailable
2. gets new provider offers
3. regenerates candidate plans
4. calls Databricks
5. receives replacement
6. verifies replacement through ANS
7. applies authorization
8. requests replacement trip
9. updates user

UI:

## Your plan changed

**New ride confirmed · 7 min**

No:

- Retry
- Search again
- Pick another option
- Compare plans

---

# 30. Trusted Contact

Trusted-contact behavior is secondary.

Recommended MVP behavior:

- normal trip starts → no automatic message required
- trip completes → no alert
- trip becomes overdue → prompt user
- user does not respond → optional trusted-contact notification

Potential alert:

> Beacon trip is overdue. Last known trip status: [status]. Please check in.

If location is available and consent was given, include last known location.

This is P1.

Do not allow Twilio/background monitoring to delay the core sponsor demo.

---

# 31. PWA Background Limitation

Beacon is a PWA for hackathon speed.

Mobile browsers can suspend background execution.

Therefore:

- foreground location can be real
- active-trip tracking can be real
- server timers can be real
- background precise location may be incomplete

Do not claim production-grade background tracking.

Production roadmap may include a native app.

---

# 32. Emergency Boundary

Beacon is not emergency dispatch.

If the user reports:

- immediate danger
- medical emergency
- serious injury

surface emergency options immediately.

Examples:

- Call 911
- Call campus safety
- Call trusted contact

Do not make the user wait for an AI agent recommendation.

---

# 33. PWA Screens

## Screen 1 — Home

Display:

- Beacon
- current destination/home
- minimal saved-preference summary

Dominant action:

# GET ME HOME

Optional small natural-language field.

## Screen 2 — Agent Activity

Automatic.

Example:

```text
Finding the best way home...

✓ Finding providers
✓ Checking transit
◌ Evaluating options
◌ Verifying availability
```

Optional judge mode reveals technical detail.

## Screen 3 — Recommendation

Example:

```text
Campus Ride

$0
7 min pickup
14 min home
1 min walking

✓ within budget
✓ minimal walking
✓ verified provider available
```

Primary CTA:

**GO**

Secondary:

- Why this?
- Backup option

## Screen 4 — Active Trip

Show:

- provider
- ETA
- destination
- route/map
- trip status
- verification status
- Need Help

No full Google-Maps replacement.

## Screen 5 — Replanning

Example:

```text
Your ride cancelled.
We're handling it.
```

Then automatically:

```text
Finding another option...
```

Then:

```text
New ride confirmed
7 min
```

## Screen 6 — Arrival

```text
HOME ✓

Trip complete.
Provider access expired.
Location sharing ended.
```

---

# 34. Judge / Technical View

Create an optional expandable:

> **See what Beacon did**

Example:

```text
STUDENT AGENT
Objective: Home ≤ $10, minimize walking

ANS
Searching transportation capabilities...

TRANSIT AGENT
$0 · scheduled in 16 min

CAMPUS RIDE AGENT
$0 · pickup in 8 min

RIDE AGENT
$7 · pickup in 5 min

DATABRICKS
Evaluating...

DATABRICKS
Selected: Campus Ride

USER
GO

ANS
Resolving provider identity...

ANS
Verified ✓

BEACON POLICY
Precise pickup: allowed

STUDENT AGENT → CAMPUS RIDE
Requesting trip...

CAMPUS RIDE
Accepted ✓
```

This makes invisible sponsor infrastructure visible.

---

# 35. Three Locked WOW Moments

Do not add another major wow concept until these are excellent.

## WOW 1 — One objective

Judge taps:

# GET ME HOME

The system handles discovery, comparison, trust, and coordination.

The user's cognitive burden is minimal.

## WOW 2 — Open agent network

Show:

- ANS discovers provider capabilities
- independent agents return quotes
- Databricks evaluates
- ANS verifies selected provider
- exact location is released only after trust is established

This is the strongest combined sponsor moment.

## WOW 3 — Break the plan

Trigger provider cancellation.

The user does nothing.

Beacon:

- reevaluates
- verifies replacement
- coordinates new provider

Then:

# NEW RIDE CONFIRMED

This proves Beacon owns the task rather than merely recommending.

---

# 36. Technical Architecture

```text
                    ┌─────────────────────┐
                    │     PWA CLIENT      │
                    │   Next.js / React   │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Beacon Backend  │
                    │   Next.js Server    │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │    STUDENT AGENT    │
                    └───────┬─────┬───────┘
                            │     │
                    discover│     │context
                            ▼     ▼
                ┌──────────────┐  ┌─────────────────┐
                │ GoDaddy ANS  │  │ User Preferences│
                └──────┬───────┘  └─────────────────┘
                       │
                       ▼
          ┌─────────────────────────────┐
          │ Independent Provider Agents │
          │ Transit / Campus / Ride     │
          └─────────────┬───────────────┘
                        │ quotes
                        ▼
               ┌────────────────┐
               │ Candidate Plans│
               └───────┬────────┘
                       │
              ┌────────┴──────────┐
              ▼                   ▼
       ┌─────────────┐     ┌─────────────────┐
       │ Routing Tool│     │   DATABRICKS    │
       └─────────────┘     │ - Delta/UC      │
                           │ - SQL Warehouse  │
                           │ - Context data   │
                           │ - Recommendation │
                           │ - Decision logs  │
                           └────────┬────────┘
                                    │
                                    ▼
                           ONE RECOMMENDATION
                                    │
                                    ▼
                              USER CONFIRMS
                                    │
                                    ▼
                            ANS VERIFY / RESOLVE
                                    │
                                    ▼
                           AUTHORIZATION POLICY
                                    │
                                    ▼
                         PRECISE DATA RELEASED
                                    │
                                    ▼
                           PROVIDER COORDINATION
                                    │
                       ┌────────────┴────────────┐
                       ▼                         ▼
                    SUCCESS                  FAILURE
                       │                         │
                       ▼                         ▼
                     TRIP                    REPLAN
                                                │
                                                └──→ Databricks
```

---

# 37. Locked Technical Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- PWA manifest/service worker
- Mapbox if integration is fast

## Backend

- Next.js API routes / server handlers
- TypeScript
- one repository
- one general backend

Avoid introducing a separate FastAPI backend unless truly required.

## Data / Intelligence

- Databricks Free Edition
- Unity Catalog / Delta
- notebooks
- SQL Warehouse
- Statement Execution API
- MLflow where available
- Model Serving if useful and available

## Agent Identity

- GoDaddy ANS

## Deployment

- Vercel for PWA/backend if practical

## Notifications

- Twilio only if time permits

---

# 38. Repository Layout

```text
/apps
  /web

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
    /recommendation
    /privacy
    /authorization
    /trip-state
    /demo

  /types
    agent.ts
    trip.ts
    provider.ts
    recommendation.ts
    user.ts

/databricks
  /notebooks
    ingest_incidents.py
    ingest_gtfs.py
    build_features.py

  /sql
    route_context.sql
    recommend_trip.sql

/docs
  architecture.md
  demo-script.md
  sponsor-notes.md
```

---

# 39. Core Backend Interfaces

```ts
interface AgentDirectory {
  discover(capability: string): Promise<DiscoveredAgent[]>;
  resolve(agentHost: string): Promise<ResolvedIdentity>;
}

interface ProviderAgent {
  quote(request: QuoteRequest): Promise<CandidatePlan>;
  requestTrip(request: TripRequest): Promise<ProviderTrip>;
  getStatus(tripId: string): Promise<ProviderTripStatus>;
  cancelTrip?(tripId: string): Promise<void>;
}

interface DecisionEngine {
  recommend(
    plans: CandidatePlan[],
    context: TripContext
  ): Promise<Recommendation>;
}

interface AuthorizationPolicy {
  mayShare(
    identity: ResolvedIdentity,
    dataType: SensitiveDataType
  ): boolean;
}
```

Implementations:

```text
GoDaddy ANS → AgentDirectory
Databricks → DecisionEngine
Beacon policy → AuthorizationPolicy
```

---

# 40. Backend API Surface

## Create trip

`POST /api/trips`

Input:

```json
{
  "temporary_context": {
    "has_been_drinking": true
  }
}
```

Output:

```json
{
  "trip_id": "trip_123",
  "state": "OBJECTIVE_RECEIVED"
}
```

## Discover

`POST /api/trips/:id/discover`

Returns discovered providers.

## Evaluate

`POST /api/trips/:id/evaluate`

Input:

- candidate plans
- user preferences
- route/context features

Output:

- recommended plan
- runner-up
- explanation
- reason codes

## Confirm

`POST /api/trips/:id/confirm`

Marks user approval.

## Verify provider

`POST /api/trips/:id/verify`

Uses ANS.

## Request provider

`POST /api/trips/:id/request`

Must fail if verification/authorization prerequisites are not satisfied.

## Provider event

`POST /api/trips/:id/events`

Example:

```json
{
  "event": "provider.cancelled"
}
```

## Demo cancellation

`POST /api/demo/trips/:id/cancel-provider`

## Arrive

`POST /api/trips/:id/arrive`

---

# 41. Sensitive Data Policy

Classify data.

## Public / coarse

May be shared pre-verification:

- general transportation need
- approximate origin zone
- approximate destination zone
- budget
- broad constraints

## Sensitive

Requires verified + authorized provider:

- exact GPS
- exact address
- destination detail
- user identity
- trip ID tied to identity

## Highly restricted

Normally not shared with provider agents:

- trusted contact
- historic user trip data
- unrelated profile information

---

# 42. Security Requirements

- keep Databricks credentials server-side
- keep ANS credentials server-side
- never expose tokens to browser
- parameterize SQL
- validate provider responses
- validate all external JSON
- apply timeouts
- reject stale quotes
- log verification result
- enforce authorization after identity
- minimize precise location storage
- terminate provider data access after trip

---

# 43. Privacy Principles

1. Use precise location only during active coordination.
2. Do not store full permanent GPS history.
3. Share minimum necessary information.
4. Verification does not equal unlimited trust.
5. End temporary access at trip completion.
6. Make sensitive-data release visible in technical logs.
7. Never silently send precise location to an unverified provider.

---

# 44. Demo Mode

Mandatory.

Environment:

```text
DEMO_MODE=true
```

Demo mode should provide:

- fixed origin
- fixed destination
- fixed profile
- predictable provider quotes
- deterministic initial winner
- real backend-to-backend communication
- real Databricks evaluation
- real ANS path where possible
- cancellation control
- deterministic replacement
- arrival simulation
- reset button

World state may be simulated.

Sponsor integrations should be real.

---

# 45. Real vs Simulated

## Aim to make real

- PWA flow
- geolocation
- provider HTTP calls
- Student Agent
- provider agents
- ANS registration
- ANS discovery
- ANS resolution/verification
- sensitive-data gate
- Databricks tables
- Databricks recommendation query
- recommendation explanation
- replanning state transition
- provider replacement

## Acceptable to simulate

- campus ride availability
- independent ride ETA
- independent ride cost
- provider movement
- cancellation
- arrival
- commercial rideshare price

Clearly document simulated inputs.

---

# 46. Fallback Strategy

## Databricks unavailable

Fallback:

- local deterministic ranking
- hide historical-context claim
- show:
  - `Advanced context temporarily unavailable`

Do not block the user.

## ANS unavailable

Do not share sensitive information with newly discovered agents.

Use only:

- locally pretrusted demo provider
- non-sensitive recommendations

## Transit feed unavailable

Remove transit from ranking.

Never invent bus timing.

## Weather unavailable

Continue without weather.

## Incident context unavailable

Continue without incident exposure.

## Provider unavailable

Automatically replan.

## SMS unavailable

Do not block core trip flow.

---

# 47. Technical Observability

Log:

- trip state transitions
- provider discovery
- provider quote latency
- Databricks query latency
- selected plan
- recommendation reason
- ANS resolution result
- authorization result
- sensitive-data release event
- provider request
- provider failure
- replan count

Optional:

- MLflow tracing

Do not build an admin dashboard before the demo works.

---

# 48. Databricks Technical Judge View

If feasible, show:

```text
GET_HOME
  ├─ load_preferences
  ├─ discover_agents
  ├─ collect_quotes
  ├─ route_context
  ├─ candidate_normalization
  ├─ Databricks recommendation
  │   ├─ selected campus_ride
  │   └─ reason LOW_WALKING
  ├─ ANS resolve
  ├─ authorization check
  ├─ precise-location release
  └─ provider accepted
```

This can be:

- a custom timeline in the app
- actual MLflow trace if available
- both

The app timeline is P0/P1.

MLflow is P1.

---

# 49. Sponsor-Specific Architecture Proof

## GoDaddy proof

A judge must visibly see:

1. agent capability discovery
2. selected provider had not been statically trusted
3. ANS resolves/verifies identity
4. exact pickup is withheld before verification
5. exact pickup is released after verification
6. provider coordinates the trip

Optional:

7. unverified provider request is blocked

## Databricks proof

A judge must visibly see:

1. real data in Databricks
2. candidate plans passed to Databricks
3. recommendation changes because of data/preferences
4. explanation/reason codes
5. re-evaluation after provider failure

---

# 50. Deloitte Rubric Mapping

## Originality / creativity

Beacon is not another trip planner.

The novelty is delegated coordination across independent agents.

## Realism

Recommendations use:

- real route data
- real/scheduled transit where available
- real public historical context
- explicit user preferences
- structured deterministic scoring

## Databricks usage

Databricks owns:

- data
- context
- decision logic
- re-evaluation
- decision history

## Deloitte strategy angle

Beacon transforms disconnected campus services into a frictionless student experience.

## Student impact

It reduces:

- decisions
- app switching
- coordination burden
- recovery burden after failures

## Technical execution

Demonstrated through:

- multi-agent communication
- dynamic discovery
- identity resolution
- data processing
- stateful recovery

## Scalability

New providers use a common contract.

New campuses use:

- same Student Agent
- same provider contract
- campus-specific data

## Roadmap

Defined below.

---

# 51. Product KPIs

For sponsor/consulting framing:

- median time from `GET ME HOME` to confirmed plan
- number of required user decisions
- provider quote latency
- recommendation acceptance rate
- average walking reduction
- provider failure recovery rate
- recovery time after cancellation
- percentage of sensitive provider interactions ANS-verified
- time required to onboard a new provider agent
- recommendation explanation coverage

---

# 52. Deployment Roadmap

## Phase 1 — Hackathon

Virginia Tech / Blacksburg proof of concept.

## Phase 2 — Campus Pilot

Integrate:

- official campus transportation
- real-time feeds
- native notification/background behavior
- approved data retention policy

## Phase 3 — Provider Ecosystem

Allow approved external providers to:

- register ANS agent
- advertise capabilities
- expose standard trip functions

## Phase 4 — Multi-Campus

Reuse:

- Student Agent
- provider contract
- identity/trust layer

Swap:

- campus datasets
- local transit
- campus services

---

# 53. 90-Second Demo Script

## 0:00 — Problem

> “It’s late after an event. I’m exhausted or impaired, my original plan fell through, and I just want to get home. The last thing I need is five apps and ten decisions.”

Tap:

# GET ME HOME

## 0:10 — Discovery

Technical panel shows:

```text
ANS
Searching transportation capabilities...
```

Three provider agents appear.

## 0:25 — Databricks

> “Databricks combines the provider offers with my budget, walking preference, route context, and current campus data.”

Recommendation appears.

## 0:40 — Confirmation

Tap:

**GO**

## 0:45 — ANS

> “Before Beacon sends a provider something as sensitive as my exact location, GoDaddy ANS resolves and verifies who actually operates that agent.”

Show:

```text
Identity verified ✓
Precise pickup released
```

Provider accepts.

## 0:58 — Break it

Trigger:

# PROVIDER CANCELLED

Do not touch app.

## 1:02 — Recovery

Show:

```text
Replanning...
Databricks reevaluating...
Replacement selected...
ANS verifying...
```

## 1:15

# NEW RIDE CONFIRMED

## 1:22 — Close

> “The student chooses the outcome. Databricks provides the intelligence, GoDaddy ANS provides the trust, and Beacon handles the coordination.”

---

# 54. Longer Sponsor Demo

If sponsor judges give more time, add:

## GoDaddy deep dive

Show:

- ANS discovery query
- agent functions
- pre-verification coarse request
- precise data gate
- verified provider
- optional unverified-agent rejection

## Databricks deep dive

Show:

- `incidents`
- `transit_stop_times`
- provider data
- candidate plans
- recommendation SQL/notebook
- selected reason codes
- replanning
- optional MLflow trace

---

# 55. Judge Q&A

## Why not Google Maps?

Google Maps gives routes.

Beacon owns the objective across independent services, establishes trust, coordinates providers, and recovers automatically when the first plan fails.

## Why not Uber?

Uber can absolutely be the right ride. Beacon handles the decision and handoffs around that ride: whether it is the best available option, how much solo walking or outdoor waiting it requires, where and when to meet it when those details are known, and what to do if it is delayed or cancels. The agent keeps working toward arrival instead of sending a tired student back through several apps. The hackathon demo does not claim a live Uber integration; commercial rides are a future integration or clearly labeled handoff.

## Why does this need agents?

The providers are independently operated, expose changing capabilities/availability, and need to coordinate autonomously without forcing the user to act as the integration layer.

## Why GoDaddy ANS?

Without ANS, an open provider ecosystem either requires hard-coded private trust relationships or blindly trusts endpoints claiming to be providers.

ANS provides discoverable, verifiable agent identity.

## Why Databricks?

Databricks turns fragmented campus, route, provider, and user context into one explainable recommendation and performs the same decision process again when conditions change.

## Are you predicting safety/crime?

No.

Historical incidents are only contextual evidence.

Beacon does not claim a route is objectively safe or predict whether someone will be harmed.

## Does the app know if someone is drunk?

No.

A user can provide that context themselves.

Beacon does not infer or diagnose intoxication.

## Why one recommendation?

The product exists to reduce cognitive burden.

The system evaluates complexity internally and gives the user one actionable choice.

## What happens if the provider cancels?

The Student Agent retains the objective, reevaluates remaining providers through Databricks, verifies the replacement through ANS, and coordinates it automatically.

## What if ANS is down?

Beacon does not release sensitive information to newly discovered unverified providers.

## How does this scale?

Providers implement the common agent contract and register capabilities/identity.

The same Student Agent can operate at other campuses using local data.

---

# 56. MVP Definition

The hackathon MVP is successful when all of this works:

- mobile-first PWA
- one-time saved home
- saved budget
- saved walking preference
- GET ME HOME
- optional temporary context
- walking candidate
- at least two independently callable provider agents
- provider discovery
- normalized candidate plans
- Databricks-backed recommendation
- one selected plan
- explanation/reason codes
- user confirmation
- real ANS verification/resolution path
- sensitive-data gate
- provider trip request
- provider acceptance
- provider cancellation
- automatic replanning
- replacement provider verification
- replacement acceptance
- arrival state
- technical/judge view

---

# 57. P0 / P1 / P2 Priorities

## P0 — Must Work

1. GET ME HOME
2. provider agents respond
3. candidate normalization
4. Databricks recommendation
5. one plan shown
6. GO
7. ANS verify selected provider
8. precise data gate
9. provider accepts
10. provider cancellation
11. automatic replan
12. ANS verify replacement
13. replacement accepts
14. arrival
15. judge technical panel

## P1 — Strong Adds

- real GTFS
- historical incident context
- MLflow tracing
- map polish
- trusted contact
- real geolocation
- provider reliability
- unverified-agent rejection demo

## P2 — Stretch

- weather
- Uber deep link
- voice input
- push notification
- richer provider ecosystem
- real-time transit
- native background tracking
- commercial provider adapters

---

# 58. Explicit Non-Goals

Do not spend hackathon time on:

- direct Uber payments
- Lyft integration
- driver marketplace
- custom payment system
- full turn-by-turn engine
- native iOS + Android
- predictive crime ML
- automatic 911 calls
- police dispatch
- dozens of agents
- long trip history
- custom auth system
- social graph
- admin dashboard
- complex personalization ML
- full production compliance
- full real-time background tracking

---

# 59. Team Split

## Developer A — Product / PWA / Demo

Own:

- onboarding
- Home
- GET ME HOME
- activity screen
- recommendation
- GO
- trip UI
- map
- cancellation animation
- recovery UI
- arrival
- judge technical panel
- demo/reset controls

First milestone:

> Complete UI flow works with mocked typed JSON.

## Developer B — Agents / GoDaddy ANS

Own:

- Student Agent
- provider contract
- Transit Agent
- Campus Ride Agent
- Independent Ride Agent
- ANS registration
- discovery
- identity resolution
- authorization gate
- provider coordination
- cancellation events

First milestone:

> Two agents communicate and one real ANS-registered provider can be discovered/resolved.

## Developer C — Databricks / Data

Own:

- Free Edition setup
- Databricks AI Dev Kit
- catalog/schema
- provider/context tables
- GTFS ingestion
- incident ingestion
- recommendation query
- reason codes
- replanning decision
- optional MLflow

First milestone:

> Given three CandidatePlans, Databricks returns the expected winner and explanation.

---

# 60. Build Order

## Phase 0 — Sponsor Setup

Immediately:

- complete Deloitte participation agreement
- create Databricks Free Edition environment
- install Databricks AI Dev Kit
- obtain ANS credentials
- start provider registration/domain validation
- obtain map credentials
- verify deployment

## Phase 1 — Vertical Slice

Use mocks.

Build:

```text
GET ME HOME
→ provider cards
→ recommendation
→ GO
→ provider accepted
→ arrival
```

No polish.

## Phase 2 — Real Agent Services

Replace static provider objects with actual HTTP services/routes.

## Phase 3 — Databricks

Replace local ranking with Databricks-backed evaluation.

## Phase 4 — ANS

Replace mock discovery/verification with real ANS integration.

## Phase 5 — Recovery

Add:

```text
provider cancelled
→ replan
→ replace
```

At this point the project is competitive.

## Phase 6 — Data Depth

Add:

- GTFS
- historical context
- provider reliability

## Phase 7 — Polish

Add:

- map polish
- animations
- judge technical view
- optional contact
- pitch assets

---

# 61. Build Checkpoints

## Checkpoint A

Can we demo:

```text
GET ME HOME → recommendation
```

## Checkpoint B

Can we demo:

```text
GET ME HOME → provider agent calls → recommendation
```

## Checkpoint C

Can we demo:

```text
Databricks makes the decision
```

## Checkpoint D

Can we demo:

```text
ANS verifies selected provider
```

## Checkpoint E

Can we demo:

```text
provider cancellation → automatic replacement
```

Once E works:

> **stop adding risky features**

---

# 62. Hackathon Operating Rules

1. Talk to GoDaddy reps early.
2. Ask whether the discovery + sensitive-data gating demonstrates the ANS behavior they care about.
3. Talk to Databricks/Deloitte reps early.
4. Show them your intended recommendation architecture.
5. Ask whether there is a platform feature they specifically want participants to use.
6. Build the vertical demo path first.
7. Keep branches small.
8. Integrate continuously.
9. Do not let one teammate disappear for ten hours building an isolated subsystem.
10. Use demo mode.
11. Cache critical external results.
12. Seed deterministic provider responses.
13. Ask repeatedly:
   - can we demo right now?
14. Freeze risky features late.
15. Practice the pitch repeatedly.
16. Optimize for visible sponsor value, not feature count.
17. If a feature does not strengthen:
   - discovery
   - decision
   - trust
   - coordination
   - recovery
   then cut it.

---

# 63. Demo Reliability Checklist

Before judging:

- production URL works
- demo-reset button works
- demo origin works
- demo destination works
- provider agents respond
- Databricks query returns
- ANS verification returns
- initial winner is deterministic
- cancellation control works
- second winner is deterministic
- arrival simulation works
- app can recover from page refresh where possible
- environment variables verified
- backup hotspot available
- screenshots/video backup available
- cached data available
- Devpost links work

---

# 64. Pitch Structure

## Hook

> “It’s late after a night out. You’re exhausted or impaired, your original ride falls through, and all you want is to get home. The last thing you need is five apps and ten decisions.”

## Product

> “Beacon gives a personal agent the outcome instead of making the student coordinate the process.”

## Databricks

> “Databricks combines transportation offers, campus context, route data, and the user’s preferences to choose one actionable plan—and reevaluates when reality changes.”

## GoDaddy

> “Because Beacon coordinates with independent agents it may never have seen before, GoDaddy ANS lets us discover and verify who operates them before something as sensitive as precise location is shared.”

## Close

> **“The student chooses the outcome. Beacon handles the coordination.”**

---

# 65. Sponsor Pitch — Deloitte × Databricks

> **Beacon connects fragmented campus mobility services into one intelligent student experience. Databricks combines provider availability, transit information, route context, historical public data, and the student's own constraints to produce one actionable recommendation. When conditions change, Databricks reevaluates automatically, allowing the agent to continue owning the student's objective instead of sending them back to the beginning.**

---

# 66. Sponsor Pitch — GoDaddy ANS

> **Beacon is designed for an open ecosystem where universities and independent transportation providers can run their own agents. A student's agent can dynamically discover those capabilities, but before it gives an unfamiliar provider precise location or trip information, GoDaddy ANS establishes who operates that agent. Beacon then applies its own authorization policy and only releases the minimum data needed to complete the trip.**

---

# 67. Final Product Pitch

> **Beacon is a personal campus mobility agent for moments when students don't have the attention or capacity to coordinate getting home themselves. With one request, Beacon discovers available transportation agents, uses Databricks to determine the best option under the student's constraints and campus context, uses GoDaddy ANS to verify an unfamiliar provider before sensitive information is released, coordinates the trip, and automatically finds another plan if the original one fails.**

Short version:

> **Get me home. Beacon handles the rest.**

---

# 68. Pivot Framework

The product should remain flexible without losing its core architecture.

## Core invariant

Never pivot away from:

```text
objective
→ discover
→ evaluate
→ verify
→ coordinate
→ recover
```

If that sequence survives, the project still fits both sponsors.

## Pivot A — Transit data is weak

Keep:

- provider agents
- Databricks ranking
- ANS
- recovery

Replace real transit with seeded scheduled transit data.

## Pivot B — Incident data is too messy

Drop historical exposure.

Use:

- walking time
- transfers
- weather
- provider availability
- user context
- reliability

The product still works.

## Pivot C — ANS registry search is difficult

Keep one genuinely registered/resolved provider.

Use a local provider directory for additional demo agents.

Continue to use real ANS identity verification for sensitive data.

Be transparent.

## Pivot D — Databricks Model Serving unavailable

Use:

- SQL Warehouse
- Statement Execution API
- notebook/SQL recommendation logic

Do not block the project.

## Pivot E — Agent Bricks/Supervisor unavailable

Use the custom Student Agent in your Next.js backend.

Databricks remains the data/decision engine.

## Pivot F — Mapping integration becomes expensive

Use a simple route polyline/static map.

Do not rebuild navigation.

## Pivot G — Time collapses

Preserve only:

```text
GET ME HOME
→ 2 provider agents
→ Databricks chooses
→ ANS verifies
→ provider accepts
→ cancellation
→ automatic replacement
```

That is the irreducible winning demo.

---

# 69. Open Implementation Checks

These are not product holes; they are setup checks.

## GoDaddy ANS

Verify:

- credentials
- provider registration flow
- domain validation
- registry search
- resolution
- time required for registration to become usable
- exact API response shapes

## Databricks

Verify:

- workspace URL
- authentication method
- SQL warehouse ID
- Unity Catalog availability
- MLflow availability
- Statement Execution API
- Model Serving availability
- Agent/Supervisor availability if any

## Transit

Verify:

- GTFS feed quality
- relevant service schedule
- how much can be parsed quickly

## Incident data

Verify:

- geocodable locations
- usable date/time fields
- subset size

---

# 70. Definition of Done

Beacon is ready for judging when a judge can understand all of the following without needing a whiteboard:

1. What problem the student has.
2. Why one recommendation is better than a comparison table.
3. Why the project needs agents.
4. How independent provider agents are discovered.
5. What Databricks does.
6. What ANS does.
7. Why exact location is not shared before verification.
8. How the provider is coordinated.
9. How the system handles a provider failure.
10. Why the project is not just Google Maps or Uber.

The demo must visibly prove:

- multiple agents independently respond
- Databricks makes an actual decision
- ANS verifies an unfamiliar provider
- sensitive information is gated
- the provider accepts a trip
- the plan can fail
- Beacon autonomously recovers

---

# 71. Final Priority Rule

Whenever the team considers adding something, ask:

> **Does this make the GET ME HOME → VERIFIED PLAN → COORDINATED TRIP → AUTOMATIC RECOVERY flow more convincing?**

If the answer is no:

> **do not build it during the hackathon**

The final app should feel simple because the engineering underneath it is sophisticated.

---

# 72. One-Sentence North Star

> **Beacon should make the user feel like they only had to decide one thing—“I want to be home”—while the judges can clearly see the agent orchestration, Databricks intelligence, ANS trust, and failure recovery happening underneath.**
