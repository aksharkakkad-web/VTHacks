# Beacon decision track

This folder owns campus data, the explainable choice, and Databricks evidence. It does not book rides or replace Mahin's orchestration / Rishit's interface.

## Run it

From the repository root (Node 22+, existing `npm install`):

```sh
node databricks/run.mjs test
python3 -m unittest discover -s databricks/ingest -p 'test_*.py'
node databricks/run.mjs demo
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

Before using a result, Mahin must check its objective version still matches, refresh expired quotes, and enforce provider verification + permission before sharing precise pickup. This evaluator never authorizes or requests a ride. Shared `src/types/**` and trip API routes are unchanged.

Scheduled lookup may throw on Databricks failure; catch it and omit that option, or explicitly use the pure `selectScheduledTransit` function with a service-date-valid public snapshot. Do not present a fallback schedule as live vehicle tracking.

## Data and scoring

- **Real snapshots:** 295 scheduled departures across two verified direct campus corridors, 130 phone locations, 12 selected historical incident rows, weather, and official $0 bus fare. See [data contract](../docs/DATABRICKS_DATA.md).
- **Unknown:** outdoor lighting, actual phone operation, comprehensive crime coverage, verified path closures, live ride/transit arrival estimates, observed provider reliability. Missing evidence never means safe.
- **Native Databricks:** managed Delta tables, parameterized SQL eligibility/ranking, versioned context join, sanitized audit, SQL spatial/resource queries and a native dashboard draft builder.
- **Optional:** three-row `ai_extract` public-document experiment. Disabled unless explicitly requested with `--enable-ai`; never changes a winner. Workspace feature/AI quota must be checked first.

`beacon-v2` is the default: waiting + travel + weighted walking + 2 weighted minutes per dollar + transfer penalty + uncertain-reliability penalty; rain multiplies walking by 1.5, verified-unlit walking adds 3/minute. These are transparent demo heuristics, not crime predictions. `beacon-v1` retains the baseline score without rain/unlit penalties. `leastWalkingPlanId` means exactly that, not “safest.” Historical incidents are contextual only.

`databricks/sql/bootstrap.sql` defines the deployed schema; `src/integrations/databricks/sql.ts` generates the runtime query; `src/lib/decision-client/decision.ts` is the executable reference policy. SQL results must match the integer calculation and candidate IDs before acceptance. No model invents prices, incidents, or explanations.

## Refresh and judge evidence

```sh
python3 databricks/ingest/refresh_campus.py
node databricks/run.mjs setup --apply --data-only --datasets route-context,source-manifest,weather-hourly,weather-alerts,refresh-status
node databricks/run.mjs sql databricks/sql/showcase/01_what_if.sql
```

Weather is time-limited and must be refreshed before the demo. GTFS calendar exceptions and overnight times are already expanded to UTC; no valid service means no bus option. Friday Newman service does not imply Sunday service; Eggleston supports the weekend in the captured feed.

Source snapshots are kept in bronze with original SHA-256 identities; large JSON objects are split into reversible `{key,index,value}` records, and arrays into bounded chunks. Curated tables retain the fields used by runtime and judge queries. No student identity, contacts, raw sensitive preferences, or precise GPS are imported.

See [judge guide](../docs/DATABRICKS_JUDGE_DEMO.md). Prepared files and passing local tests are not proof of live SQL or a deployed dashboard. Record actual statement IDs and test results before claiming those are complete.
