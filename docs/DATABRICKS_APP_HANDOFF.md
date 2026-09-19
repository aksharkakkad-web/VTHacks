# Integrated public route and Databricks handoff

This local integration connects the Student Agent to mapped walking alternatives, managed scheduled transit, the deterministic Databricks evaluator, the grounded briefing, and the public-data safety sidecar. It does not implement the frontend or assert a deployed/live test. Existing shared `CandidatePlan`, `Recommendation`, `Trip`, API paths, default downtown demo, provider verification, confirmation, booking and notifications remain compatible.

## Optional named route

Add `corridorId: "eggleston-pritchard"` or `"newman-pritchard"` to the existing `POST /api/trips` body. In demo mode, missing origin/home use the selected public mapped endpoints; a request without `corridorId` keeps the original Downtown Blacksburg demo. In ordinary mode the request must supply origin and home as before. Both endpoints must be within 50 meters of the mapped endpoints, checked locally. That tolerance accommodates the recorded 42-meter Newman map offset and does not establish a verified building-entrance path.

```json
{
  "corridorId": "eggleston-pritchard",
  "preferences": { "maxBudget": 10, "walkingPreference": "minimize" }
}
```

This example uses synthetic public endpoints and requires `DEMO_MODE=true`. Explicit mismatched coordinates and unsupported corridor names return `CORRIDOR_ENDPOINT_MISMATCH` / `UNSUPPORTED_CORRIDOR`. Exact student coordinates, home addresses, contact data and raw context are never sent to research or Databricks. Providers still receive only coarse campus zones before the existing trust gate.

## What the backend now does

1. Discover provider quotes using Mahin's existing flow.
2. For a matching named route, replace the fixed 22-minute simulated walk with the public mapped option. A failed route lookup omits walking; it never restores a fictional route. A fresh moved pickup is checked again during rediscovery.
3. Read managed BT departures for a demo route. Departure/service timing is from the timetable; access and egress are explicitly labeled **3-minute demo estimates each**. They are not measured door-to-stop paths. Ordinary production trips omit this option until those paths are verified. No departure means no scheduled candidate; separate simulated transport services retain their simulation label.
4. Evaluate the combined bounded candidate list using `evaluateTripIntelligence`. The default wrapper executes one ranking pass plus the existing optional grounded AI briefing; it does not also run the basic evaluator. Existing expiry handling may reevaluate if the explanation delay exhausts an offer. Native AI only orders verified fact IDs and cannot choose the trip or invent a safety score.
5. Keep per-plan source, route version and expiry in internal sidecars. Official fresh closure intersections continue to reject mapped walking. A closed map is evidence, not a usable detour. Cancellation rediscovery excludes failed providers and reevaluates with refreshed options.
6. Persist the public evidence and the evaluated decision behind the existing owner-protected evidence endpoint. Quote, mapped-data, timetable and applicable local weather deadlines are checked again before confirming/requesting a trip. The selected result's returned evidence expiry is also retained.

## Reading evidence / map handoff

Rishit's frontend is now available in PR #16 (`feat/beacon-design-system`, `17fa00f`). Its `docs/ui-research/integration-notes.md` confirms simulated frontend state and its `map-surface.tsx` labels an illustrative SVG route. Preserve his components/design and replace demo event production with these real API responses; do not display our walking path as a ride trajectory. The frontend branch is not included in this data/backend change.

`GET /api/trips/:id/evidence` retains the earlier weather response and adds:

- `corridorId`: the requested supported public route, when provided.
- `options.walkingAlternative.route`: public LineString geometry, distance, named endpoints, map capture date, source version and source URL. **This is the full walking alternative, never the route taken by a ride or a provider's pickup/drop-off walk.** It can exist even when walking was rejected by a closure.
- `options.walkingAlternative.source`: `databricks` for a managed read or `local_snapshot` for a validated checked-in map, plus a managed statement ID when available.
- `options.transit`: scheduled availability, explicit demo walk estimates and a managed read statement ID when one exists.
- `options.warnings`: route fallback, unavailable timetable or unverified stop-access information.
- `intelligence.decision`: engine, policy, statement ID, audit status, ranked choices, rejected choices and the explanation used for ranking.
- `intelligence.explanation`: grounded facts and `databricks_ai`, `template` or `template_fallback` provenance. Keep the required limitations/source facts visible.
- `intelligence.safetyEvidence`: partial coverage, source provenance/freshness, matched historical endpoint reports, unknown measurements and walking-only hard blocks. `routeExposureScore` remains `null` because the available data cannot support a reliable safety number.
- `evidenceEvaluatedAt`: when the decision snapshot was evaluated. `selectionCurrent` becomes false after its deadline or a terminal/invalidated selection; old evidence must not be displayed as a fresh recommendation.

The route fields and safety blocks describe the mapped walking alternative even if the selected option is a ride. Rishit owns drawing it and displaying selected-mode-appropriate copy. No frontend dependency or map service was added here.

## Failure and configuration behavior

Existing `DATABRICKS_*` server environment variables select the workspace/tables; `DATABRICKS_ENABLE_AI=true` enables the existing model briefing. No credentials are created or copied. Managed map failure or a mismatch with the deployed map version falls back to a validated dated checked-in map no older than seven days, labeled `local_snapshot`. Requiring the same map version prevents an older cloud path from bypassing local closure checks during an update. Managed timetable failure omits that option. Ranking fallback is visibly `local_fallback`; checked-in evidence is never presented as live SQL execution. All local research reads are fixed public files; no web search occurs per trip.

The scope remains two campus paths, not arbitrary-address routing or turn-by-turn navigation. Building entrance connections, stop-access paths, current foot traffic, complete incident coverage, measured lighting and observed provider reliability are not established by this integration. A live deployed combined app journey still needs manager verification and approved deployment; unit tests do not establish it.

For a route rebuilt to conservatively avoid published construction areas, `construction_avoidance.valid_until` also bounds the walking candidate. Before its calculation or after its public-source deadline the option is omitted until a source refresh/rebuild produces current evidence. Repeated trip requests cannot renew that deadline. This is conservative avoidance of published areas, not a certification that every remaining path is open or safe.

## Local verification

Run `bash src/agents/test.sh`. Focused additions in `src/agents/public-trip-integration.test.ts` cover matching/mismatched public routes, default-demo compatibility, scheduled source labels and demo walking assumptions, production omission, local route briefing, one evaluation per normal request, sidecar ownership/expiry, closure rejection and cancellation recovery. Tests use explicitly constructed inputs; they do not assert live vehicle operation, Databricks execution or a real booking.
