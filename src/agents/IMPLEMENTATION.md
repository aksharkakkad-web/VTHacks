# Mahin's Beacon implementation plan

Owner: Mahin. Source: the build-locked PRD and phase plan in `docs/`.
No shared type, UI, or Databricks ranking changes are planned.

## Delivery slices

- [x] Provider contract: validated coarse quotes, three independently callable HTTP providers,
  walking candidate, timeout isolation, deterministic demo fixtures, provider status/cancellation.
  Files: `src/agents/{contract,http-provider,demo-provider,discovery}.ts`, provider tests.
- [ ] ANS: registry discovery/resolution, verification evidence, fail-closed authorization,
  explicit local-demo trust, registration setup/runbook and live interoperability probe.
  Files: `src/integrations/ans/**`, `src/lib/authorization/**`.
- [ ] Student Agent: persisted trip state, confirmation, verified coordination, idempotency,
  bounded recovery with fresh candidates and Akshar's decision adapter, audit events.
  Files: `src/agents/student/**`, `src/lib/trip-state/**`.
- [ ] HTTP integration: frozen trip/demo paths returning the shared `Trip` contract;
  authenticated trip ownership and provider callbacks, validated JSON, error responses.
  Files: `src/app/api/trips/**`, `src/app/api/demo/**`.
- [ ] Monitoring: current location only, home geofence, expected arrival plus configurable
  grace, server polling, consent-aware notification outbox, no alert after arrival, no duplicates.
  Files: `src/lib/trip-state/**`, `src/integrations/notifications/**`.
- [ ] Integration: current-main fetch/rebase, real HTTP demo, all regression checks, clear
  real-versus-demo report, PRs with exact commands and remaining external setup steps.

## Test and version-control procedure

For each slice write behavioral tests first, run `bash src/agents/test.sh`, implement,
then rerun tests and `npx next typegen && ./scripts/pre-pr.sh`. Tests compile using the
existing TypeScript dependency and run with Node's test runner; no package changes.
Before publishing, fetch/rebase `origin/main` and inspect other open PRs for overlap.
Keep commits scoped by behavior and PRs in dependency order. Respect teammate review
and branch protection; never bypass a required review.

## Evidence required before completion

- Quotes contain zones and constraints only, never exact location, contact, or trip ID.
- Invalid, stale, unavailable, out-of-budget and nonmatching-provider responses are rejected.
- Confirmation, verified identity, and allowed capabilities all precede precise release.
- Cancellation replaces the provider within approved constraints without a second user action.
- Arrival ends provider access and cancels monitoring; overdue sends at most one accepted alert.
- Live ANS registration/discovery/verification is proven separately from pretrusted demo mode.
- All published contracts stay compatible with current UI/decision-engine work.

## Current setup facts

The starting commit is `df29f8c`. No provider, trip API, ANS, or Databricks implementation
exists there. ANS credentials are now saved locally and a user-owned domain is available;
full UI/Databricks/SMS integration remains pending. The phase plan requires
overdue monitoring even though the PRD labels it P1; implement the stronger phase gate.
Use the shared `SELECTED` state for awaiting confirmation; do not add a new shared state.
Default monitoring grace will be configurable (five minutes for the local demo), explicitly
documented as a local default rather than a claimed team decision.

References inspected: Databricks AI Dev Kit, agentnameservice/ans-registry,
agentnameservice/ans, agentnameservice/ans-sdk-go, agentnameservice/agent-trust-discovery,
and the live Webmesh AI catalog. Trust Index scores are advisory; they cannot substitute
for identity verification or Beacon's authorization policy.

## Verified local checkpoint (2026-09-19)

41 behavioral tests pass, including operator service discovery, Redis environment selection, lost-response reconciliation, delayed-request
cancellation, uncertain-booking arrival cleanup, preserved overdue deadlines, and
replacement recovery after an outage or interrupted checkpoint.
The production-build HTTP smoke on the reconciliation branch exercises session ownership,
confirmation, local pretrust, Campus Ride booking, automatic Independent Ride replacement,
geofence arrival, private-state cleanup, and one simulated overdue alert. Production Next.js
build, lint and typecheck pass. Mahin's checkpoints A/B/D/F are ready for integration;
D/F use live ANS and HTTP handoff with the explicit demo decision seam.
Databricks, custom Beacon SMS, and deployed UI verification remain open.

## Hosted provider and registration slice

Three opt-in Next.js provider routes now implement the same wire contract and use
Redis for idempotent bookings and durable cancellation tombstones. ANS discovery
keeps separate service IDs beneath one HTTP-API endpoint advertised by a registered operator;
this does not represent separate verified businesses. Public quotes remain unauthenticated,
and booking tokens are scoped to a verified service ID and exact endpoint.

The live ANS resolution API resolved Webmesh on 2026-09-19. Full verification correctly
rejected its TLS fingerprint: the live certificate differed from the certificate still
listed in its ANS badge. This is a negative interoperability result, not a successful
Beacon identity verification. The subsequent Beacon registration succeeded using a local
identity CSR, the actual Vercel TLS certificate, and one HTTP-API endpoint with namespaced
per-service functions. GoDaddy rejected the earlier three-endpoint form because protocols
must be unique. Required TXT records were published through Vercel; domain validation
and DNS verification completed, and registration `f4e9c454-3e63-453b-b823-d15a6ff87311`
is ACTIVE. Private keys and request/response evidence remain in Git-ignored storage.

The application directory now uses the official SDK's `/v1/agents` search and its
`agents[]` / `status` response shape. The separate console search surface rejected
`HTTP-API`. A live application-code probe discovered all three services and verified
each against ANS resolution, the published DNS badge, trusted transparency evidence,
and the actual HTTPS leaf fingerprint. Negative live probes rejected a substituted
registration ID and a mismatched certificate pin before application data was sent.

The deployed HTTP trip smoke passed on production commit `5463eba` with
`BEACON_ANS_MODE=live`: quote collection, confirmation, verified Campus Ride booking,
autonomous verified Independent Ride replacement, geofence arrival, private-state cleanup,
one simulated overdue alert, session guards, callback rejection, and reset. Both provider
selections emitted `ANS_VERIFIED`; neither used local-demo trust. An older local server
sharing Redis was stopped after its monitor conflicted with the first smoke's final reset;
the complete rerun then passed. Recommendation scoring, rides, and SMS remain simulated.
Custom Beacon SMS, Databricks integration, and Rishit's deployed UI
remain open; checkpoints C/E/G are not marked ready.

## Verified Upstash setup (2026-09-19)

The Vercel `beacon` project is linked to the user's Upstash Free database for production,
preview, and development. The integration supplies `KV_REST_API_URL` and
`KV_REST_API_TOKEN`; both trip and provider stores accept this pair, while preserving
explicit direct Upstash configuration as an alternative. Credentials remain outside Git.

A live Redis probe passed PING, cross-instance trip reads, exclusive update leases,
TTL preservation, provider cleanup, and cancellation tombstones that block replay.
The synthetic probe records were removed. The production Next.js HTTP smoke also passed
against this live Redis database with local simulated providers: booking, replacement,
arrival cleanup, session guards, and one simulated overdue alert. This proves the database
and store operations. Subsequent deployed-trip and hosted-scheduler evidence is recorded
in the other verification sections of this document.

## Verified hosted setup and Twilio boundary (2026-09-19)

The production Vercel deployment and custom backend domain are active. Live provider
HTTP checks passed for all three public metadata and quote routes, unauthenticated booking
rejection, authenticated booking and lookup, idempotent retries, cancellation, and replay
prevention. Redis inspection confirmed precise provider data was erased on cancellation.
These remain simulated transportation services, independent of their real hosting/storage.

The saved Twilio credentials authenticate to an active Trial account. One authorized
trial-template SMS returned HTTP 201 with status queued; delivery was not verified.
The current trial allows predefined templates only, so it cannot send Beacon's custom
overdue alert body. Full alert acceptance requires an upgraded account and eligible sender.
No paid upgrade or phone-number purchase was made. With `DEMO_MODE=true`, Beacon's alert
events still remain simulated even when Twilio credentials are configured.
See [Twilio's trial restrictions](https://www.twilio.com/docs/usage/trials#pre-defined-content).

## Verified hosted monitoring (2026-09-19)

The existing Vercel/Upstash installation now includes `beacon-monitor`, a QStash Free
resource in US East. Schedule `beacon-trip-monitor-v1` is active and invokes the authenticated
production monitor every two minutes. The endpoint returned 401 without its credential
and 200 with it. This uses real hosted scheduling; no local server or mobile timer is needed.

Two synthetic trips were started through the deployed API with live ANS-verified bookings.
Their test deadlines were accelerated in Redis to `2026-09-19T06:19:47.939Z`; one trip
was marked arrived before that deadline. No manual monitor call or demo expiry action was
used after fixture setup. The scheduled invocation at 06:20 UTC moved the other trip to
OVERDUE at `06:20:00.683Z` and recorded its single simulated alert at `06:20:00.687Z`.
The next scheduled invocation at 06:22 UTC also reported SUCCESS; the alert count remained
one. The arrived trip retained ARRIVED, had no alert, and had no private location/contact state.
The probe then ended the overdue trip, verified cleanup, and removed only its two synthetic
trip records. Private operator evidence is retained locally in ignored `.vercel/monitor/`.

This closes the hosted scheduling gap, including operation without browser activity.
It does not close checkpoint E's real SMS requirement: `DEMO_MODE=true` still records
simulated notifications. The remaining live integration gates are custom Beacon SMS,
Akshar's Databricks adapter, and Rishit's deployed mobile flow. QStash remains on Free;
the cadence and delivery limits are documented in `DEPLOYMENT.md`.

## Databricks handoff integration (2026-09-19)

Integrated Akshar's `cdb4ff6` branch without editing its decision/data modules. The trip
runtime now calls `evaluateTrip` for initial selection and provider replacement. It
allowlists ranking context, carries simulation/expiry separately from shared types,
preserves immutable objectives and exclusions, and rechecks expiry after evaluation.
An expired evaluation returns to a refreshable state. Discovery reserves one of the
16 evaluator slots for walking and explicitly reports omitted providers.

Validation: 49 agent/backend tests, 30 Databricks track tests, and the repository
lint/checkpoint/typecheck/production-build checks passed. The production-build HTTP
smoke at localhost:3200 exercised live ANS and hosted providers with real Redis,
initial selection, confirmation, booking, automatic replacement, arrival, and one
simulated overdue alert. It asserted `LOCAL_POLICY_FALLBACK` and `SIMULATED_TRANSPORT`.
The local server was stopped after testing. No Databricks token or authenticated CLI
profile exists in this checkout, so this does not claim live SQL here; Akshar's own
workspace evidence remains separately documented. Scheduled transit awaits a real
supported corridor/itinerary rather than fabricated walking estimates.

The user has now requested Telegram instead of Twilio. That transport replacement
will be a separate change; no Twilio paid upgrade or number purchase was performed.

## Telegram replacement (2026-09-19)

The user explicitly replaced Twilio with Telegram. Active code now has one Telegram
notification adapter and no SMS fallback. The contact input is `telegramChatId` instead
of `phone`; shared output types are unchanged. Telegram live mode is independent of
transportation demo mode, and real messages from demos are labeled as tests. Consent,
separate location consent, persisted outbox claims, duplicate prevention and arrival
cleanup remain in place. Private recipients must be explicitly allowed by the operator.

The bot token authenticated and one intended private `/start` chat was identified.
Telegram settings are saved in ignored local files and production environment settings.
All three Twilio settings were removed from Vercel and local environment files; the
Twilio account itself was not upgraded, charged, or deleted. Historical SMS references
above describe previous evidence, not the active implementation.

54 backend tests and repository pre-PR checks passed. A production-build HTTP smoke
used real Redis/live ANS/hosted simulated providers, with Telegram notifications explicitly
simulated. Separate review found no material issues and independently checked outbox
ordering, duplicate suppression and location consent. Live Telegram acceptance still
requires the user's authorized one-message test after deploying this change.
