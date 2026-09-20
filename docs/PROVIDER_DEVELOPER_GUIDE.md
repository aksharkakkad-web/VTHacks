# Build a Beacon-compatible provider agent

The MVP speaks `beacon-mobility-v2`, Beacon's application profile over HTTP. ANS is the operator/endpoint identity layer. It does not provide platform API access, authorize spending, establish a transport-brand partnership or certify a journey as safe.

The reference services are **Beacon-operated simulated transportation**. They are independently callable services, not independent transport companies. No Uber, Lyft, Amtrak or payment processor integration is included.

## Supported first slice

Use a unique stable `serviceId` (lowercase letter followed by up to 63 lowercase letters, digits, `_` or `-`). Mode is separate: `campus_ride`, `independent_ride` or quote-only `transit`. Two services can share one mode. A registered service's provider ID is `<ANS registration ID>:<serviceId>`.

Publish one ANS `HTTP-API` endpoint for the operator. For each service, advertise functions such as `evening_shuttle.quote_trip`, tagged `beacon-mobility-v2`, `service:evening_shuttle` and its mode. The service endpoint is the registered endpoint plus `/evening_shuttle`. `operatorEndpoint(origin, "beacon-mobility-v2", descriptors)` generates this catalog; registration itself is a separate operation. Existing v1 registrations/quotes remain supported, and a v1-discovered service can negotiate a valid v2 envelope. Unknown profiles fail closed.

Every ride service needs `quote_trip`, `request_trip`, `trip_status`, `cancel_trip` and `reconcile_trip`. Transit does not receive precise student coordinates or book through this contract. New modes, currencies, estimated/incomplete fares and real payments need a separate contract version.

## Wire operations

| Operation below the service endpoint | Request | Response |
| --- | --- | --- |
| `GET /.well-known/agent-card.json` | Public | `ProviderManifest` |
| `POST /agent/quote` | Public coarse `origin_zone`, `destination_zone`, `constraints` | `{manifest, offer}` |
| `POST /agent/request-trip` | Authenticated `{trip_id, pickup, destination, offer, grant}` | `{id, status, payment}` |
| `GET /agent/trip-status/:id` | Authenticated | `{id, status, payment}` |
| `GET /agent/request-status/:requestId` | Authenticated | `{trip: null}` or `{trip: {id, status, payment}}` |
| `POST /agent/cancel-trip` | Authenticated `{trip_id: bookingId}` | Actual terminal booking/payment result |
| `POST /agent/cancel-request` | Authenticated `{request_id}` | Fence delayed execution; return actual terminal result |

Schemas are defined in `src/agents/provider-manifest.ts`, `src/agents/contract.ts` and `src/lib/authorization/booking-grant.ts`. Shared examples are in `src/agents/fixtures/provider-network-v2.json`; their fixed timestamps and illustrative quote IDs cannot be booked against a running service.

An offer has one complete fixed USD price in integer minor units, a quote ID, issue/expiry timestamps (at most 120 seconds), cancellation fee, pickup instructions and burden values. Unknown transfers are omitted. Unknown pickup access remains `false`; lighting, companionship and indoor waiting must not be invented. Beacon verifies service area and capabilities, converts minor units to the existing dollar `CandidatePlan.cost`, and keeps the private plan-to-offer mapping outside Databricks. Databricks chooses the plan; it never mints payment grants.

## Identity and booking permission

ANS discovery is untrusted input. Beacon validates registry evidence and TLS identity, pins the registered HTTPS endpoint, and never follows a manifest-supplied replacement URL. Public quotes carry no credential. Configure a separate strong server credential for each independently operated provider using `BEACON_PROVIDER_CREDENTIALS` keyed by provider ID and exact base URL. The shared `BEACON_PROVIDER_TOKEN` applies only to local demo endpoints.

For v2, use a random credential with at least 16 characters (32 random bytes encoded as hex is suitable). Beacon and the provider share this MVP credential. The request uses bearer authentication plus a short-lived `beacon-hmac-v1` grant bound to issuer, recipient, `book_trip` scope, request ID, quote ID, payload hash, fixed amount, USD and simulation. A hash binds the precise pickup/destination without embedding them in grant claims. The provider checks its own quoted terms as well; the reference provider signs the immutable fixture offer in its quote ID.

The shared-secret scheme proves possession of configured service credentials. It is not OAuth, asymmetric nonrepudiation or proof that Beacon can use a third-party platform. Provider developers are responsible for obtaining permitted platform access. Never ask students to paste platform keys into Beacon.

The student confirms the displayed `planId` and `quoteId`. Beacon rechecks freshness, remaining budget and consent immediately before release. Only the chosen verified-and-authorized service receives pickup/destination. The provider never receives contact details, impairment statements, the whole profile or the internal consent ID. Grants, tokens and coordinates stay out of logs, browser evidence and Databricks.

## Persistence, retries and settlement

Persist the booking and a request fingerprint atomically. Exact request retries return the same logical booking; a reused ID with changed quote or coordinates fails. Never make a second transport booking because the HTTP response was lost. Reconciliation uses request ID without resending coordinates.

A missing request lookup is insufficient to replan. `cancel-request` must install a durable cancellation tombstone before acknowledging. The hosted reference store uses Redis `SET NX`, a deterministic provider/request key, and atomic Lua cancellation/erasure. Its records and tombstones expire after 24 hours; this is a demo retention bound, not an indefinite deduplication guarantee. The local reference server uses process memory and loses its bookings on restart.

Payment states are simulated `authorized`, `captured`, `voided`, `refunded` and `unknown`. They never charge real money. Cancellation must report settlement; an active booking or HTTP timeout cannot release budget. Unknown results reserve the full original amount. Confirmed cancellation fees remain spent; pending refunds do not count as available budget. Privacy cleanup of a completed booking must retain its captured payment and completed status.

Beacon recommends a replacement automatically, then requires another confirmation. It retains overdue monitoring while waiting. A declined payment returns a clear action and does not start monitoring a fictitious first ride. Arrival erases local private data immediately and retries provider cleanup until terminal confirmation succeeds.

## Local verification

Set the same random test `BEACON_PROVIDER_TOKEN` in both provider and app terminals. Start `bash src/agents/serve-demo.sh`, then the app with `DEMO_MODE=true BEACON_ANS_MODE=local BEACON_NOTIFICATION_MODE=simulated npm run dev -- --port 3100`. Run `BEACON_SMOKE_NO_CONTACT=true node src/agents/smoke.mjs`.

Run `bash src/agents/test.sh` for real loopback HTTP conformance, including three configured same-mode service instances. Adding those instances requires no Student Agent platform-specific branch. Production hosting still needs shared Redis, ANS/scoped credentials and an external authenticated monitor; local tests do not verify those deployed settings.

Final observations use Akshar's existing `ProviderOutcome` schema with a new random observation ID, allowlisted times/status, and `source: simulated`. They exclude trip/booking IDs, coordinates, contacts and free text. An immutable outbox retries the same observation. Optional `DATABRICKS_PROVIDER_OUTCOMES_TABLE` activates ingestion only with existing workspace credentials and a pre-provisioned table. Without it, observations remain in the private trip store for its retention period; no cloud ingestion is claimed. Simulated rows are excluded from real reliability calculations.
