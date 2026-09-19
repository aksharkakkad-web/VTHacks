# Beacon team contract — proposed kickoff baseline

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
