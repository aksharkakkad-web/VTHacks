# Beacon demo ride operator controls

This is a Beacon-operated transportation and payment simulation. It has no Uber
or Lyft affiliation, live dispatch, or vehicle GPS. Campus shuttle and independent
ride quote prices and durations retain their existing demo fixtures.

Set `BEACON_DEMO_RIDE_PROGRESS=true` and provide the existing server-only
`BEACON_PROVIDER_TOKEN` (16–4096 non-whitespace characters), then run
`bash src/agents/serve-demo.sh`. The service binds to loopback; the two bookable
providers display as **Beacon campus shuttle** (port 4312) and **Beacon demo ride**
(port 4313). Without the flag, their previous behavior and names remain unchanged.
The transit provider does not acquire ride controls. Never send the provider token
to a browser.

For hosted handlers, `hostedProvider` accepts `demoRideProgress` explicitly and
otherwise reads the same environment flag. Its store must implement the atomic
`advance` operation. `RedisBookingStore` supports this using compare-and-set with
the original record TTL preserved. In-memory standalone bookings last only for
that provider process; the hosted store preserves them across handler restarts.

## Operator endpoint

Send `POST /agent/demo-advance` to the provider that owns the booking. Authenticate
with `Authorization: Bearer <existing-provider-token>` and use JSON. `trip_id` is
the **provider booking ID**, not the Beacon journey ID. For example:

```json
{"trip_id":"<provider-booking-id>","stage":"approaching","pickup_eta_seconds":90}
```

The endpoint returns the normal `ProviderTrip` response, which the existing
status parser and trip monitor consume. Allowed progression is:

```text
assigned → approaching → arrived → in_trip → completed
```

Booking starts at `details.stage = "assigned"` with lifecycle `status = "waiting"`.
`arrived` means arrival at pickup, never proof of reaching home. The driver is
`Demo Driver`; the fictional vehicle is a blue `Beacon Demo` sedan or shuttle
with plate `DEMO-01`. These values are explicitly simulated.

For subsequent stages, send the same body without `pickup_eta_seconds`:

```json
{"trip_id":"<provider-booking-id>","stage":"arrived"}
{"trip_id":"<provider-booking-id>","stage":"in_trip"}
{"trip_id":"<provider-booking-id>","stage":"completed"}
```

To exercise provider failure and the coordinator's replanning path, send:

```json
{"trip_id":"<provider-booking-id>","stage":"cancelled"}
```

Cancellation is allowed from any active stage. Skipped/backward stages or attempts
to reactivate a terminal booking return 409. Identical current-stage events are
idempotent. Controls are disabled by default (404), and missing/wrong credentials
are rejected (401). The endpoint is an operator control, not a passenger booking
capability advertised in the public manifest.

## Countdown and settlement

Only the provider calculates the countdown, using actual elapsed whole seconds
from its persisted estimate baseline. Status reads and duplicate booking requests
do not reset that baseline. The countdown clamps to zero but **never** advances
the ride stage or claims a physical vehicle has arrived. Stage changes remain
explicit operator events; there is no secretly accelerated clock.

While `approaching`, an operator may report a different positive integer ETA
(up to 86400 seconds) with `pickup_eta_seconds`. This creates a new estimate
baseline. Repeating the current estimate does not restart it; omitting the field
preserves the remaining countdown. The API exposes monotonic `details.updatedAt`
timestamps for operator events and current countdown projections. Pickup ETA is
omitted once the trip begins or terminates. No vehicle position is fabricated.

Completion captures the full simulated authorized fare. Cancellation applies the
existing quote's simulated cancellation fee (zero by default). Both erase precise
pickup/destination data. Terminal status and settlement survive repeated events,
booking retries, and later cleanup; completing a ride does not refund it. Hosted
updates are atomic with cancellation, so a racing stage update cannot restore a
cancelled ride or its private coordinates. No real charge occurs.

Run `bash src/agents/test.sh --test-name-pattern='demo ride'` for the provider
tests, or `bash src/agents/test.sh` for the backend suite. HTTP lifecycle tests use
local ephemeral servers; the Redis concurrency test uses an injected command
transport, not a remote database.
