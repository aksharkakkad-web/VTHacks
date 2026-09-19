# Task 1 — route evidence readiness

## Outcome

Implemented a pure, server-input-only coverage assessment in `src/lib/decision-client/journey-readiness.ts`. It binds operational lighting to an exact public route ID/version and complete ordered segment inventory, and uses the existing `summarizeLighting` and `planIndoorWait` helpers. Provider pickup evidence is matched to provider, service, site, route verification, and the intended pickup instant. The assessment always returns `bookingAuthorized: false` and `availabilityImpact: 'none'`: incomplete evidence is a warning, never candidate exclusion or a booking permission.

## Decisions and assumptions

- The expected inventory is the authoritative complete route; a missing, duplicate, reordered, length-mismatched or version-mismatched observed inventory cannot be complete. No observation is transplanted from a mismatched route.
- Operational lighting can be complete even if all segments are observed unlit. `all_lit`, `all_unlit`, and `mixed_lit_unlit` are coverage labels, not safety judgments. Inventory-only, historical, future, stale and unknown observations remain unknown.
- Pickup permission uses the existing sourced-window shape. A one-hour review window, valid-through-pickup requirement, exact provider/service/site binding, and verified route are assessment conventions, not live provider authorization. The helper does not mutate the ranking policy.
- Indoor waiting is optional. When claimed, the waiting site must match the pickup site and the existing waiting helper must estimate a valid wait. Invalid hours become an explicit unknown reason. Walking can explicitly omit provider pickup and waiting.
- Inputs are reviewed server-side evidence. This helper does not validate arbitrary provider or browser JSON and is not wired to any API or booking path.

## Red/green evidence

- Initial tests failed because the helper was absent; then a minimal null-return stub produced 8/8 behavior failures.
- First implementation passed 8/8 focused tests.
- Added past-pickup and malformed-hours tests: 2 expected failures, then both passed after the bounded fix.
- Added explicit malformed-hours reason: 1 expected assertion failure, then 10/10 focused tests passed.
- Synthetic fixtures are labeled as such and are not operational records.

## Verification

- `npm exec --offline --package=tsx -- tsx --test src/lib/decision-client/journey-readiness.test.ts`: 10/10 passed.
- Targeted ESLint on the two owned TypeScript files: passed.
- `git diff --check`: passed.
- Full `npx tsc --noEmit --pretty false`: passed after concurrent disjoint network-offers test was completed.
- Full track tests: manager is running the integration suite; no full-track result is claimed in this task report.

## Boundaries and follow-up

This does not confirm current illumination, building admission, provider authorization, route accessibility, or booking eligibility. Unknown coverage remains visible in POC mode. No shared types, APIs, policy weights, auth, payment, UI, cloud data or dependencies changed. This is local-only work; no production write, deployment, push or merge occurred.
