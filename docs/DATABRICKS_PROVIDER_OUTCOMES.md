# Provider outcomes: additive Mahin handoff

This is an implemented contract for future real observations, not a claim that Beacon has real provider history. No records are seeded or imported. Today's history is empty and reliability is `unknown` with `reliability: null`. Demo bookings and provider-supplied reliability do not establish observed performance.

## Trusted caller and input

Mahin's server may later emit one sanitized final observation after a real provider attempt has completed or canceled. This module does not edit trip state, authorize a booking, or expose an HTTP endpoint. Never forward the browser request or provider payload directly. A provider's own status claim alone must use `provider_reported`; only independently corroborated actual outcomes qualify as `beacon_observed`. A server-run simulation remains `simulated`.

`validateProviderOutcome(input: unknown): ProviderOutcome` is pure. Unknown keys, invalid provenance, malformed UTC timestamps and inconsistent event order reject with a safe `ProviderOutcomeError.code`. Optional timestamp fields normalize to `null`; no times are invented.

| Field | Contract |
| --- | --- |
| `providerId` | Public provider identifier, 1–128 identifier characters |
| `observationId` | Dedicated random UUID v4 allocated once per provider attempt; never a trip, booking or student ID, nor a hash of those IDs |
| `requestedAt` | Actual request timestamp, required |
| `acceptedAt` | Actual acceptance time or `null` |
| `promisedPickupAt` | Agreed pickup time or `null` |
| `actualPickupAt` | Corroborated actual pickup time or `null` |
| `completedAt` | Required for `completed`; otherwise `null` |
| `canceledAt` | Required for `canceled`; otherwise `null` |
| `cancellationParty` | `provider`, `student`, `unknown`; `null` for completion |
| `finalOutcome` | `completed` or `canceled`; no intermediate lifecycle events |
| `source` | `beacon_observed`, `provider_reported`, or `simulated` |
| `observedAt` | When these final facts were observed, not the ingestion retry time |
| `dataVersion` | Bounded identifier for the observer/data contract version |

All times are ISO UTC (`2026-09-19T13:00:00.000Z`). Do not send names, exact locations, destination addresses, contact details, student IDs, trip IDs, booking IDs, free text or credentials. Runtime validation rejects additional fields. The emitter is responsible for allocating an unrelated observation ID and accurately classifying real versus simulated evidence; a type alone cannot prove that a claimed event happened.

## Immutable final facts and retries

Emit only after the facts to include are final. Reuse the same `observationId` and identical canonical payload on every retry, including `observedAt` and `dataVersion`. `MERGE` inserts a new observation and leaves identical retries unchanged. Reusing an ID with changed facts fails the statement via Databricks [`raise_error`](https://docs.databricks.com/aws/en/sql/language-manual/functions/raise_error), rather than adding another outcome. Do not mint a new ID for a correction to the same attempt. Corrections require a separately reviewed data-repair workflow; incremental event revisions are intentionally outside this small final-outcome contract.

Delta uniqueness constraints are not assumed: queries also group by observation ID, so identical duplicate physical rows from concurrent retry races count once. Conflicting duplicate payloads make the read fail rather than choose arbitrarily. This is not an exactly-once delivery claim. Sanity checks are intended for rows written through this trusted module; direct table writers must preserve the same contract.

## Reliability policy

`calculateProviderReliability(outcomes: readonly unknown[], providerId: string, evaluatedAt: string): ProviderReliability` is the pure reference implementation, bounded to 10,000 input records. Managed reads aggregate in SQL without a raw-row limit and use the same `providerReliabilityFromCounts` calculation.

- Window: final completion/cancellation time strictly after `evaluatedAt - 30 days` and at or before `evaluatedAt`. Observations recorded after the evaluation time cannot affect that replay.
- Eligible evidence: only `beacon_observed` completions and provider-attributed cancellations for that provider. Student/unknown-party cancellations, simulations and self-reports are excluded and counted separately.
- Minimum sample: 10 distinct eligible observations. Below this, return `status: "unknown"`, `reliability: null`, and `INSUFFICIENT_OBSERVATIONS`.
- Once sufficient: `(completed + 5) / (completed + providerCanceled + 10)`. This matches the Databricks PRD's prior of 10 observations at neutral 0.5. For example, 10 actual completions yield 0.75, not perfect reliability.
- Pickup delay: mean positive delay beyond promised pickup time, only for observed completed attempts with both timestamps. Missing times are excluded; sample count accompanies the mean. Delay is display context and does not change completion reliability.
- Snapshot validity: 24 hours from evaluation. `lastObservedAt` separately identifies the newest eligible observation. Refreshing an empty table does not create evidence.

This is historical completion reliability under a declared sample, not a personal safety score or a guarantee of future service. New events affect later evaluations, not past replays. The cancellation attribution decision is explicit: unknown/student cancellations are not blamed on the provider.

## Managed table and exact functions

Module: `src/integrations/databricks/provider-outcomes.ts` (server-side only, using existing Statement API).

```ts
providerOutcomesSchemaSql(table: string): string

ingestProviderOutcome(
  config: DatabricksConfig,
  table: string,
  payload: unknown,
  options?: { fetch?: typeof fetch; pollIntervalMs?: number; receivedAt?: string }
): Promise<{ observationId: string; statementId: string }>

getProviderReliability(
  config: DatabricksConfig,
  table: string,
  providerId: string,
  evaluatedAt: string,
  options?: { fetch?: typeof fetch; pollIntervalMs?: number }
): Promise<ProviderReliability & { statementId: string }>
```

Use a configured fully qualified name such as `workspace.beacon.provider_outcomes`, never a request-provided name. Bootstrap with `executeStatement(config, { statement: providerOutcomesSchemaSql(table) })` only during approved workspace setup. The returned SQL creates one typed managed Delta table and inserts no records. The same existing workspace host/token/warehouse configuration applies; no new credential or package is required.

Ingestion binds one strictly validated JSON parameter; the SQL parses an explicit schema. Provider and evaluation clock are bound read parameters. Both calls have a ten-second statement bound and use existing transport handling. Authentication, timeout, malformed responses and conflicting observations reject; callers must display unavailable history or retain a still-valid snapshot, not substitute simulated history. This work adds no public ingestion endpoint, remote migration, automatic emitter, scheduler or retention policy.

For future integration, collect provider IDs → query this module once per provider → if status is sufficient and still valid, map `reliability` to `PlanSignals.observedReliability` and `evaluatedAt` to `reliabilityObservedAt` → evaluate existing candidates. Preserve the full count/source/last-observed context in the evidence sidecar. Never map a null/unknown value to 0 or 1. Shared `CandidatePlan` and the existing decision exports remain unchanged.

## Verification and remaining work

Run `node databricks/run.mjs test`. Provider-outcome tests cover empty/small samples, genuine test observations, cancellation attribution, simulation/self-report exclusion, deterministic ordering, duplicate retries, conflicting final facts, 30-day/time boundaries, malformed timestamps, forbidden private fields, parameter binding, malformed managed results, unknown empty tables and transport failure. Fixtures exist only in the test file and are not setup/import data.

Live table creation/read and actual independently corroborated provider events remain separate integration steps. Unit/mock transport tests do not establish live Databricks ingestion or real provider performance.
