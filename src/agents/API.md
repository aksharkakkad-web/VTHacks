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
DEMO_MODE=true npm run dev -- --port 3100
# In a third terminal:
node src/agents/smoke.mjs
```

The smoke test drives HTTP routes, not just functions. Providers are separate HTTP
servers on loopback 4311–4313. Availability, costs, movement, cancellations, and SMS
are simulated. The current decision fallback is marked `DEMO_EVALUATION`; it is not
Databricks. Local identity trust is marked `LOCAL_DEMO_TRUST`; `providerVerified`
stays **false** until live ANS verification succeeds. `alertSent` stays **false** for
a simulated alert. Never show those as a live ANS badge or a delivered SMS.

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
      "name": "Maya", "phone": "+15555550100",
      "consent": true, "shareLocation": true
    }
  },
  "temporary_context": {"has_been_drinking": true}
}
```

The phone above is a reserved fictional demo value, never a real recipient.
Outside explicit demo mode, origin/home/budget must be supplied. Temporary constraints
also accept `max_budget`, `minimize_walking`, `minimize_transfers`, and `exhausted`.
Emergency flags (`immediate_danger`, `medical_emergency`, `serious_injury`) return
422 `EMERGENCY_HELP_REQUIRED`; surface emergency help immediately.

Errors are `{error:{code,message}}`. 401 means no session, 404 means missing or foreign
trip, 409 means wrong state/stale quote/busy trip, 403 means verification/policy denied,
and 503 means service configuration or availability. Do not display provider domains
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
provider cleanup leaves a durable task with only booking identifiers and TLS evidence;
the monitor retries it, including after arrival. Until cleanup succeeds, the status
reports cleanup pending. Overdue trips continue processing provider completion and
cancellation. Confirmed cancellation replans even if cleanup is temporarily unavailable.
Replacement pickup uses the latest location when it is at most two minutes old.
Quotes retain each provider's expiry for confirmation and booking. ETA uses
the selected plan; `BEACON_GRACE_MINUTES` defaults to five (configurable demo assumption).
Notifications require explicit contact consent; location is included only with separate
`shareLocation` consent. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
`TWILIO_FROM_NUMBER` enable real SMS outside demo mode. The outbox claim is persisted
before sending; ambiguous sends are flagged, not blindly retried. Accepted does not
prove delivered. Beacon is not emergency dispatch.

Vercel needs `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` and a scheduler
calling `POST /api/trips/monitor` with `Authorization: Bearer <BEACON_MONITOR_TOKEN>`.
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

- Replace the explicit demo decision seam in `student/decision.ts` with Akshar's
  `decisionEngine.recommend(plans, context)` after its real contract lands.
- Register callable Beacon providers using ANS; verify a live handoff and negative case.
- Provision shared hosted storage and a server-side scheduler before claiming Vercel monitoring.
- Verify live Twilio acceptance with an explicitly approved test recipient before claiming SMS.
- Run the deployed mobile demo with Rishit's UI; this PR does not implement UI.
