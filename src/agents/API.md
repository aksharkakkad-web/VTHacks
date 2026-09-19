# Mahin's backend integration contract

This implements the existing shared `Trip`/`CandidatePlan`/`Recommendation` types.
Rishit owns UI; Akshar owns the decision engine. Do not import Student Agent internals
into browser components. All trip routes return the `Trip` object directly, with
camelCase fields (`id`, not `trip_id`) matching `src/types/trip.ts`.

## Run the local demo

```sh
npm ci
# .env.local must contain DEMO_MODE=true. Keep all credentials out of Git.
bash src/agents/serve-demo.sh
# In a second terminal:
DEMO_MODE=true BEACON_ANS_MODE=local npm run dev -- --port 3100
# In a third terminal:
node src/agents/smoke.mjs
```

The smoke test drives HTTP routes, not just functions. Providers are separate HTTP
servers on loopback 4311–4313. Availability, costs, movement, cancellations, and alerts
are simulated. The trip runtime now calls Akshar's `evaluateTrip` adapter. Missing
or unavailable workspace credentials produce `LOCAL_POLICY_FALLBACK`; successful
validated SQL produces `DATABRICKS_EVALUATION`. `SIMULATED_TRANSPORT` labels fixture
quotes independently of the evaluation engine. Display the recommendation explanation
and these source/fallback distinctions. Local identity trust is marked `LOCAL_DEMO_TRUST`; `providerVerified`
stays **false** until live ANS verification succeeds. `alertSent` stays **false** for
a simulated alert. Never show those as a live ANS badge or a read Telegram message.
Set `BEACON_NOTIFICATION_MODE=simulated` when running the routine smoke test.
For a deployment that already has real Telegram enabled, run the smoke with
`BEACON_SMOKE_NO_CONTACT=true` instead: both synthetic trips omit the contact,
overdue is checked without sending, and the session's fixtures are reset in a
`finally` block. It does not test actual Telegram acceptance.

```sh
BEACON_SMOKE_URL=https://<existing-beacon-host> \
BEACON_SMOKE_LIVE_ANS=true BEACON_SMOKE_NO_CONTACT=true node src/agents/smoke.mjs
```

## Browser calls

1. `POST /api/trips` with `Content-Type: application/json` and the JSON below.
   The server sets an HttpOnly session cookie. Same-origin `fetch` keeps it automatically.
   Save this preference object in Rishit's existing onboarding store and send it on creation.
2. `POST /api/trips/:id/discover` with `{}` → quote list.
3. `POST /api/trips/:id/evaluate` with `{}` → `SELECTED` plus recommendation.
4. On **GO**, `POST /api/trips/:id/confirm`, then `/verify`, then `/request`.
5. Poll `GET /api/trips/:id` for current `Trip` and
   `GET /api/trips/:id/events` for a privacy-filtered technical timeline.
6. Foreground location: `POST /api/trips/:id/location` with `{lat,lng,recordedAt}`.
   Within 75 m of home, the trip arrives; only the most recent location is retained.
7. Manual confirmation of home: `POST /api/trips/:id/arrive` with `{}`.

```json
{
  "origin": {"lat": 37.229, "lng": -80.414},
  "preferences": {
    "home": {"lat": 37.221, "lng": -80.420},
    "maxBudget": 10,
    "walkingPreference": "minimize",
    "transferPreference": "minimize",
    "trustedContact": {
      "name": "Maya", "telegramChatId": "123456789",
      "consent": true, "shareLocation": true
    }
  },
  "temporary_context": {"has_been_drinking": true}
}
```

The chat ID above is a test fixture, not an approved live recipient. Use it only with
simulated notifications. Real contacts must start the configured bot and have their
private chat ID explicitly connected in server configuration. Phone-number contacts
are no longer accepted. Existing trips with legacy contacts must be recreated.
Outside explicit demo mode, origin/home/budget must be supplied. Temporary constraints
also accept `max_budget`, `minimize_walking`, `minimize_transfers`, and `exhausted`.
Emergency flags (`immediate_danger`, `medical_emergency`, `serious_injury`) return
422 `EMERGENCY_HELP_REQUIRED`; surface emergency help immediately.

Errors are `{error:{code,message}}`. 401 means no session, 404 means missing or foreign
trip, 409 means wrong state/stale quote/busy trip, 403 means verification/policy denied,
409 `NO_FEASIBLE_PLAN` means no option satisfies the approved constraints,
502 `BOOKING_UNCERTAIN` means the request may have been accepted. Keep polling the
same trip; do not create another trip to retry. The server checks the original request
without resending coordinates when the provider supports `reconcile_trip`. It books a
replacement only after that provider has confirmed cancellation of the original request.
Providers without reconciliation support require a manual status check and never trigger
an unconfirmed replacement. 503 means service configuration or availability. Do not display provider domains
in normal mobile UI; use `providerName`. The backend sanitizes upstream error strings.

## Demo and provider controls

`POST /api/demo/trips/:id/cancel-provider` cancels the active provider and performs
the replacement flow without another user decision. `expire-deadline` triggers the
overdue path. `POST /api/demo/reset` clears private state only for this session's trips.
All require the session cookie and explicit `DEMO_MODE=true`.

`POST /api/trips/:id/events` is a provider callback, **not** a browser state setter.
It requires `Authorization: Bearer <BEACON_PROVIDER_EVENT_TOKEN>` and
`{providerId,bookingId,event}`. Events are `provider.cancelled`, `provider.in_trip`,
or `provider.completed`; stale/mismatched bookings are rejected.

## Monitoring and deployment

Local Node runs a ten-second monitor while the server is running. Arrival removes
private origin/home/contact/current-location state and disables the deadline. Failed
provider cleanup leaves a durable task with only booking/request identifiers and TLS evidence;
the monitor retries it, including after arrival. Until cleanup succeeds, the status
reports cleanup pending. Overdue trips continue processing provider completion and
cancellation. Confirmed cancellation replans even if cleanup is temporarily unavailable.
Replacement pickup uses the latest location when it is at most two minutes old.
Uncertain booking requests retain the original deadline and continue overdue monitoring.
Replacement intent is persisted before recollecting quotes; an unavailable decision or
provider service is retried without losing the active deadline or repeating cancellation.
Manual or geofence arrival also works while booking status is uncertain; local private data
is erased immediately and cancellation by request ID is retried until it succeeds.
Quotes retain each provider's expiry for confirmation and booking. ETA uses
the selected plan; `BEACON_GRACE_MINUTES` defaults to five (configurable demo assumption).
Notifications require explicit contact consent; location is included only with separate
`shareLocation` consent. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, and
`BEACON_NOTIFICATION_MODE=telegram` enable real Telegram alerts. Notification mode is
independent of `DEMO_MODE`; real messages from demo trips are labeled `[Beacon demo test]`.
Only approved private chats are accepted; group/channel targets and usernames are rejected.
The outbox claim is persisted
before sending; ambiguous sends are flagged, not blindly retried. Accepted does not
prove read or acted on. Beacon is not emergency dispatch. The transport disables
paid broadcasts and link previews. See `TELEGRAM.md` for setup.

The Databricks handoff passes budget, walking/transfer preferences, excluded provider
IDs, expiry, and explicit simulated-source labels. It never receives coordinates,
trusted contacts, identity, free text, or the raw drinking/exhaustion flags. Those
temporary flags only strengthen the walking preference. Objectives are immutable
within a trip and remain version 0 during provider replacement. Quotes are checked
again after evaluation and before confirmation/booking.
Discovery quotes at most 15 providers (stable ID order), reserving one of the evaluator's
16 slots for walking. Additional omitted providers produce a `PROVIDER_LIMIT` event;
the result is not an exhaustive search of every registry entry.

Configure the server-only `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and
`DATABRICKS_WAREHOUSE_ID` for hosted SQL; `DATABRICKS_AUDIT_TABLE` is optional.
Never deploy a short-lived CLI token as a durable credential. This handoff does not
invent corridor IDs or walking estimates to call `getScheduledTransitOption`:
the current coarse origin/destination contract does not identify a supported itinerary.

Vercel needs the marketplace's `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or a complete
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` pair) and a scheduler
calling `POST /api/trips/monitor` with `Authorization: Bearer <BEACON_MONITOR_TOKEN>`.
The deployed Beacon environment uses the Free QStash `beacon-trip-monitor-v1` schedule
every two minutes; see `DEPLOYMENT.md` for its configuration and operational limits.
No browser interval or in-memory serverless timer is represented as reliable monitoring.
Without a shared store, hosted trip operations fail closed. Locally, `BEACON_STATE_DIR`
overrides the private file store in the OS temporary directory. The local store supports
one process and survives server restart, but OS temporary cleanup may remove it.

## Remaining integration gates

`BEACON_PROVIDER_TOKEN` is restricted to local demo providers. Public quote calls
never carry credentials. `BEACON_PROVIDER_CREDENTIALS` is an optional server-only JSON
object keyed by service ID, with `{baseUrl,token}` entries. Live calls receive a token
only after ANS identity verification and an exact identity/endpoint match. See
`src/agents/DEPLOYMENT.md` for hosted demo-provider setup.

- Akshar's `evaluateTrip` is connected. Configure approved hosted Databricks credentials
  to replace the explicit local fallback with live SQL in this deployment.
- Live ANS registration, deployed handoff/replacement, negative identity checks, and shared
  hosted storage are verified; see `IMPLEMENTATION.md` for the evidence and simulation boundaries.
- Hosted scheduling is connected; its real overdue/arrival verification is recorded in
  `IMPLEMENTATION.md`. The existing private Telegram contact also passed one separately
  authorized custom-alert acceptance test. Routine regressions must use simulated
  notifications or the no-contact mode above; API acceptance does not prove a message was read.
- Run the deployed mobile demo with Rishit's UI; this PR does not implement UI.
