# Decision integration contract

Server/API code imports `evaluateTrip` and `getScheduledTransitOption` from `./server`.
Pure tests/previews import `evaluateCandidates` from `./decision` (no credentials).
The server module is marked `server-only`; never pass a Databricks token to a Client Component.

```ts
import { evaluateTrip, getScheduledTransitOption } from "@/lib/decision-client/server";

// Optional: a real scheduled option from the imported GTFS table, not a live vehicle prediction.
const scheduled = await getScheduledTransitOption({
  corridorId: "newman-pritchard", evaluatedAt: new Date().toISOString(),
  accessWalkingMinutes: 2, egressWalkingMinutes: 1,
}); // Walking estimates must come from the itinerary; these numbers are demo assumptions.
if (scheduled) {
  candidates.push(scheduled.candidate);
  signals[scheduled.candidate.planId] = scheduled.signals;
}
const result = await evaluateTrip(candidates, {
  maxBudget: 10, minimizeWalking: true,
  objectiveVersion: tripObjectiveVersion,
  excludedProviderIds: canceledProviderIds,
}, signals);
if (result.status === "RECOMMENDED") {
  // Only apply if objectiveVersion is still current. Recheck quote expiry before booking.
  // This result does NOT verify the provider or authorize releasing precise location.
  useRecommendation(result.recommendation);
}
```

`RECOMMENDED`, `NO_FEASIBLE_PLAN`, and `EMERGENCY` are explicit result states.
Invalid request-level inputs throw before any network request; map to the API's invalid-input response.
Malformed individual quotes are rejected while valid alternatives remain eligible. Up to 16 plans;
money uses dollars with at most two decimals. An empty list is valid.

`maxWalkingMinutes` is a hard limit. `minimizeWalking` is a preference.
`priority: "lowest_cost"` chooses the cheapest eligible option with score-based tie breaks;
`less_exposed` means a stronger walking preference, **not a crime-risk model**.
`leastWalkingPlanId` and `cheapestPlanId` are separate factual alternatives.
`lessExposedPlanId` remains a compatibility alias for least walking.

The default `beacon-v2` policy uses integer score units (divide by 6000 for weighted minutes).
It adds a 1.5 rain multiplier to walking and 3 weighted minutes per verified-unlit walking minute.
`beacon-v1` retains the original scoring coefficients without those two additions.
Historical incident counts are context only. Unknown lighting is not treated as verified lit.
Known walking closures and severe weather for walk-only options exclude affected choices.
The score is a transparent convenience tradeoff, never a safety probability or guarantee.

## Evidence and failures

Each plan can have a `PlanSignals` sidecar. Label fixtures `source: "simulated"` explicitly.
Live quotes require `collectedAt` and `validUntil`; effective freshness is at most 120 seconds.
Scheduled transit requires current `validUntil`, `serviceAvailable: true`, `transfersKnown: true`,
and a numeric candidate transfer count. Observed reliability requires a snapshot timestamp no
older than 24 hours. Otherwise reliability is neutral 0.5; provider claims are not observations.

The success envelope includes source labels, score components, selected plan, rejected reasons,
objective/evaluation identifiers, statement ID when available, and audit status.
Unknown source remains visibly unknown; never relabel it live merely because SQL ran.

`engine: "databricks"` requires a complete, validated SQL result with matching integer scores,
eligibility, and first-ranked winner. Missing credentials, timeout, incomplete results, or
invalid output use `local_fallback` with a reason and visible warning. A rejected/expired
choice is not resurrected. Emergency bypasses database calls and contacts nobody.

Evaluation has a 10-second budget including best-effort cancellation; optional audit has a
separate 8-second budget (tuned after live Free Edition writes exceeded 2 seconds).
Audit failure warns but does not destroy a valid choice. Persisted
JSON is allowlisted and excludes names, raw free text, exact coordinates, contacts, and secrets.
Use opaque non-personal IDs. A statement trace/audit is not proof that a booking happened.

## Server configuration

- Required for SQL: `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_WAREHOUSE_ID`.
- Optional managed enrichment: `DATABRICKS_ROUTE_CONTEXT_TABLE` (`catalog.schema.route_context`).
- Optional audit: `DATABRICKS_AUDIT_TABLE` (`catalog.schema.decision_events`).
- Scheduled lookup: `DATABRICKS_TRANSIT_TABLE` (`catalog.schema.transit_departures`).

Only HTTPS Databricks workspace hosts are accepted; redirects are disabled. Custom/private
workspace domains are intentionally unsupported for this demo. SQL values are parameterized.
Context rows must be no older than 24 hours and not expired. The latest valid row per corridor
is joined. Scheduled lookup returns null for missing configuration or no catchable service;
transport/data errors reject, so the orchestrator must catch and omit an unavailable option.

Run `node databricks/run.mjs test` for local checks. Unit transport mocks do not establish
live SQL syntax or workspace permissions; run the root live probe/demo for that evidence.
