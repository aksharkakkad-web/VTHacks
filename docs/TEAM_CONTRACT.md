# Beacon team contract — proposed kickoff baseline

**Current product direction:** [provider-network pivot](Beacon_Pivot_What_Changes.md).
The [team update plan](Beacon_Pivot_Updates_To_Do.md) proposes the next versioned
provider/authorization/payment contract. Those proposals are not implemented shared
types. Current API behavior is documented in [the agent API](../src/agents/API.md)
and [the Databricks handoff](DATABRICKS_APP_HANDOFF.md); the starter status below
is historical. Coordinate shared changes before any track builds against them.

> **Latest direction:** [Provider-agent pivot: what changes](superpowers/specs/2026-09-19-beacon-provider-network-pivot-design.md), with [owner tasks and proposed contract changes](superpowers/plans/2026-09-19-beacon-provider-network-pivot.md). Product direction is approved; new wire fields still need shared alignment. Checked-in types remain authoritative until that change lands. The route/status descriptions below are the historical kickoff proposal; use [the agent API handoff](../src/agents/API.md) and [integrated data handoff](DATABRICKS_APP_HANDOFF.md) for implemented behavior.

This is the implementation baseline prepared from `Beacon_START_HERE.md` and the build-locked PRD. For the 24-hour sprint, start the three tracks with mocks while confirming shared contracts and demo decisions in parallel. Treat sponsor access checks as open until each owner verifies them.

## Stack and boundaries

- One root-level Next.js App Router app, TypeScript, Tailwind CSS, npm, Node.js 22.
- Product/PWA: Rishit. Provider agents, ANS, trip state/API: Mahin. Databricks ranking/data: Akshar.
- `src/types/**`, `.env.example`, `package.json`, API paths, and demo numbers are shared. Coordinate changes before editing them after sign-off.
- Provider quotes carry coarse/non-sensitive context. Exact GPS, exact addresses, identity, and trip identifiers linked to identity must not be released until provider identity **and** authorization have been verified. Trusted-contact data is not provider data.
- No live sponsor integration, provider booking, or SMS behavior is implied by this starter repo.

## Shared TypeScript contracts

The source of truth is `src/types/provider.ts`, `src/types/recommendation.ts`, and `src/types/trip.ts`. They define `CandidatePlan`, `Recommendation`, `TripState`, and `Trip` as proposed in the kickoff document.

## Proposed API paths

All methods below are `POST`. These are contracts for future implementation, **not implemented routes**:

```text
/api/trips
/api/trips/:id/discover
/api/trips/:id/evaluate
/api/trips/:id/confirm
/api/trips/:id/verify
/api/trips/:id/request
/api/trips/:id/events
/api/trips/:id/location
/api/trips/:id/arrive
/api/demo/trips/:id/cancel-provider
/api/demo/trips/:id/expire-deadline
/api/demo/reset
```

`confirm` comes from the build-locked PRD's explicit user-confirmation step; the shorter kickoff list omitted it. The team should confirm this reconciliation before implementing routes.

## Proposed deterministic judge scenario

- Origin: Downtown Blacksburg. Destination: Pritchard Hall.
- Budget: $10. Preference: minimize walking. Trusted contact: Maya (demo-only identity).
- Quotes from the kickoff document: Campus Ride $0 / 8-minute wait / 11-minute travel / 1-minute walk; Independent Ride $7 / 5 / 10 / 1; Transit $0 / 15 / 14 / 5; Walk $0 / 22-minute walk.
- Proposed first recommendation: Campus Ride. Its cancellation triggers reevaluation; proposed replacement: Independent Ride. These winners are demo expectations, **not** a hard-coded ranking rule.
- Overdue grace period and exact alert copy remain a team decision; do not claim this is frozen yet.

## Split gate — human checks still required

- [ ] All three teammates can clone and run `npm run dev`.
- [ ] All three acknowledge types, API paths (especially `/confirm`), demo winner/replacement, and overdue behavior.
- [ ] Akshar verifies Databricks access and a `SELECT 1` query.
- [ ] Mahin verifies ANS documentation/credentials and starts provider registration.
- [ ] Rishit verifies map token/geolocation and chooses product visual references.
- [x] Initial push, CI, and a test PR are verified.
- [ ] GitHub `main` protection is enabled.

## Additive hybrid planner contract

The OAuth demonstrator adds a server-owned planning sidecar without changing `Trip.state` or the shared types in `src/types/**`. `GET /api/trips/:id/evidence` includes `planning` with version `beacon-planning-v1`; it reports the durable run phase, worker state, model provenance, explanation provenance, current snapshot ID, and a controlled message code. A stale or expired selection never returns an earlier explanation.

Owner routes use the existing `beacon-session` cookie and trip ownership check. `POST /api/demo/planner/pair` consumes `{code}` in the current or newly-created cookie context. A paired owner can call `POST /api/trips/:id/planning` with `{}`. `GET /api/trips/:id/activity?after=0` returns at most 100 sanitized, sequence-ordered events. All responses use `Cache-Control: no-store`.

The laptop worker authenticates only with `BEACON_PLANNER_WORKER_TOKEN` and uses:

```text
POST /api/internal/planner/pairing
POST /api/internal/planner/claim
POST /api/internal/planner/heartbeat
POST /api/internal/planner/complete
POST /api/internal/planner/tick
```

Pairing codes are single-use 128-bit values stored as hashes for ten minutes; paired owners may enqueue for two hours. Jobs expire after 90 seconds, leases after 30 seconds, and inference gets at most two attempts. One active run is permitted per paired owner. Worker calls can return structured intent and explanation data only; they cannot confirm, authorize, book, send notifications, update location, or mark arrival.

Every model job omits precise coordinates, addresses, contacts, consent/grant material, session identifiers, raw student text, provider endpoints, and credentials. Selection snapshots bind canonical candidate data, exact provider offer terms and expiry, approved budget, committed liabilities, exclusions, evidence versions/deadlines, and the selected plan. Backend code rechecks the current trip snapshot and quote deadline before accepting a completion or exposing an explanation. Explanation prose must exactly match controlled fact text and include mandatory limitation facts; otherwise the sidecar labels and uses the template fallback.
