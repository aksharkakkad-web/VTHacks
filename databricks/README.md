# Beacon decision track

This folder owns campus data, the explainable choice, and Databricks evidence. It does not book rides or replace Mahin's orchestration / Rishit's interface.

**Current local expansion:** Read the [verified pilot status and integration gates](../docs/DATABRICKS_EXPANDED_PILOT_STATUS.md) before demo/deployment. The [complete BT importer](../docs/DATABRICKS_FULL_TRANSIT.md), [draft 50-direction coverage check](../docs/DATABRICKS_PILOT_COVERAGE.md), [local native-import candidate](../docs/DATABRICKS_FULL_TRANSIT_NATIVE.md) and read-only `latency.mjs` are additive tools; the wider network and full-feed query are not yet wired into the runtime. Refresh closures/weather and rebuild routes together before a later demo; never treat a source-version mismatch as a verified managed route. Cloud writes require approval.

## Run it

From the repository root (Node 22+, existing `npm install`):

```sh
node databricks/run.mjs test
python3 -m unittest discover -s databricks/ingest -p 'test_*.py'
python3 -m unittest discover -s databricks/jobs -p 'test_*.py'
node databricks/run.mjs demo
node databricks/run.mjs intelligence
node databricks/run.mjs setup
```

`demo` runs six assertions: initial choice, cancellation, lower budget, lowest-cost preference, no feasible option, and official GTFS snapshot replay. Local results explicitly say `local_fallback`; offers from the frozen provider scenario say simulated. `setup` without `--apply` only previews.

## Connect a hackathon workspace

The agent handles these commands; the account owner handles login/consent when prompted.

1. Install the official Databricks CLI and authenticate with an explicitly chosen profile:

   ```sh
   databricks auth login --host https://YOUR-WORKSPACE.cloud.databricks.com --profile YOUR-PROFILE
   databricks warehouses list --profile YOUR-PROFILE
   ```

2. Put **non-secret** configuration in ignored `.env.local`: `DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_ID`, `DATABRICKS_CONFIG_PROFILE`, `DATABRICKS_CATALOG`, `DATABRICKS_SCHEMA`. See [env.example](env.example). Use an existing authorized warehouse/catalog; no paid upgrade or new compute is required by the scripts.
3. `node databricks/run.mjs doctor` checks configuration without printing tokens.
4. `node databricks/run.mjs setup --apply` creates only the configured Beacon schema/tables and merges public data. Existing records are not deleted; importing the same snapshot is repeatable.
5. `node databricks/run.mjs demo --live` requires actual SQL results. It fails if the runtime falls back. It also reads the managed `transit_departures` table before building the real scheduled option.
6. `node databricks/run.mjs dev` starts Next with a short-lived OAuth access token in memory. Restart through this wrapper if the token expires. Never commit tokens or put one in `NEXT_PUBLIC_*`.

The runner obtains a token from the chosen OAuth profile without printing or writing it. The profile is saved by the vendor CLI outside Git. Hosted deployment authentication is a separate team decision; this development wrapper does not provision service accounts or deploy anything.

## Team integration

The integrated backend wires `evaluateTripIntelligence` into Mahin's Student Agent and accepts optional named campus corridors. Use the [current API/map handoff](../docs/DATABRICKS_APP_HANDOFF.md) and [native public import runbook](NATIVE_PUBLIC_IMPORT.md). The lower-level examples below remain valid entry points, not additional work Mahin must redo.

Mahin's **server code** imports:

```ts
import { evaluateTrip, getScheduledTransitOption } from "@/lib/decision-client/server";

const scheduled = await getScheduledTransitOption({
  corridorId: "eggleston-pritchard",
  evaluatedAt: new Date().toISOString(),
  accessWalkingMinutes: 2, // replace with route evidence; not a geocoded estimate
  egressWalkingMinutes: 1,
});
// Add scheduled.candidate and scheduled.signals if non-null.
const result = await evaluateTrip(candidates, {
  maxBudget: 10, // dollars, at most two decimal places
  minimizeWalking: true,
  objectiveVersion: currentTripVersion,
  excludedProviderIds: failedProviderIds,
}, evidenceByPlanId);
```

Catch invalid-request errors at the API boundary. Only `RECOMMENDED` has a `recommendation`; `NO_FEASIBLE_PLAN` and `EMERGENCY` have no winner. Preserve `engine`, `warnings`, source labels, and objective version in the response to Rishit. Do not fabricate a `selectedPlanId` for the old success-only type.

Before using a result, the backend checks its objective version still matches, refreshes expired quotes, and enforces provider verification + permission before sharing precise pickup. This evaluator never authorizes or requests a ride. Shared `src/types/**` and trip API route files are unchanged; named-corridor input and evidence response fields are additive in the backend implementation.

Scheduled lookup may throw on Databricks failure; catch it and omit that option, or explicitly use the pure `selectScheduledTransit` function with a service-date-valid public snapshot. Do not present a fallback schedule as live vehicle tracking.

### Full intelligence handoff (new, additive)

```ts
import { getMappedWalkingOption, evaluateTripIntelligence } from "@/lib/decision-client/server";

const corridorId = "eggleston-pritchard"; // supported named demo corridor, not arbitrary GPS
const walking = await getMappedWalkingOption(corridorId);
if (walking) {
  candidates.push(walking.candidate);
  evidenceByPlanId[walking.candidate.planId] = walking.signals;
}
const bundle = await evaluateTripIntelligence(candidates, {
  maxBudget: 10,
  minimizeWalking: true,
  objectiveVersion: currentTripVersion,
  excludedProviderIds: failedProviderIds,
}, evidenceByPlanId, { corridorId, enableAi: true });
// bundle.decision is the original decision envelope.
// bundle.explanation.facts contain display-ready text, sourceKind and optional sourceUrl.
// bundle.route is public route geometry/context; preserve its limitations.
// Preserve explanation.engine, bundle.warnings, routeStatementId and decision metadata.
```

Handle a failed route lookup like failed transit lookup: omit that option, never invent geometry. Mapped walking is estimated at 80 m/min on connected public geometry, excludes landmark-to-network offsets, expires after two minutes and rejects snapshots older than seven days. It is not doorstep navigation or an accessible-route guarantee. Route facts describe the **whole walking alternative**, not ride pickup/egress walking.

The model is native `databricks-meta-llama-3-3-70b-instruct` through parameterized `ai_query`. It selects valid fact IDs only. Exact text/citations are rendered locally; source/unknown warnings are mandatory. AI cannot change eligibility, price or the selected plan. Output is `databricks_ai`, `template`, or `template_fallback`; default AI deadline is 12 seconds. Quote expiry is rechecked after the model wait, with fresh evaluation and a template explanation if necessary. No student identifiers, exact GPS, credentials, provider prose or raw user text enter its prompt.

Set the **server-only** `DATABRICKS_ROUTE_EVIDENCE_TABLE` from [env.example](env.example). `run.mjs` supplies its default. `DATABRICKS_ENABLE_AI=true` enables curation for this export; explicit `enableAi` overrides it. Existing `evaluateTrip` remains model-free. The integrated evidence response is documented in the handoff; no UI was implemented here.

For the verified cloud demo (60-second cold-model bound):

```sh
node databricks/run.mjs intelligence --live --enable-ai
```

This requires real Databricks ranking, audit persistence, managed route reads and a validated native model response. It then asserts that a $0 budget chooses the mapped free walk instead of the simulated $7 ride. The ride remains explicitly simulated.

## Data and scoring

- **Real snapshots:** current local timetable448 departures, 130 phone locations, expanded719 crime-log rows, 1,179 community lighting objects, four historical pedestrian summaries, 14 published construction areas, 65 mapped emergency items, 20 notice-page records, weather, $0 bus fare and two connected routes from1,970 official campus pathway features. See [data contract](../docs/DATABRICKS_DATA.md) and [route coverage](../docs/DATABRICKS_ROUTE_DATA.md). Community/historical data is labeled, not promoted to live verified conditions.
- **Unknown:** measured/operating lighting, phone operation, comprehensive crime coverage, route-wide clearance, live ride/transit arrivals and observed provider reliability. Fresh official construction intersections can exclude walking; absence of an intersection is not proof of safety.
- **Native Databricks:** 13 managed Delta tables including expanded public archives and initially empty outcomes, parameterized SQL ranking/context/audits, spatial/H3 queries, dashboard draft, bounded native refresh/import jobs and optional grounded `ai_query` briefing.
- **Separate optional experiment:** three-row `ai_extract` public-document extraction. Disabled unless explicitly requested with `--enable-ai`; never changes a winner. Workspace feature/AI quota must be checked first.

`beacon-v2` is the default: waiting + travel + weighted walking + 2 weighted minutes per dollar + transfer penalty + uncertain-reliability penalty; rain multiplies walking by 1.5, verified-unlit walking adds 3/minute. These are transparent demo heuristics, not crime predictions. `beacon-v1` retains the baseline score without rain/unlit penalties. `leastWalkingPlanId` means exactly that, not “safest.” Historical incidents are contextual only.

`databricks/sql/bootstrap.sql` defines the deployed schema; `src/integrations/databricks/sql.ts` generates the runtime query; `src/lib/decision-client/decision.ts` is the executable reference policy. SQL results must match the integer calculation and candidate IDs before acceptance. No model invents prices, incidents, or explanations.

## Refresh and judge evidence

```sh
python3 databricks/ingest/refresh_campus.py
node databricks/run.mjs setup --apply --data-only
node databricks/run.mjs sql databricks/sql/showcase/01_what_if.sql
```

The native [bounded refresh job](jobs/README.md) handles current public weather/transit/phones/fare snapshots during the hackathon. The commands above are the manual local alternative; check importer exit status before loading. Do not import a newer manifest without its corresponding typed data. Weather validity uses forecast issue time, exact forecast/alert windows and both current NWS hashes. Transit uses the current GTFS hash; old retained rows cannot restore removed trips. GTFS calendar exceptions and overnight times are expanded to UTC; no valid service means no bus option. Friday Newman service does not imply Sunday service; Eggleston supports the weekend in the captured feed.

Source snapshots are kept in bronze with original SHA-256 identities; large JSON objects are split into reversible `{key,index,value}` records, and arrays into bounded chunks. Curated tables retain the fields used by runtime and judge queries. No student identity, contacts, raw sensitive preferences, or precise GPS are imported.

See [judge guide](../docs/DATABRICKS_JUDGE_DEMO.md). Prepared files and passing local tests are not proof of live SQL or a deployed dashboard. Record actual statement IDs and test results before claiming those are complete.
