# Beacon integration review

Read-only integration audit, September 19, 2026. This workstream owns the regression test in `scripts/beacon-integration.test.mjs` and this review only; shared contracts, app source, server integrations, and production configuration remain outside scope.

## Current test coverage

The initial local-module test intentionally makes no network request and does not start Next. It transpiles the adapter modules in a temporary directory and checks:

- Google’s documented three-point encoded-polyline vector decodes as exact `{ lat, lng }` values in the supplied order.
- Coordinate-array routes preserve supplied coordinate order and copy their point objects instead of mutating or rerouting them.
- Empty, truncated, malformed, and latitude-out-of-range geometry fails closed.
- `providerSourceLabel` uses the neutral provider-source enum: **Simulated rideshare · Demo data**, **Ride provider**, or **Provider source not confirmed**. It makes no commercial-provider claim.
- `parseTripResponse` rejects null/non-object payloads, unknown or non-string statuses, invalid revisions/timestamps, malformed mobility, and a selected plan outside Beacon's known local candidates.
- `applyTripResponse` returns the exact prior state for sample data unless explicitly allowed, stale revisions, another trip or attempt, malformed stages, changed post-consent offers, an unapproved location/booking release, and authorization that lacks identity verification. A newer matching backend response updates the local presentation snapshot only after those gates pass.
- Terminal arrival must revoke authorization and sensitive-data release while retaining an accepted booking history. A stored mobility snapshot is revalidated on restoration; an obsolete provider enum or invalid leg status fails closed.
- The explicit judge/gallery mobility samples remain bound to a known local candidate, have no fabricated driver or vehicle identity, and label the published polyline as a decoder example rather than a campus route.

Run with `node --test scripts/beacon-integration.test.mjs`.

Current run: **14/14 passing**. `git diff --check` for this workstream also passed.

## Timer and manufactured-status audit

The automatic delay table, `getAutomaticAdvanceDelay`, and timed `ADVANCE` effect have been removed. The remaining offer-expiry timeout invalidates only the presented offer; the onboarding timeout is visual navigation only. `ADVANCE` is now blocked from student actions and used only by explicit judge/gallery sample-response controls. No remaining local timer manufactures verification, booking, travel, cancellation, or arrival status in the targeted scan.

No final backend contract or agreed campus route fixture currently exists. The checked-in route decoder is a strict local rendering boundary, not proof of a live Google Routes response, a provider route, a booking, or a safety guarantee.

## Integrated source and browser review

The response parser now requires real strings for every enum rather than coercing arrays or objects, and `applyTripResponse` rejects stale/foreign attempts, unapproved booking or sensitive-data release, contradictory authorization, and terminal responses that retain access. Arrival retains the accepted-booking record while revoking authorization and sensitive data. The storage restore path revalidates mobility before use and removes backend mobility data while reconnecting.

Late transport snapshots are also rejected after home, bootstrap, setup, arrival, or cancellation, so a stale subscription cannot revive an old trip. When a transport exists, a new search receives an opaque `client-request-*` correlation ID; it is only a local response-matching value, never a provider booking reference.

The targeted 390×844 `/demo` check had no page or console errors. It confirmed the neutral source labels, no fabricated driver fields, an active decoder-fixture route only while the walking leg is active, and no map on unknown ride status. The broader integration runner records 19 check groups, 46 captures, zero browser errors, explicit-response pauses at discovery/identity/waiting/cancellation/replacement, and 44 px reachable controls across 360, 393, 430, and desktop ([initial integration results](final/initial-integration/results.json)).

**Resolved P1:** the original fixture-walk screen simultaneously said “Follow the supplied route and written directions” and labeled the fixture “not for navigation.” The status copy now has a fixture-specific honest branch, confirmed in corrected component and final browser captures.

### P1 closure and component review

The corrected 390×844 walking-pickup capture now says **“Route display example; not for navigation.”** before the fixture map and repeats the decoder/example warning below it. This removes the conflicting instruction; **P1 is closed**. The separate 360×800 stale fixture capture keeps the same non-navigation qualifier, warns that the example may be out of date, and retains no invented directions.

The frontend component audit reports 84 passing checks over 20 component captures at 360×800 and 390×844: no horizontal overflow, controls at least 44 px, the map only for active walking, no map for loading/unavailable/ride states, and no active animation under reduced motion ([component results](component-review/results.json)). Walking/transit cancellation now returns locally when booking is `not-required`; the focused regression test confirms no cancellation-pending state is manufactured for a nonexistent provider request.

The renderer unit test stubs the Google Maps constructors and proves that the polyline path and bounds preserve the supplied vertex order exactly. It also proves that a missing SDK returns `sdk-missing` without attempting a request. This is a rendering-boundary test only; it is not live Google Maps, Routes, routing, or attribution proof.

**Final review status:** no open P0, P1, or P2 finding in the integration workstream. Browser and component evidence demonstrate a local, explicitly judge-driven simulation only. They do not establish a live ride provider, Google Maps/Routing configuration, driver tracking, real booking, or campus navigation.

Final expanded production browser proof: **26 check groups, 52 screenshots, zero console/page errors** in `final/final-integration/results.json`; the corrected 390×844 MP4 is linked from `final/browser-review.md`.
