# Walking directions and path evidence

`src/lib/decision-client/walking-router.ts` is a server adapter for established Google Routes walking directions. Beacon requests a path, validates the returned geometry/metrics/instructions, and evaluates it. It does not construct a replacement walking network or invent a straight-line connector.

## Callable interfaces

```ts
import { createWalkingRouter, validateWalkingRoute } from '@/lib/decision-client/walking-router';
import { assessPathEvidence } from '@/lib/decision-client/path-evidence';

const route = await createWalkingRouter(process.env)(
  { lat: 37.2287881, lng: -80.41916034 },
  { lat: 37.22424955, lng: -80.41965644 },
  new Date().toISOString(),
);
const evidence = assessPathEvidence(route, new Date().toISOString());
```

The coordinates above are public campus reference points. This example has **not** been executed against Google Routes. Live use is blocked pending configuration and authorization.

`WalkingRoute` contains `routeId`, exact requested `from`/`to`, the provider's GeoJSON `LineString`, `distanceMeters`, `durationSeconds`, ordered `instructions` with text/distance/duration, `provider`, `capturedAt`, and `validUntil`. `WalkingRouter` takes `(from, to, at)` and returns `Promise<WalkingRoute>`. `validateWalkingRoute(route, from, to, at)` can also validate injected adapters at the planner boundary.

`assessPathEvidence(route, at)` returns `{ blocked, validUntil, facts, unknowns }`. It reads the current checked-in public data files locally. Its optional third argument supplies an explicit source bundle for offline tests. Each fact records kind, source URL/version, capture and observation time, validity, confidence, spatial match and details. No request coordinates are sent to evidence sources. Mahin's orchestration should use `blocked` and expiry while Rishit's UI should preserve the facts' uncertainty and temporal labels.

`blocked: false` means no applicable verified block was established; it does not certify an open or safe path. Missing/stale sources appear in `unknowns`. The caller must recheck evidence at the planned leg time and honor `validUntil`, including before a future construction closure begins. The current public inventory does not establish door access, waiting-space availability or provider pickup permission.

## Configuration and authorization

No established Maps routing configuration was found during this implementation. The adapter requires both server-only environment values:

- `BEACON_WALKING_ROUTER=google_routes`
- `GOOGLE_ROUTES_API_KEY`, from an authorized account with Routes API access.

The adapter is opt-in; supplying neither performs no routing call. No account, paid API activation, billing change, key change or cloud mutation was performed. An authorized operator must choose and configure the service before live verification. Exact endpoints are sent to Google when the adapter runs; retain the project's applicable location/consent boundary and call it server-side. Never expose the API key in client code.

Each call sends one request to the fixed HTTPS Google endpoint, using `WALK`, `HIGH_QUALITY`, `GEO_JSON_LINESTRING`, an explicit field mask, no redirects, no persistent cache and an 8-second timeout. It does not automatically retry paid requests. The planner owns the bounded number of path requests per journey. The caller supplies the current evaluation clock; capture and a five-minute freshness policy use that clock. Walking durations are provider estimates, not future weather-aware guarantees.

## Validation and limitations

Supported bounding box: latitude 37.205–37.245, longitude -80.440–-80.395, covering the scoped Blacksburg/VT demo area. Both endpoints and every route coordinate must lie within it. The adapter validates one route/leg, ordered step connectivity, step geometry alignment, endpoint offsets up to 20 metres, finite bounded metrics, totals, payload size and freshness. Provider endpoint snapping is preserved in geometry; Beacon adds no connector and makes no verified entrance-access claim. A disconnected jump over 1 kilometre in a high-quality walking polyline is rejected. Unsupported routes return explicit `WalkingRoutingError.code` values: `configuration_missing`, `unsupported_area`, `invalid_request`, `provider_unavailable`, `no_route`, or `invalid_route`. No error substitutes a fixture or logs the provider response/key.

These checks detect malformed/disconnected results; they do not independently certify sidewalk access. Non-walking ride geometry must come from the bound provider offer. Provider bookings, confirmations and location authorization remain Mahin's responsibility.

## Evidence semantics

- Construction: existing official polygon intersection code checks the actual path, current source dates and a one-hour snapshot limit. An intersection blocks walking. Upcoming intersecting closures shorten validity. Partial published coverage stays explicit.
- Lighting: nearby mapped points (15 m) or line coordinates within 2 m attach community assertions with OSM attribution. A nearby object's tag never becomes measured path illumination or known route coverage. Polygon/building tags are excluded. Object edit dates are not lighting survey dates.
- Measured lighting: January–March 2026 measurements remain unjoined because the coordinate reference system is unverified. They cannot establish current operation.
- Historical reports: only an exact published building name, including an explicit parenthesized building name in an address, can join an official building polygon containing a route endpoint. Future/invalid/flagged publication dates are omitted. No arbitrary address geocoding, proximity matching, crime rate, risk score or complete coverage is inferred. Disposition `Active` is historical case status.
- Emergency phones: official inventory points within 50 m attach their provenance; operation/access remain unknown.
- Weather: current NWS campus reference-area forecast/alerts can block for severe weather under the existing campus applicability policy; the fact explicitly says it is not an observed condition along the path. Stale or missing context remains unknown.

## Verification

Offline tests inject explicitly labeled provider responses. They cover successful geometry/instruction preservation, missing config without network calls, unsupported area, HTTP failures, secret-safe errors, no routes, wrong endpoints, disconnected steps, inconsistent metrics/timing, expiry, exact polygon crossing, future closure start, stale context, unverified lighting, conservative historical joins, weather blocks and phone uncertainty. A checked-in-data test reads the real local snapshots without remote calls. These tests are evidence of adapter/data behavior, not live routing completion.

Official contract checked during implementation: [Google Routes computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes).

API fields were checked against Google's official [computeRoutes REST reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes) on September 19: WALK mode, GEO_JSON_LINESTRING, route/step polyline and step staticDuration. This documentation check is not a live credential/service test.
