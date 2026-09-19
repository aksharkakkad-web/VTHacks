# Complete-journey coordinator integration

The Student Agent selects complete journeys for trips created with
`journeyContract: "beacon-journey-v1"` when its server runtime supplies
`getCompleteJourney`. The existing endpoints and `Trip` fields remain compatible;
callers without this opt-in keep the legacy evaluator. Explicit hard walking
constraints also opt into this contract; missing planner configuration fails
closed instead of ignoring the constraint. This is a local backend
integration, not proof of live routing, commercial booking access or deployment.

## Runtime contract

`Dependencies` accepts two additional server-only functions:

```ts
getCompleteJourney(request: JourneyRequest): Promise<JourneyResult>;
journeyRideBinding?(network: NetworkOffer): Promise<JourneyRideBinding | null>;
```

`NetworkOffer` above is the admitted `src/agents/provider-manifest.ts` envelope.
`JourneyRideBinding`, exported by `src/agents/student/journey-coordinator.ts`, is
`{pickup, dropoff, pickupAt, arrivalAt, pickupPermitted}`. Pickup and dropoff use
the planner's `JourneyPlace` shape. The hook receives only the coarse quote;
it receives no passenger location, contact, consent or credentials. An absent,
failed or null binding excludes the ride from complete-journey planning.

The binding must come from an authoritative provider/authorized coordinator
sidecar, or an explicitly enabled and labeled simulation. Provider instructions,
published building reference points, and `accessVerified: false` establish no
pickup permission. Permission for a simulated curb pickup does not establish
indoor access. The implemented network envelope currently admits simulated
transport/payment; adding a live commercial provider remains a separate contract
and authorization integration.

The coordinator preserves offer identity/version, source, maximum price and exact
pickup/dropoff/times when adapting the selected journey back to its original
bookable candidate. Booking rechecks journey revision, quote expiry, unchanged
planning origin, network terms, identity and authorization, then sends the exact
evaluated pickup and dropoff. It does not substitute the student's home for an
evaluated dropoff or silently reroute after confirmation.

## Atomic owner response

`GET /api/trips/:id/journey` includes `journey.complete`, the planner's selected
journey, alternatives, exact walking routes, ordered legs, evidence, unknowns,
rejections and actual execution provenance. `journey.legs` remains the compact
compatible projection; vehicle/transit legs never acquire walking geometry.
`journey.nextStep` is the current server-owned instruction. The original planner
`complete.selected.nextStep` describes the original evaluation, not live progress.

Confirmation includes the atomic `journeyRevision`, selected `planId`, and the
`quoteId` when a network offer is selected. Expired or changed revisions cannot
authorize booking. `selectionCurrent` must be checked before presenting a new
confirmation. A no-feasible result clears the previous selection and retains the
planner's rejection evidence. Arrival clears the complete-journey sidecar,
precise routes, endpoints and location alongside existing private data cleanup.

The existing `decision.evaluate` activity boundary records paired request and
response/rejection events for complete planning too. Response execution reflects
the planner's actual `databricks` or `local_fallback` result; activity contains
only bounded candidate counts and engine labels, never route coordinates or raw
errors.

Wait deadlines can advance the instruction to its next planned step. Provider
`in_trip`/`completed` observations advance the ride leg. Walking and scheduled-bus
legs require a fresh location whose uncertainty circle is within 30 meters of
the leg endpoint; a timetable or timer never proves boarding. This progression
does not mark home arrival: the existing stricter dwell policy/manual arrival
remains authoritative. Missing location can leave a movement instruction pending.

## Recovery and monitoring

Replanning passes the latest fresh location, current time, incremented objective
version, original total budget, full committed liabilities, remaining budget cap
and exact failed service pairs into the planner. Retained fees and authorizations
are counted once; pending refunds do not replenish the budget. Complete-journey
replacements await fresh confirmation. Uncertain bookings and settlements retain
the existing reconciliation gate.

The monitor processes deadline checks and outcome flushing after a provider
reports completion. Completion does not mean the student is home. Regressive
provider stages cannot reverse trip progression or release completed payment
liability. Tests use simulated notification callbacks and no real contact sends.

## Local verification

`src/agents/journey-coordinator.test.ts` drives the actual Student Agent and
deterministic complete-journey planner with injected route/transit/provider
fixtures: walk, direct bus, admitted ride, missing binding, revision and expiry,
retained-fee recovery from an updated location, completion/overdue/arrival,
regressive callbacks, bound-location mutation, and hard walking constraints.

Run `bash src/agents/test.sh` for the complete backend suite. Fixtures establish
local behavior only; real Google routing and Uber sandbox access require their
separate approved configuration and verification.
