# Mobility components — frontend review

Date: 2026-09-19  
Rendered gallery: `http://localhost:3101/beacon-system`  
Viewports: 360×800 and 390×844 with touch and reduced-motion emulation

## Verdict

PASS. The final gallery batch records 84 passed checks, 0 failed checks, 0 browser errors, and 0 unresolved findings across walking-home, walking-pickup, walking-stop, loading, unavailable, stale, simulated ride, active ride, and unknown-provider specimens.

No unresolved P0, P1, or P2 issue remains in the owned component boundary.

## What was verified

- Walking views render only for an active walking leg and use the supplied leg purpose for **I’m at pickup**, **I’m at the stop**, or **I’m home**.
- The fixture route projects every decoded vertex without smoothing and is labeled **Contract example · not for navigation**.
- Loading and unavailable states render no fake map. Stale content warns about age without referring to directions that were not supplied.
- Ride waiting/riding views contain no illustrative map or scenic route artwork.
- Provider copy comes from `providerSourceLabel`: simulated data is explicit, while unknown data remains **Provider source not confirmed**.
- Missing pickup instructions use the exact fallback **Pickup instructions unavailable.**
- Optional fields collapse cleanly. A single final fact spans the full status card instead of leaving an arbitrary empty half-column.
- Active ride legs retain the **I’m home** action even when the optional ride stage is unknown.
- Transit waiting uses a neutral boarding card when the optional ride object contains no actual ride fields, and only exposes **I’ve boarded** when the callback is supplied.
- All inspected controls are at least 44×44 CSS pixels, no specimen has horizontal overflow, reduced motion settles without a running component animation, and the long stale footer remains reachable by scrolling.

## Findings resolved

| Severity | Finding | Resolution |
| --- | --- | --- |
| P1 | The fixture intro could imply that the contract polyline was usable navigation. | The intro now says **Route display example; not for navigation.** |
| P2 | A lone optional ride fact occupied half a two-column card. | The final odd fact now spans both columns and removes the unused divider. |
| P2 | Some missing-data copy referred users to details or directions that might not exist. | Copy now branches on actual supplied pickup, identity, and direction fields. Source and update freshness remain explicit when absent. |

## Google map adapter

`google-renderer-results.json` records 6 passed adapter checks. With no initialized SDK, the adapter returns `sdk-missing` and draws no substitute map. With a local fake of the already-initialized Maps API, the Google polyline receives every supplied vertex unchanged, uses `geodesic: false`, fits bounds across every vertex, and detaches overlays during cleanup. The component retains visible **Google Maps** attribution when a Google-sourced route cannot initialize its map.

The adapter does not request directions, load an API key, calculate a route, smooth geometry, or add a dependency.

## Evidence

- [`results.json`](./results.json) — 84 rendered checks
- [`google-renderer-results.json`](./google-renderer-results.json) — 6 adapter checks
- [`screenshots/`](./screenshots/) — 18 top-of-screen phone captures plus 2 scrolled stale-footer captures

## Focused checks

- ESLint passed for `mobility-screens.tsx` and `google-map-renderer.ts`.
- An isolated strict TypeScript project covering the owned component, renderer, frozen read model, and route decoder passed.
- Focused `git diff --check` passed.

The gallery uses published polyline algorithm test geometry marked as a contract example. It does not establish real campus directions, live provider data, physical-device GPS behavior, or an initialized Google Maps browser session.
