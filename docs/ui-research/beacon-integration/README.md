# Beacon frontend integration follow-up

This work preserves the completed student UI. It changes how route and ride information reaches the UI, not Beacon's visual identity. Earlier walkthrough evidence remains in `../beacon-complete/`; pre-change main/recovery evidence is preserved in `baseline/`.

## Current product decision

Mahin's **simulated rideshare backend** is the authoritative demo provider. Beacon has no live commercial rideshare integration, credentials, partnership, or booking/tracking entitlement. No commercial provider API, logo, proprietary driver asset, brand treatment, or credential has been added.

Ride read models use `providerSource: "simulated-rideshare" | "connected-provider" | "unknown"`. The current demo label is **Simulated rideshare · Demo data**. The generic connected-provider option is a future adapter capability, not a claim of an existing integration. Unknown sources remain **Provider source not confirmed**.

No available backend response contains driver identity, vehicle/plate, meeting instructions, or provider freshness. These optional fields render only when supplied and validated. Existing plan quotes remain the signed-off local plan fixtures; they are not reused as live pickup ETAs. No new driver, vehicle, plate, reference or pickup time is fabricated to fill the card.

## Integration seam

`src/lib/client/beacon/` contains temporary frontend adapter contracts. It does not change `src/types/**`, API paths, package dependencies, environment examples, or signed-off prices.

- `read-models.ts`: exact walking route, active leg and optional ride data.
- `route-geometry.ts`: validates coordinate arrays / decodes Google's documented precision-5 polyline format without altering vertex order or inventing points.
- `trip-response.ts`: provisional trip response envelope and injectable `TripTransport`. Mahin must map his response to this envelope once the endpoint contract is agreed.
- `response-adapter.ts`: rejects malformed geometry/status/data, foreign trips/attempts, old revisions, unapproved offer swaps and invalid identity/access/location combinations.
- `sample-responses.ts`: explicit judge-response builders around the existing deterministic demo reducer. No timer calls them. The published three-point decoder example is a **provisional geometry contract test, not agreed campus directions**. It is never selected automatically.
- `google-map-renderer.ts`: draws exact vertices on an already-initialized Google map. It makes no routing request and holds no credentials. Without SDK configuration, the UI exposes map setup pending and any supplied written directions.

`SafeCircleApp` accepts an optional `transport`. Each transport-backed search gets an opaque `client-request-*` correlation ID so late events cannot match a new trip; it is not a provider booking reference. Command receipts do not advance provider state. Requests/subscriptions must return validated snapshots. No speculative endpoint is called. Repeated command taps share a pending request; offer confirmation remains one attempt. Backend-sourced snapshots require refresh on reload, and their route/driver payload is not persisted. Session-only demo snapshots restore locally with validation.

## Map rules

An explicit active walking leg can show walking geometry. Walking home, to pickup, and to a stop are separate leg purposes. Student confirmation of reaching a pickup/stop hides the map; boarding is an explicit user action. Waiting, riding, verification, authorization, booking, recovery, offline, cancellation and arrival have no route map. No static illustration stands in for an actual geographic route.

Actual Google-derived geometry is reserved for the Google map renderer, with Google Maps attribution for text. The development-only fixture graphic projects supplied vertices without smoothing/rerouting and prominently says **Contract example · not for navigation**. Missing route data stays unavailable.

## How to present

1. Complete onboarding normally.
2. Open `/demo`. Start **Get me home**.
3. Open **Judge controls → Apply next sample response** for each backend progress event. Confirm the exact offered plan yourself.
4. Identity, access, booking and ride status remain separate screens. Nothing progresses merely because time passes.
5. Mobility sample controls inspect active walks and missing/stale data. These are provisional adapter tests. No sample is represented as live navigation.
6. Use **I’m home** to report arrival, or apply the explicit completion sample. The normal `/app` route has no judge controls.

The development-only `/beacon-system` gallery renders the real mobility components, including long-copy and reduced-motion variants. It remains unavailable in a production build.

## Timer audit

| Remaining mechanism | Location | Why safe |
|---|---|---|
| `setTimeout(EXPIRE_OFFER)` | `safe-circle-app.tsx` | Invalidates an offer at its supplied expiry. Does not verify, pay, book, move, cancel or complete a trip. |
| Intro transition timeout | `launch-animation.tsx` | Visual boot animation/navigation only. Does not create provider state. |
| `requestAnimationFrame` | onboarding home page | Hydrates saved address form for display. No provider state. |
| Geolocation timeout option | permission check | Limits a browser permission/location request; no stored/sent coordinates or provider progress. |

Removed: automatic delay table, `getAutomaticAdvanceDelay`, and timed `ADVANCE` effect. `ADVANCE` remains solely as a pure fixture-building operation called deliberately from judge/gallery code. Unknown-result **Retry** preserves the unknown outcome until a new response arrives.

## External work still required

Mahin must supply the agreed active-leg/status snapshot, response revisions and command/event transport, sourced campus walking geometry/directions, and simulated ride details. Google map display setup must be supplied through the team's approved integration. No secrets should be put in client code. Until those exist, route placeholders and explicit fixture controls are the truthful working fallback. This work does not prove a real booking, real driver tracking or real campus navigation.

## Evidence

- `contracts-research.md`: repository contract audit, official Google references and licensing.
- `acceptance-matrix.md`: changed screens/states and integration status.
- `review.md`: Terra review and regression checks.
- `baseline/`: preserved before-change main/recovery screenshots and recording.
- `final/`: current phone walkthrough, screenshots and browser results.
- `component-review/`: rendered component review.
- `pwa-final/`: manifest, installability, offline cache and restricted-storage checks.
- `verification.md` and `verification.log`: final commands, scope, results and limitations.
