# Beacon exact walking route integration — contract and source audit

Read-only audit, September 19, 2026. Scope: checked-in provider/shared contracts, documented endpoint agreement, and official Google Routes/decoder sources. No provider calls, credentials, package changes, server restarts or shared source edits. Other integration work is proceeding concurrently; this describes the inspected source, not an agreed new backend schema.

## Decision

**The existing backend contract cannot yet supply an exact walking map.** Build a strict renderer/adapter boundary, but keep geometry unavailable until the backend supplies a real route or the team approves a sourced replay fixture. Do not turn minute estimates, origin/destination points or frontend illustration paths into a claimed route. Waiting and riding use status cards. A map requires an explicitly active walking leg plus valid geometry for that leg.

## What exists now

| Source | Supported response/request | Missing for this request |
|---|---|---|
| `src/types/provider.ts` | Candidate ID, provider identity/name, mode, availability, cost, wait/travel/walking/total minutes, optional transfers/reliability/context, verification requirement | Geometry, directions, meters, route source/time, exact endpoints, route/leg identity |
| `src/types/trip.ts` | Trip ID/state, candidates/selected plan/recommendation, verification/release flags, expected arrival/deadline, last-known location with `recordedAt`, alert/status text | Active leg identity/mode/status, provider timestamp/revision, route evidence, booking/payment reconciliation fields |
| `src/types/recommendation.ts` | Plan selection, reason codes/explanation, evaluation time | Route evidence; evaluation time is not geometry freshness |
| `src/agents/contract.ts` | Coarse zone quote request; exact `TripRequest` pickup/destination points; provider result `{id,status}` | All walking route fields, pickup instructions, timestamps and progress evidence |
| `normalizeQuote` | Validates expiry when present and extracts scalar cost/time metrics | Drops `expires_at` and `simulated`; future route fields would also be dropped |
| `parseProviderTrip` | Accepts `accepted`, `waiting`, `cancelled`, `in_trip`, `completed`; returns only ID/status | Cannot preserve geometry/instructions/source/freshness from a provider response |
| `src/agents/discovery.ts` | Aggregates provider quotes and appends a walking candidate | Walking defaults to 22 minutes and has no route calculation; it is not route evidence |

`ProviderDescriptor.source` distinguishes ANS versus demo discovery. It does not identify a map data source. `Trip.lastKnownLocation.recordedAt` describes location freshness, not route calculation time.

### Implemented provider HTTP operations

`src/agents/demo-provider.ts`, `http-provider.ts` and `serve-demo.ts` implement these local/demo boundaries:

- `GET /.well-known/agent-card.json`: metadata/capabilities and simulated label.
- `POST /agent/quote`: coarse zones/constraints → quote scalars, expiry and simulated label before normalization.
- `POST /agent/request-trip`: trip ID plus exact points → provider ID/status; idempotent per trip ID in the in-memory demo provider.
- `GET /agent/trip-status/:id`: provider ID/status.
- `POST /agent/cancel-trip`: cancellation result; the current client discards its response and returns void.

Demo providers use ports 4311–4313. Transit advertises quote/status only, so do not infer reservation support. Demo state does not independently progress from waiting into riding/completed; the inspected implementation only creates and cancels trips.

There was no `src/app/api` directory or Next route handler at audit time. `TEAM_CONTRACT.md` proposes POST `/api/trips` plus `/api/trips/:id/{discover,evaluate,confirm,verify,request,events,location,arrive}` and demo control routes; it explicitly says they are not implemented. It does not define a GET current-trip endpoint, SSE subscription, walking-route response, or frontend polling agreement. Do not invent those as existing APIs.

`docs/ui-research/integration-notes.md` is partly stale: no trip API is still accurate, but provider agent source now exists. `src/agents/IMPLEMENTATION.md` is a plan with unchecked items, not runtime proof, and its old automatic-replacement wording must not override the newer screen map's fresh confirmation rule.

## Missing agreements and recommended boundary

The following is a **proposal for backend-owner agreement**, not a mutation of frozen shared types:

1. **Authoritative snapshot and commands.** Mahin supplies the actual trip read/subscription endpoint, authenticated ownership, revisions, update times and command responses. Command receipt is not trip completion. Polling may request the next snapshot; elapsed frontend time must never synthesize verification, booking, boarding, arrival, cancellation or provider failure.
2. **Active segment.** Response identifies a stable active leg/segment ID, explicit mode and status. `plan.mode` alone is insufficient because a transit/rideshare journey can contain an active walk-to-stop/pickup segment. Define when the backend declares the walking segment complete; frontend does not infer it from timer or distance alone.
3. **Walking evidence.** Stable route ID/revision, leg ID, exact geometry representation and precision/order, directions in order, backend distance meters and duration seconds, source/provider, calculated/retrieved timestamp, freshness/expiry rule, warnings and attribution. Explicit absence/staleness stays unavailable; do not substitute zero or refresh timestamps locally.
4. **Geometry invariant.** Polyline and steps must refer to the approved active walking leg. Do not draw the selected vehicle journey using a walking alternative. Preserve backend coordinate sequence; display projection/fit-to-bounds is allowed, but frontend rerouting, smoothing, invented intermediate points and deriving duration from geometry are not.
5. **Unknown values.** Missing step distance/duration/instruction remains unknown. Use backend totals; do not silently sum partial steps as authoritative totals. Show directions as text, not executable markup.
6. **Privacy.** Preserve coarse quote requests and the verified-and-authorized precise-location gate. A separate routing service disclosure requires an explicit server-side decision; a maps integration must not quietly send exact addresses/location from the browser during discovery. Provider trusted-contact disclosure remains disallowed.

Minimal UI condition: backend says active leg is walking, leg is in progress, matching route exists, payload validates, and source display is supported. Otherwise show the status card plus a specific route-unavailable/stale explanation. A local clock may label elapsed freshness, but must not change trip state or fabricate new backend timestamps.

## Google Routes: precise field mapping

Official REST request is `POST https://routes.googleapis.com/directions/v2:computeRoutes`; a field mask controls the response. Use server-side credentials and `travelMode: WALK` for a standalone walking calculation. `polylineQuality: HIGH_QUALITY` requests more detailed returned geometry than default overview; neither makes the result surveyed ground truth. `polylineEncoding` supports `ENCODED_POLYLINE` or `GEO_JSON_LINESTRING`. [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions), [Polyline options](https://developers.google.com/maps/documentation/routes/traffic_on_polylines)

| Needed information | Google response field |
|---|---|
| Exact returned route line | `routes.polyline.encodedPolyline` or `routes.polyline.geoJsonLinestring` |
| Exact returned leg/step line | `routes.legs.polyline`, `routes.legs.steps.polyline` |
| Total meters / time | `routes.distanceMeters`, `routes.duration` (protobuf duration string such as `165s`) |
| Walking step text/icon | `routes.legs.steps.navigationInstruction.instructions` / `.maneuver` |
| Step metrics | `.distanceMeters`, `.staticDuration`; either can be absent |
| Segment mode/endpoints | `.travelMode`, `.startLocation`, `.endLocation` |
| User-visible cautions | `routes.warnings` and relevant step/leg advisories |

Use an explicit production field mask, not `*`. For mixed transit, `legs` are waypoint-to-waypoint; step `travelMode` identifies walking versus transit. The backend must group/identify the active walking portion, rather than frontend treating the entire transit leg as walk. Google's route response does not establish Beacon's trip state, route freshness policy or a provider event timestamp; Beacon's backend must attach provenance and retrieval time honestly. [REST response schema](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [Response hierarchy](https://developers.google.com/maps/documentation/routes/understand-route-response)

## Google display and retention requirements

- Standard Routes API terms permit results without a map, but prohibit using the content with a non-Google map. Google route geometry on Mapbox/Leaflet/OSM or a custom campus map is therefore not a permitted default. Treat a geographic SVG route preview as a map for implementation planning; do not assume removal of base tiles exempts it. A Google Map is the straightforward supported display. This last SVG treatment is a conservative implementation interpretation of the rule. [Service terms §19](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- For text-only directions/metrics, keep Google Maps attribution next to the content. Prefer its official logo; where space is limited current policy permits exact text “Google Maps,” unwrapped/untranslated, 12–16sp, with adequate contrast. Do not hide built-in attribution or omit supplied third-party attribution. The response guide also specifies a Google copyright statement; preserve applicable copyright/source notices rather than inventing a generic map footer. [Attribution policy](https://developers.google.com/maps/documentation/routes/policies), [Response copyright guidance](https://developers.google.com/maps/documentation/routes/understand-route-response)
- Google documents walking routes as beta and requires displaying its warning about potentially missing sidewalks/pedestrian paths. Preserve returned warnings as well; route geometry is not a safety guarantee. [Travel-mode warning](https://developers.google.com/maps/documentation/routes/route-opt)
- Do not bake Google response payloads into Git or service-worker offline caches as a blanket fixture strategy. Current standard service terms specifically allow temporary latitude/longitude caching up to 30 days; that is not unlimited permission to persist all route content. EEA billing accounts have different terms; account jurisdiction was not inspected. [Routes policies](https://developers.google.com/maps/documentation/routes/policies), [Service terms §19.3](https://cloud.google.com/maps-platform/terms/maps-service-terms)

## Decoder recommendation: no package change needed

Inspected official `googlemaps/js-polyline-codec` at commit `d0b4f42f6409d7e4d68f317578cf23c61c5ed939`: Apache-2.0 licensed, compact TypeScript decoder, precision defaults to 5 and returns `[latitude, longitude]` tuples. Tests cover the published three-point example, precision 0/6, negatives, escaped slashes and roundtrips. [Pinned implementation](https://github.com/googlemaps/js-polyline-codec/blob/d0b4f42f6409d7e4d68f317578cf23c61c5ed939/src/index.ts), [Tests](https://github.com/googlemaps/js-polyline-codec/blob/d0b4f42f6409d7e4d68f317578cf23c61c5ed939/src/index.test.ts), [Apache license](https://github.com/googlemaps/js-polyline-codec/blob/d0b4f42f6409d7e4d68f317578cf23c61c5ed939/LICENSE)

Prefer a backend-decoded coordinate array/GeoJSON if backend agreement allows it; that avoids a browser decoder entirely. If encoded polyline is the agreed payload, adapt only the small `decode` routine locally, retain copyright/license/attribution and record modifications. No dependency addition is necessary. Wrap it with Beacon-specific validation: bounded input/point count, valid encoded characters, terminated latitude/longitude groups, bounded shifts, finite latitude/longitude in range and at least two points for a line. The upstream optimized routine does not validate malformed/untrusted input on its own. GeoJSON uses `[longitude, latitude]`; do not confuse it with the decoder tuple order. Add targeted malformed-input and coordinate-order tests alongside the canonical vector. Decoding preserves supplied geometry; it does not verify the physical route or fill missing directions.

## Ownership and secret-free preview

- Mahin owns provider/trip API and authoritative state; Akshar owns recommendation/data. Rishit owns presentation and maps integration. `TEAM_CONTRACT.md` still marks shared contracts/frozen demo values as requiring team reconciliation.
- Current numeric samples disagree across layers: provider demo Campus Ride $0 / independent ride $7, while the completed UI fixtures use $2 / $8.40. This audit does not choose or overwrite either. Neither layer contains a sourced walking polyline/direction fixture.
- An approved, independently owned coordinate/step fixture can be rendered locally without a network credential, labeled with its actual sample source/time and never presented as live. The team must supply or approve it; do not invent “agreed” Blacksburg coordinates/directions.
- A supplied Google payload can be decoded and tested without calling Google. Without an existing permitted Google map credential, show attributed directions/metrics or a non-geographic developer coordinate table; do not render it over the current custom/Mapbox map. Google's public decoder vector is suitable for a decoder unit test only, not a campus route sample.
- Until a sourced payload arrives, exact-route unavailability is the truthful preview. This does not block wiring strict input validation, active-walking gating, waiting/riding cards, or the UI adapter against explicit proposed test fixtures that are clearly not backend approval.

## Provider-source correction

The user confirmed there is **no Lyft access**. The provisional UI adapter now uses `providerSource: 'simulated-rideshare' | 'connected-provider' | 'unknown'`, with labels “Simulated rideshare · Demo data,” “Ride provider,” and “Provider source not confirmed.” This is presentation provenance only; it does not add any live provider integration. Browser verification asserts neutral labels and absence of Lyft claims. All current response controls remain explicit provisional fixtures while the real backend agreement is pending.
