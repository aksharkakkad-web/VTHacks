# Beacon verification record

All checks use deterministic simulation. Browser evidence is Chromium/Chrome, not a physical-device or live-provider test.

## Repository checks

| Command | Result |
|---|---|
| `BEACON_DIST_DIR=.next-beacon ./scripts/pre-pr.sh` | PASS: final combined lint, 37 tests, typecheck and production build; see pre-pr.log |
| `node --test scripts/beacon-storage.test.mjs` | 6 pass, including new malformed-snapshot regression |
| `git diff --check` | Passed |
| Frozen shared files (`src/types/**`, package.json, .env.example) | No task diff |

The separate build directory preserves the already-running development server. No Git remote action or deployment was performed.

## Connected browser checks

Use `BEACON_URL=http://localhost:3100` with the scripts below for production. In this environment set `PLAYWRIGHT_MODULE=/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`; use an installed Playwright module elsewhere.

| Runner | Evidence / result |
|---|---|
| `node scripts/verify-beacon-complete.mjs` | New user → recommendation → identity → authorization → simulated payment/booking → pickup → travel → arrival → Home; 16 screenshots, no errors; real tap recording |
| `node scripts/verify-beacon-scenarios.mjs` | 17 scenario checks, 44 screenshots, no errors; 320×568, 360×800, 393×852, 430×932 and desktop; offer facts before consent, no horizontal overflow or undersized audited trip actions |
| `node scripts/verify-beacon-sheets.mjs` | 9 checks: home/preferences/contact validation, context, real permission denial, eligible alternatives, unknown booking/cancellation and explicit corrupt-demo reset; no errors |
| `node scripts/verify-safecircle-pwa.mjs` | Manifest/icons/standalone metadata, zero Chromium installability errors, worker registration, public-only cache, offline shell/retry/reconnect, blocked-storage onboarding; passed |
| `node scripts/verify-beacon-flow.mjs` | Existing connected onboarding/exact-budget/cancel/arrival/returner check; 320/390/1440; passed |
| `node scripts/verify-beacon-preferences.mjs` | Existing assets/exact-budget/switches/saved-navigation check; 320/390/512/1440; passed |
| `node scripts/verify-beacon-gallery.mjs` (development 3000) | All 46 real specimens captured, no errors or overflow; boot specimen saved separately |

Additional final checks:

- `node scripts/verify-beacon-setup-final.mjs`: 85/85 passed on rebuilt production across 360/390/393/430; no target, font, overflow or browser error.
- `node scripts/verify-beacon-planning-final.mjs`: planning/consent/identity/access/booking checks passed; B accepted by C.
- `BEACON_DETAILS_ONLY=1 node scripts/verify-beacon-trip-final.mjs`: final production details/focus/arrival/long-content corrections passed at 360/393; C accepted by A.
- A accepted by B. No unresolved P0/P1/P2 remained after the independent reviews.

These supplement the connected journeys without replacing them. Final video decoding and `git diff --check` returned exit 0.

## Journey coverage

1. New user: Welcome, manual/sample home, preferences, Home.
2. Main journey: search, compare, offer, consent, identity, access, booking, pickup, travel, arrival.
3. Provider failure: reconciliation before replacement search; changed terms require fresh consent; replacement arrival.
4. Walking: no provider booking/payment, explicit user arrival.
5. Transit: scheduled estimates, boarding action, no simulated vehicle booking/payment.
6. Offline/reconnecting: mutations blocked; same attempt restored.
7. Provider verification failure: exact location withheld; retry identity check.
8. No suitable plan: preference recovery and new search.
9. Overdue/help: no false notification promise; continue travelling or confirm arrival.
10. Cancellation: explicit confirmation, pending/result; unknown outcome reconciles same attempt.
11. Refresh/start URL: same active local demo restored; corruption fails closed.
12. Repeated confirmation: one attempt only.

## Recording and screenshots

The main recording is 390×844 and includes actual taps/transitions. The recovery recording uses production reducer fixtures for direct access, then performs real UI interactions. Both original WebM videos and the H.264 main MP4 decode without errors. Frame samples and screenshots were visually inspected; no fabricated maps, drivers or live source claims were introduced.

## Limits

Physical iPhone/Android installation, OS keyboard behavior, platform-specific background termination, and Safari/WebKit were not available. Safe-area/dynamic-height code and phone viewport behavior were checked in Chromium. Live authoritative restore and sponsor/provider integrations require backend endpoints absent from this checkout. Those are external integration limits, not silently simulated live functionality.
