# Backend integration contract — September 19, 2026

Akshar now owns backend coordination and Databricks integration, including Mahin's earlier backend handoff. Rishit owns the phone experience. No frontend changes are part of this backend follow-up. See [BACKEND_COMPLETION_PLAN.md](BACKEND_COMPLETION_PLAN.md) for the integrated verification and access blockers.

## Routing boundary

`src/lib/routing/google-routes.ts` exports `googleWalkingRoute({origin,destination})`. It returns `available` with versioned geometry, directions, seconds, meters, attribution and warnings, or `unavailable` with a controlled reason. It never ranks or books. `GOOGLE_ROUTES_API_KEY` stays server-side; `BEACON_GOOGLE_ROUTES_ENABLED=true` is a separate explicit activation switch. Access and billing are pending. Tests use injected HTTP responses, not a real Google account. No billable call has been made by these tests.

The complete-journey evaluator now uses `src/lib/decision-client/walking-router.ts`, which preserves exact Google geometry, instructions, attribution, warnings and validity, and joins evidence through the planner. The earlier `src/lib/routing/google-routes.ts` adapter remains a compatibility interface, not a second routing authority for the same journey. Both recognize the explicit Google activation flag. Google geometry alone does not establish lighting, public access or known-closure clearance. The existing mapped campus path remains its own source; it must not be drawn as a vehicle route. Do not substitute a Google walking duration into an already approved journey without reevaluation and fresh consent.

Protocol references: [Compute Routes request and response](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [route request example](https://developers.google.com/maps/documentation/routes/compute_route_directions).

## Shared journey and provider status

The additive `beacon-journey-v1` contract lives in `src/lib/journey/contracts.ts`. A journey revision binds the selected plan/offer, mapped route version, replacement count and budget liabilities. The owner-scoped journey response is the atomic source for presentation and approval; do not join a plan card from one poll with an offer from another.

Create trips with `journeyContract: "beacon-journey-v1"`. Read `journey.nextStep` for the current instruction and `journey.complete` for the evaluated legs/evidence. Show a map only when the current `nextStep.showMap` is true, using that exact route. Show pickup ETA, driver and vehicle details from `ride`, never fabricated motion or a vehicle map. Empty fields remain unavailable. See [JOURNEY_COORDINATOR.md](JOURNEY_COORDINATOR.md).

Walking totals from a provider are not automatically pickup or dropoff legs: their allocation is explicitly unknown until the routing service and provider supply endpoints. Waiting/pickup points, access, directions and driver/vehicle details stay null when absent. Duration units are seconds; money is integer USD cents.

Providers may add `details` to the existing trip response: `stage`, `pickupEtaSeconds`, `meetingInstructions`, `driver.displayName`, `vehicle.{make,model,color,licensePlate}`, and timezone-qualified `updatedAt`. Supported stages are searching, assigned, approaching, arrived, in_trip, completed, cancelled and unknown. The existing top-level trip status remains the transport protocol's lifecycle field. `arrived` in provider details means arrival at pickup, not arrival home. Missing detail never creates a driver assignment, moving vehicle or zero-minute ETA. Status must originate in a provider event or status response; the frontend must not advance it using timers.

The `lyft-demo` service is a **Lyft-style developer example operated by the Beacon demo team**, with simulated rides and payments. There is no verified real Lyft booking/sandbox access in this implementation. An application form or client registration alone does not prove ride-booking permission.

The selected external demo integration is now **Uber Guest Rides sandbox**, through the internal `uber-guest-sandbox` provider. It requires explicit demo enablement, a scoped server token, active sandbox run and verified test guest. See [UBER_SANDBOX.md](UBER_SANDBOX.md). This is not production Uber access, ANS verification of Uber, or a real payment. Without configuration it remains disabled; local Beacon providers remain separately labeled simulations.

## Arrival and monitoring

The arrival policy requires a 75-meter destination area, accuracy at most 30 meters, the entire reported uncertainty circle inside the area, at least three samples spanning 30 seconds, no sample gap over 20 seconds, and sample age at most 30 seconds. These are configured demo policy thresholds, not a claim of guaranteed GPS accuracy. Missing/poor location resets dwell; manual arrival remains available. Provider ride completion is tracked separately from proof of reaching home.

The independent monitor command is `node tools/beacon-monitor/monitor.mjs`. Its private config defaults to `~/.config/beacon-demo/monitor.env` containing `BEACON_BACKEND_URL` and `BEACON_MONITOR_TOKEN`. It calls the authenticated backend monitor and needs no location stream or model login. Production needs an always-on scheduler; neither mobile background GPS nor a Vercel process interval is a reliability guarantee. This command alone does not claim a deployed scheduler has been configured.

## Context service and planner configuration

- `BEACON_CONTEXT_AGENT_URL`: self-operated service base, ending in `/api/demo/context-agent` for the bundled handler.
- `BEACON_CONTEXT_SERVICE_TOKEN`: separate bearer shared only with that service, at least 32 characters.
- `BEACON_CONTEXT_SOURCE_LOOKUP=true`: opt-in bounded retrieval of fixed official pages. This is not generic web search.
- `BEACON_CONTEXT_PEER_ALLOWLIST`: comma-separated compatible ANS peer IDs; empty means no delegation.
- `BEACON_CONTEXT_PEER_CREDENTIALS`: server JSON array of `{id,ansId,baseUrl,token}` entries. Tokens are matched to exact discovered identities/endpoints, never broadcast during discovery.
- `BEACON_LYFT_DEMO=true`: include the additional developer example while retaining existing fixtures.
- `BEACON_PROVIDER_ORIGIN`: optional reachable hosted provider origin; no laptop loopback URLs on Vercel.

The context request is strictly `{version,requestId,corridorId,topics,evaluatedAt}`. Exact passenger location, contact information and arbitrary URLs are rejected. Compatible peers require identity verification and explicit scoped credentials. Delegation stops after one hop and two peers. Source-page leads never become ranking evidence automatically.

## Rishit integration follow-up

The already committed connected PWA slice needs a separate frontend follow-up: use the atomic journey response; suppress approval while revisions mismatch; refresh authoritative state even when activity polling fails; reconcile after partial confirm/verify/request failures; display payment decline, cancellation terms, retained fees and remaining budget; gate actions by actual state; honor reduced motion for programmatic scrolling. Those review findings are not being silently treated as completed frontend work.
