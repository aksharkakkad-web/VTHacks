# SafeCircle mobile experience — implementation and QA

## Result and boundary

SafeCircle now has a cohesive mobile-first map-and-sheet experience, from saved-home setup through automatic recovery and arrival. The approved visual system is preserved, not replaced. [Approved board](approved-design.png).

**This checkout is an interactive frontend demo, not a live transport service.** It contains shared contracts but no implemented trip APIs, ANS client, Databricks service, or provider agents. Existing fixture values remain explicit simulation data. No backend architecture, shared contract, or sponsor integration was changed. See [integration notes](integration-notes.md).

## Screens and meaningful states

| Family | Implemented and captured |
|---|---|
| Setup | [Home address](final/01-onboarding-home.png), [preferences](final/02-onboarding-preferences.png), Back with retained input, returning-user restore |
| Home | [Home](final/03-home.png), [saved preferences editor](final/04-edit-home.png), [temporary context](final/05-trip-context.png), real map overview/recenter toggle |
| Search | [Discovery](final/discovering.png), [responses](final/collecting-quotes.png), [evaluation](final/evaluating.png) in one evolving sheet |
| Decision | [One recommendation](final/recommendation.png), [eligible alternatives disclosure](final/recommendation-alternatives.png), GO |
| Coordination | [Identity check](final/verifying-initial.png), [authorization](final/authorizing-initial.png), [pickup request](final/coordinating-initial.png), [accepted](final/accepted-initial.png) |
| Trip | [Waiting](final/waiting-initial.png), [arriving](final/arriving-initial.png), [on trip](final/in-trip-initial.png), [details](final/trip-details.png), [help](final/help.png) |
| Recovery | [Cancellation](final/provider-cancelled.png), [replacement discovery](final/replanning-discovery.png), [reevaluation](final/replanning-evaluation.png), [replacement selected](final/replacement-selected.png) |
| Replacement | [Verification](final/verifying-replacement.png), [authorization](final/authorizing-replacement.png), [coordination](final/coordinating-replacement.png), [confirmed](final/accepted-replacement.png), [waiting](final/waiting-replacement.png), [arriving](final/arriving-replacement.png), [on trip](final/in-trip-replacement.png) |
| Completion | [Original provider arrival](final/arrival-initial.png), [replacement arrival](final/arrival.png), Finish resets temporary trip state |
| Walking | [Recommendation](final/walking-recommendation.png), [walking route](final/walking-active.png), [walking completion](final/walking-arrival.png); no invented provider or ANS steps |
| Supporting states | [No suitable option](final/no-options.png), [verification failure](final/verification-failed.png), [context fallback](final/context-fallback.png), [offline last-known trip](final/offline-last-known-trip.png), [overdue check-in](final/overdue.png) |
| Judge | [Technical timeline](final/technical-timeline.png), candidate evaluation, reason codes, GO approval, identity/authorization/release gates, current trip progress, pause/resume and scenario controls |
| PWA fallbacks | [Offline reload](final/offline-reload.png), [restricted storage](final/restricted-storage.png), install manifest/icons and safe-area support |
| Responsive | [320px Home](final/responsive-320-home.png), [320px recommendation](final/responsive-320-recommendation.png), [320px editor scrolling](final/responsive-320-edit-home-scrolled.png), [430px Home](final/responsive-430-home.png), [desktop](final/responsive-1440-home.png) |

## Design system and reusable components

- Instrument Sans throughout the application; 44px ETA, 32px titles, 16px body, 14px secondary and 12px metadata.
- Centralized white, sage, mint, forest, carbon, warning and danger tokens; consistent spacing, radius, elevation and motion tokens.
- Strong text contrast: primary text on mint is approximately 7.15:1; muted text on white 4.90:1; tertiary text on white 4.59:1.
- Mint indicates action, current progress, verified state or completion. No gradients, glass, neon, decorative motion, fake system bars or large bottom navigation.
- `AppShell`, `MapSurface`, `BottomSheet` with optional fixed action footer, shared buttons/status/verification primitives, provider card and alternative row, screen families, shared accessible dialogs, and technical timeline.
- The map remains a clearly labeled illustrative plane; the same sheet transforms as the trip progresses.

## Research that affected the UI

1. [Uber Live Activities](https://www.uber.com/iq/en/blog/live-activity-on-ios/): time before vehicle detail, distinct pickup/arrival phases, calm current progress.
2. [Transit 6.0](https://help.transitapp.com/article/546-transit-6-0-quick-start-guide): stable map beneath a contextual sheet and purposeful one-handed actions.
3. [Apple Maps](https://support.apple.com/en-ca/guide/iphone/iph02f94fc1c/ios): quiet spatial background, compact labeled controls, native-feeling route hierarchy.

Reference captures and specific borrowing/rejection decisions are in [research notes](references.md). Lyft screenshot retrieval was unavailable; the three sources above provided usable evidence. No reference product’s branding, proprietary assets or code was copied.

## Interaction and accessibility improvements

- Two-step setup, meaningful Back behavior, local profile persistence and an honest session-only fallback when storage is blocked.
- Temporary context resets at trip completion; an unchanged context does not falsely appear applied.
- Provider access is withheld until GO, identity verification and authorization; cancellation clears current selection and revokes access before recovery.
- Replanning never asks for a redundant second approval and never exceeds the approved budget/walking/transfer constraints.
- Offline pauses progression and labels the retained route/estimate as last-known rather than live.
- Actual selected provider and completion event drive arrival; trip details distinguish never shared from sharing ended.
- Shared dialogs provide focus containment, Escape, focus return, labels, error recovery and reachable actions on short screens.
- Visible buttons, links and disclosures are at least 44px; main actions are 52px. Recommendation GO remains fixed and fully visible even at 320×568.
- Reduced-motion support and optional feature-detected vibration. Unsupported browsers receive identical visual feedback.
- Help uses verified phone targets and optional saved trusted-contact phone. QA checked links without placing calls. No notification or emergency response is fabricated.

## Verification evidence

Environment: production Next.js build at `http://localhost:3001`, Chrome through Playwright; 390×844, 320×568, 430×932 and 1440×1000. The separate Browser plugin skill was unavailable; the installed Playwright runtime and Chrome were used. Public UI controls were exercised, not an injected replacement UI.

| Check | Result |
|---|---|
| Typecheck | Pass |
| Lint | Pass |
| Node tests | 25 passed: 21 trip-model regressions plus 4 existing repository tests |
| Production build | Pass |
| Page identity / nonblank / no framework overlay | Pass |
| Full original and replacement trip paths | Pass |
| Setup, persistence, details/help, context and eligible alternatives | Pass |
| Verification retry, overdue actions, offline resume and walking-only flow | Pass |
| Focus containment / Escape / 44px visible controls | Pass |
| Horizontal overflow and short-phone GO visibility | Pass |
| Console / runtime errors | None in the completed browser run |
| Screenshots | 56 interaction/responsive captures plus 2 PWA/fallback captures |
| Service worker / offline reload / blocked storage | Pass; only public offline assets cached, no API or trip responses |

Machine-readable evidence: [browser run](final/verification.json), [PWA run](final/pwa-verification.json). Two independent Luna Max reviewers assessed the proposed state map and actual renders; accepted and rejected findings are recorded in [review log](review-log.md). Final ratings: visual 8.7/10 with no meaningful visual issues, flow 9/10 with no P1 issues. The final minor cancellation-copy mismatch was corrected.

Reproduce:

```sh
npm run typecheck
npm run lint
node --test scripts/checkpoint-board.test.mjs scripts/safecircle-state.test.mjs
npm run build
npm run start -- --port 3001
# In another terminal; set PLAYWRIGHT_MODULE if Playwright is supplied by a bundled runtime:
SAFECIRCLE_URL=http://localhost:3001 node scripts/verify-safecircle.mjs
SAFECIRCLE_URL=http://localhost:3001 node scripts/verify-safecircle-pwa.mjs
```

## Remaining limits

- Backend, ANS, Databricks, real provider booking, live location, geocoding and contact notifications are **not verified or implemented by this UI pass**. The team’s backend must replace demo events through the existing contracts.
- Physical iPhone/Safari installation, real haptics, dynamic text settings and real network/provider conditions still need device/integration testing. Phone-sized Chrome verification is not native iOS certification.
- The map is schematic and static; this is intentional until the real route/location integration arrives. No navigation infrastructure was invented.
- Overdue shows the actual last recorded demo status and timestamp, but does not invent precise GPS or an alert deadline. The team contract leaves overdue grace and notification behavior for backend agreement.
- The standalone offline reconnect document uses a system-font fallback when the application font cannot be fetched. It never claims to have current trip status.
- Optional refinement: further tune the arrival whitespace and map landmark detail after real route data and device testing. These do not block the demonstrated flow.
- Work is saved in focused local commits. Nothing was pushed, merged or deployed.
