# Beacon complete backend demo

This is the September 19 completion target for Akshar's combined agent and Databricks track. It extends the verified backend in `0a617a7`. Rishit owns the remaining screen wiring.

## Run

```sh
npm run demo
```

The command builds the app, starts three local provider services, starts the app at `http://127.0.0.1:3123`, starts the managed Codex worker, and prints a ten-minute browser pairing code. Existing Databricks credentials in `.env.local` are used; an existing CLI OAuth profile can supply its token in memory. No new account or API purchase is needed. Ctrl-C stops the processes started by this launcher.

`npm run demo -- --offline` explicitly uses local ranking. `--skip-build` reuses the last built app after a successful build. `--google` uses an existing approved server Routes API key; otherwise walking geometry is a labeled illustrative demo path. Real Google routing is not established by this demo.

The judge flow uses a complete synthetic campus scenario: all displayed candidate walking segments, waiting locations and pickup/drop-off points have numeric scenario conditions. Public campus/transit/crime/lighting source datasets remain available on the normal data path. A scenario index is not a crime probability, measured illumination or an actual incident report. Rides, payments, timetable and contact notifications in this scripted flow are simulated.

The scenario policy ranks feasible complete journeys using duration, walking preference, outdoor waiting, price and transfers, plus synthetic lighting, incident-pressure and rain exposure. The same integer formula runs locally and in Databricks SQL; every native result is checked for matching IDs, scores and order. Normal walking has no extra walking penalty beyond elapsed time; the less-walking preference adds a five-times walking penalty. Synthetic exposure weights are 10 for unlit seconds, 12 for incident-index-weighted seconds and 6 for walking in rain. These are explicit demo policy choices, not learned estimates of personal danger. Native v1 scoring is unchanged.

`incident_pressure` also supplies an exposed current waiting spot and a nearby synthetic indoor waiting option. The planner must include both access walks and the pickup buffer, then choose the detour only when useful. Changed provider ETA can advance the instruction to leave shelter for pickup. Timetable options in the scenario are explicitly synthetic; actual Blacksburg Transit schedules remain on the normal data path.

## Demonstrate without waiting for UI wiring

The launcher prints a private operator file path. Substitute it below:

```sh
node scripts/demo-control.mjs /private/runtime/operator.json start
node scripts/demo-control.mjs /private/runtime/operator.json scenario lighting_outage
node scripts/demo-control.mjs /private/runtime/operator.json approve
node scripts/demo-control.mjs /private/runtime/operator.json advance approaching
node scripts/demo-control.mjs /private/runtime/operator.json cancel
node scripts/demo-control.mjs /private/runtime/operator.json approve
node scripts/demo-control.mjs /private/runtime/operator.json advance approaching
node scripts/demo-control.mjs /private/runtime/operator.json advance arrived
node scripts/demo-control.mjs /private/runtime/operator.json advance in_trip
node scripts/demo-control.mjs /private/runtime/operator.json advance completed
node scripts/demo-control.mjs /private/runtime/operator.json home
```

`home` supplies three synthetic location samples over 30 seconds to exercise the real location-arrival policy. Provider completion alone is not home arrival. `overdue` advances the alert deadline and records simulated delivery to the synthetic trusted contact. Operator playback advances vehicle stages; it does not accelerate journey-clock timestamps or claim live vehicle GPS.

The operator file contains a local service credential/session. It is written with mode 0600 in the private temporary run directory, outside Git. Do not share it with judges or put it in the frontend.

## Rishit's only integration target

Pair once with `POST /api/demo/planner/pair` and `{ "code": "<printed code>" }`. Keep the HttpOnly session cookie.

Create a journey:

```json
{
  "journeyContract": "beacon-journey-v1",
  "demoScenarioVariant": "baseline",
  "preferences": {
    "maxBudget": 10,
    "walkingPreference": "normal",
    "transferPreference": "minimize"
  }
}
```

Send to `POST /api/trips`, then `POST /api/trips/:id/planning` with `{}`. Poll `GET /api/trips/:id/journey` for one combined response:

| Field | Display/use |
| --- | --- |
| `trip.state`, `trip.statusMessage` | Overall journey state |
| `journey.nextStep` | Current instruction; only show walking map when `showMap` is true |
| `journey.complete.selected` | Cost, arrival, leg timing, exact scenario/route evidence and exposure features |
| `journey.complete.alternatives` | At most three choices behind a secondary action |
| `journey.complete.demoScenario` | One clear demo-scenario label and source details |
| `journey.complete.execution` | Actual ranking engine and Databricks statement ID when SQL ran |
| `ride` | Driver, vehicle, plate, pickup ETA, provider stage and observation time |
| `navigation` | Google/Apple Maps link to the current walking destination; external app chooses its own path |
| `planning` | Current grounded AI explanation and worker status; mismatched/stale prose is suppressed |
| `coordination` | Payment/authorization status and remaining budget |
| `arrival`, `notification` | Location arrival progress and overdue-contact delivery state |

Use `journey.nextStep`, not the original `complete.selected.nextStep`, which describes the original plan. The map must use the route belonging to the current leg. A maps handoff does not promise the identical evaluated path.

Confirm through `POST /api/trips/:id/confirm` with `{planId, journeyRevision, quoteId}` from the displayed response (`quoteId` only for a ride). Then call `verify` and `request`, each with `{}`. A replacement requires a new confirmation. Poll the same journey response throughout the trip. Send browser location samples to `POST /api/trips/:id/location` with `{lat,lng,accuracyMeters,recordedAt}`; no manual home check-in is needed.

Demo controls are owner scoped and available only under the explicit demo flags:

- `POST /api/demo/trips/:id/scenario`: `{variant,journeyRevision}`. Variants: `baseline`, `lighting_outage`, `incident_pressure`, `rain`. Replans the trip and invalidates old consent.
- `POST /api/demo/trips/:id/advance-ride`: `{stage,pickupEtaSeconds?}`. Sequential stages: `approaching`, `arrived`, `in_trip`, `completed`; `cancelled` is allowed for an active ride.
- `POST /api/demo/trips/:id/expire-deadline`: `{}`. Exercises the overdue notification path.
- `GET /api/trips/:id/activity`: Existing sanitized agent activity feed, if the UI wants to show execution.

## Completion check

```sh
npm run demo:check
# No live model / warehouse, for repeatable development checks:
npm run demo:check -- --offline --fixture-model
```

The check exercises baseline walking, a lighting-driven change to a ride, driver details, cancellation/replanning, a replacement booking, every ride stage, location-based arrival, zero budget with reduced walking, and an overdue alert. The real-model run requires a validated grounded explanation. If Databricks is configured, the check requires actual native SQL ranking and saves statement IDs in a private receipt; local fallback cannot pass as native execution. The full journey result is also retained in the local trip store during the active demo.

Verification results for the final candidate are recorded in `BACKEND_COMPLETION_PLAN.md`. A local demo is not a deployed service; the app/worker/providers must remain running while Rishit uses it.
