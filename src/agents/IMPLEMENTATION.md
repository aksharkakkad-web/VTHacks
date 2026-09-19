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
provider registration and hosted deployment remain pending. The phase plan requires
overdue monitoring even though the PRD labels it P1; implement the stronger phase gate.
Use the shared `SELECTED` state for awaiting confirmation; do not add a new shared state.
Default monitoring grace will be configurable (five minutes for the local demo), explicitly
documented as a local default rather than a claimed team decision.

References inspected: Databricks AI Dev Kit, agentnameservice/ans-registry,
agentnameservice/ans, agentnameservice/ans-sdk-go, agentnameservice/agent-trust-discovery,
and the live Webmesh AI catalog. Trust Index scores are advisory; they cannot substitute
for identity verification or Beacon's authorization policy.

## Verified local checkpoint (2026-09-19)

40 behavioral tests pass, including Redis environment selection, lost-response reconciliation, delayed-request
cancellation, uncertain-booking arrival cleanup, preserved overdue deadlines, and
replacement recovery after an outage or interrupted checkpoint.
The production-build HTTP smoke on the reconciliation branch exercises session ownership,
confirmation, local pretrust, Campus Ride booking, automatic Independent Ride replacement,
geofence arrival, private-state cleanup, and one simulated overdue alert. Production Next.js
build, lint and typecheck pass. Shared checkpoints A/B are ready for integration. Live ANS,
Databricks, SMS, deployed persistence/scheduling, and deployed UI verification remain open.

## Hosted provider and registration slice

Three opt-in Next.js provider routes now implement the same wire contract and use
Redis for idempotent bookings and durable cancellation tombstones. ANS discovery
keeps separate service IDs for endpoints advertised by one registered operator;
this does not represent separate verified businesses. Public quotes remain unauthenticated,
and booking tokens are scoped to a verified service ID and exact endpoint.

The live ANS resolution API resolved Webmesh on 2026-09-19. Full verification correctly
rejected its TLS fingerprint: the live certificate differed from the certificate still
listed in its ANS badge. This is a negative interoperability result, not a successful
Beacon identity verification. A local CSR for the user's domain and a registration
payload are prepared in Git-ignored storage; neither registration nor DNS publication
has been performed. Vercel CLI account authorization is complete.

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
and store operations; it does not yet prove a deployed trip flow or a hosted monitor scheduler.
