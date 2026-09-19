# Complete-journey data handoff — September 19, 2026

This additive server interface implements Beacon's data-side journey generation and decision work. It does not replace Mahin's coordinator, booking protocol or existing Trip API. Rishit renders its ordered legs through Mahin's authenticated API. The existing `CandidatePlan`, `Recommendation`, `Trip`, API paths and `beacon-v2` policy are unchanged.

**Completion boundary:** implementation and local verification are available; a complete live journey is blocked by approved walking-routing configuration. Refreshed cloud imports, any job changes and journey audit writes require separate explicit approval. Existing Databricks resources were verified read-only. No new service, cloud mutation, deployment, push or merge was performed.

## Call from Mahin's server

```ts
import { getCompleteJourney } from '@/lib/decision-client/server';
import type { JourneyRequest } from '@/lib/decision-client/journey-types';

const result = await getCompleteJourney(request satisfies JourneyRequest);
// result.selected: one Journey or null
// result.alternatives: at most three additional feasible Journeys
// result.execution: actual SQL/fallback and audit status
```

The full executable example input and output are in [examples/journey-fixture.json](examples/journey-fixture.json). These are dated **fixtures**, with simulated ride offers, no booking, and local fallback. Fixture geometry is never a navigation instruction for a real student. Regenerate from the repository root:

```sh
node databricks/journey-smoke.mjs --output /tmp/journey-example.json
```

`planJourney(request, dependencies)` in `src/lib/decision-client/journey-planner.ts` is the dependency-injected core used by tests and read-only service checks. `getCompleteJourney` loads the existing public stops/waiting records, configured Google walking router, exact-path evidence, native direct-transit query and journey ranking query. Missing routing produces `ROUTING_CONFIGURATION_MISSING` rejection, never a fixture fallback. A co-located ride can still be evaluated without walking if its pickup is provider-confirmed.

## Request semantics

All input is reviewed server-side data. Do not accept raw browser assertions of provider admission, pickup permission or access. Precise locations sent to a routing provider require the approved routing integration; precise provider disclosure remains behind Mahin's identity, authorization and consent gates.

| Field | Meaning |
| --- | --- |
| `objectiveVersion` | Nonnegative integer; Mahin increments it on cancellation/replanning. |
| `origin`, `destination` | `{id, name, point:{lat,lng}}`; current location and confirmed home. Supported box: 37.205–37.245 latitude, -80.44–-80.395 longitude. |
| `evaluatedAt` | Timezone-qualified current instant. No local clock strings. |
| `budgetMinor` | Approved total budget, integer USD cents. |
| `committedMinor` | Deduplicated outstanding charges, holds and cancellation fees. Pending refunds do not restore funds. |
| `remainingBudgetMinor` | Optional additional cap on remaining available funds. Available = min(cap, max(0, budget − committed)); the same liability is not subtracted again from the cap. |
| `cannotWalk`, `maxWalkingMinutes` | Hard constraints across **all** walking legs. Zero walking requires identical endpoints; no short-distance tolerance silently permits a walk. |
| `minimizeWalking`, `tired` | Increase the deterministic walking burden weight. No inference of impairment. |
| `currentWaitingPlace` | Optional dated access/shelter/hours evidence at exactly the current point. Unknown entry stays conditional; denied/closed/stale interiors are not used. |
| `waitingPlaces` | Up to three reviewed alternatives; default is the existing published campus places. Automatic relocation requires supported access/shelter and at least two minutes of useful waiting after actual access walks. Unknown access alone never causes relocation. |
| `rides` | Up to eight `JourneyRide` records containing admitted `NetworkOffer`, exact pickup/drop-off, absolute pickup/arrival times and `pickupPermitted`. |
| `excludedServices` | Failed `{operatorId,serviceId}` pairs. Only the failed pair is excluded. |

`pickupAt` must agree within one second with `offer.issuedAt + offer.waitMinutes`; `arrivalAt − pickupAt` must match quoted travel time. Missing/unconfirmed pickup feasibility excludes the ride. `NetworkOffer` admission validates availability, issuance/expiry, source, compatible service/auth/payment support and all-fee fixed USD price or binding maximum cap. Duplicate quote identities are rejected so a quote cannot acquire two conflicting location bindings. Caller-added grants, contacts and arbitrary offer metadata are not copied into the result.

Current public building records contain reference points and published hours, **not verified entrances, admission or curb pickup permission**. Mahin must not map `accessVerified:false` to `pickupPermitted:true`. Unknown current-location access yields “check access before entering”; it does not claim indoor waiting. Existing PR #23 was inspected remotely: `beacon-mobility-v2` fixture offers have pickup instruction text and `accessVerified:false`, but no exact confirmed pickup/drop-off coordinates. A provider/authorized coordinator location-bound sidecar is still needed to call `JourneyRide` honestly. The example's permission is explicitly simulated.

## Output for Rishit

`journeyVersion = beacon-journey-v1`; `policyVersion = beacon-journey-rank-v1`.

Each selected/alternative journey includes:

- Ordered `walk`, `wait`, `ride` or `bus` legs with exact start/end instants and location continuity.
- Walking leg `route`: the exact evaluated provider GeoJSON, distance, duration and instructions. Other legs have `route:null`; no vehicle geometry is invented.
- `nextStep`: current first leg ID/instruction, `showMap` only for a walking leg, and the same route ID. Mahin advances to subsequent legs using live trip state; data code creates no second coordinator.
- `leaveWaitingAt`, arrival/departure, planning expiry, total cost, total walking/waiting, known outdoor waiting and waiting with unknown shelter.
- `offerBinding`: operator/service/quote/version, source, expiry, price kind and maximum cost. `offerLocationBinding` retains the exact pickup/drop-off/times locally.
- Exact-path/point evidence with source version, capture/observation time, matching method, confidence and unknowns. Transport legs carry pickup/drop-off evidence; buses retain the actual native transit source record and statement ID.
- Rejection codes, explanation facts, feasibility state and objective version.

Geometry can end within the routing provider's validated 20-meter snap of a requested reference point; the provider line is preserved, and Beacon does not synthesize an entrance connector. Reference/entrance accessibility remains unknown. Do not replace the line with an illustrative map or external maps route while claiming synchronization. An external maps link is an optional independent handoff.

A recommendation is valid only until `validUntil`. Check it and objective version before starting an instruction or booking. Replanning takes the updated location/time, full current liabilities, failed service pairs and freshly quoted replacement offers. It returns a new journey; it does not cancel, reconcile or authorize bookings. Arrival detection/contact alerts remain Mahin's work.

## Timing and ranking policy

Walk home uses a real configured routing service, or fails explicitly. Direct buses consider the two nearest public origin stops and two nearest destination stops inside the supported area. Straight-line proximity only bounds the stop search; actual walking routes determine reachability. This bounded POC does not search every stop or any transfers. Native queries return eligible same-trip scheduled departures; there is no live vehicle arrival claim.

Buses reserve a 60-second boarding buffer. Rides reserve a 30-second pickup buffer. Waiting starts at the current location where feasible, or at a specifically justified sheltered alternative. Leave time is the latest reachable departure, reduced to one second before published closure/expiry when necessary. Earlier closing can produce a subsequent outdoor/unknown wait at pickup. Access, pickup and final walk durations are all included. Future evidence intervals are checked at leg starts, ends and intermediate validity boundaries, so a closure beginning during a later walk/wait rejects that combination.

Journey ranking uses integer features, independently validated against native SQL:

```text
score = durationSeconds
      + walkingSeconds × (5 when tired/minimizeWalking, otherwise 2)
      + knownOutdoorWaitingSeconds × 2
      + unknownShelterWaitingSeconds
      + costMinor
      + (non-wait leg count − 1) × 60
```

Round duration features upward to whole seconds. Sort by score, then arrival instant, then hashed journey ID. Lower wins. Unknown shelter receives a documented conservative exposure weight; missing crime reports or lamp observations receive **no penalty**. Known indoor/sheltered waiting has no additional exposure term. Fresh severe weather/official alerts and geometric closures are conservative feasibility exclusions; weather/lighting/crime provenance remains visible. Historical crime is contextual reporting, never a harm probability or safety percentage.

Hard budget, walking, timing, source and pickup constraints run before ranking. No LLM can override them. The existing optional grounded AI and `beacon-v2` APIs remain available through their existing interface, but the new planner does not invoke an LLM or add another agent.

## Databricks execution, privacy and audits

Native journey SQL reuses the existing Statement Execution client/warehouse. It sends only hashed journey IDs, absolute arrival time, numeric duration/exposure/cost/complexity features and weight. No student point, geometry, name, provider display name, contact or grant enters SQL. Every returned ID, score, cardinality and ordering must match local calculation. Missing configuration, timeout, malformed/reversed results or transport failure returns labeled `local_fallback` with `fallbackReason`.

Audit is read-only by default (`DISABLED_READ_ONLY`). After explicit approval, `BEACON_JOURNEY_AUDIT_WRITES=true` enables sanitized writes to existing `DATABRICKS_AUDIT_TABLE`. No new table is required. Failures report `WRITE_FAILED` without suppressing a valid journey. Expiry is checked after SQL and audit; an expired selection is removed. If an opted-in audit recorded a selection superseded by that final expiry check, status is `PERSISTED_SUPERSEDED_SELECTION` and warning `AUDIT_PRECEDES_FINAL_EXPIRY_FILTER`; never describe that record as the final returned selection. No new audit writes were performed in this task.

## Configuration and real verification

Existing configured workspace: `https://dbc-6b71bd46-0c51.cloud.databricks.com`, selected OAuth profile `beacon`, warehouse `586a1b427679f515`. Existing `DATABRICKS_*` values select runtime SQL tables; the app needs its existing server token injection or approved hosted credentials. CLI OAuth alone is not an automatically configured deployed app.

Missing live routing setup:

```sh
BEACON_WALKING_ROUTER=google_routes
GOOGLE_ROUTES_API_KEY=<approved server-side key>
```

No key was found or service provisioned. Google Routes was discussed, not approved for spending. An already approved account/key plus permission to make routing requests is the smallest action needed. Do not put secrets in Git or client environment variables.

Read-only live-check command (existing local environment, no audit writes):

```sh
node --env-file=/Users/aksharkakkad/VTHacks/.env.local \
  databricks/journey-smoke.mjs --live-db --output /tmp/journey-live-db.json
# Add --live-routing only after the approved routing variables are configured.
```

Actual read-only verification at **2026-09-19 22:16 UTC**:

| Check | Actual evidence |
| --- | --- |
| SQL reachability | `01f1b477-aceb-1d0a-afba-b330524b546d`, returned 1. |
| Unity Catalog tables | `01f1b477-b4f9-1538-8559-04fbba79327a`, 20 relevant existing Delta tables including decision, evidence and all full-transit tables. |
| Transit import | `01f1b477-b732-1f55-a027-26c47fe35717`, original source hash `aed7634f…`, captured September 19 17:00 UTC, service September 19–October 2. |
| Audit table read | `01f1b477-bcd0-1707-85a3-8b3b1135d1a9`, 51 existing rows; no new write. |
| Journey ranking | `01f1b477-c7a2-16c6-aa8c-22f4fcd153a3`, validated native query selected simulated ride, with fixture walking alternative. |
| Four direct-bus queries | No eligible departure for the tested nearby stop pairs; correctly omitted buses. This does not claim a live bus ride. |
| Walking service / complete live journey | **Blocked**, no approved routing key. Fixture run is not live routing. |

See [JOURNEY_REFRESH.md](JOURNEY_REFRESH.md) for actual public-source refreshes, current/expired states, staged import commands and existing finite job verification. September 19 waiting hours were re-reviewed in the official rendered browser tables and imported locally; the earlier manual-review blocker is resolved for that date. The original combined-vision completion record predates this complete-journey request and is not evidence that these new live gates passed.

## Verification commands and owner wiring

```sh
node databricks/run.mjs test
node --test databricks/*.test.mjs
bash src/agents/test.sh
bash scripts/pre-pr.sh
# Existing Python with pdfplumber:
/path/to/python -m unittest discover -s databricks/ingest -p 'test_*.py'
/path/to/python -m unittest discover -s databricks/jobs -p 'test_*.py'
```

Mahin: map admitted offers and supported exact pickup timing/locations to this additive input; enforce authentication, location disclosure, consent, quote revalidation, reconciliation and booking; attach this result behind the existing owned API; progress legs and supply updated inputs on cancellation. Rishit: render `selected.nextStep`, map only a walk's exact geometry, display simulation/schedule/unknown labels, and place up to three alternatives behind the secondary action. Neither API/UI wiring nor deployment was silently changed by this data task.
