# Beacon complete acceptance matrix

Baseline inspected 2026-09-19. Newest screen map overrides older automatic replacement consent. All service behavior in this checkout is deterministic simulation: API routes are absent. Existing prices remain untouched.

| ID | Screen/state | Route/component state | Initial status | Required work | Verification |
|---|---|---|---|---|---|
| 01 | Boot/restoration | / · bootstrap | Partial | Replace splash delay; restore simulator snapshot | Implemented; state and browser verification passed (see results JSON) |
| 02 | Welcome | /onboarding/welcome | Partial | Preserve composition; correct copy, remove sign-in | Implemented; state and browser verification passed (see results JSON) |
| 03 | Set home | /onboarding/home | Partial | Manual entry, keyboard and edits | Implemented; state and browser verification passed (see results JSON) |
| 04 | Preferences | /onboarding/preferences | Partial | Consent and optional contact | Implemented; state and browser verification passed (see results JSON) |
| 05 | Home | /app · home | Partial | Help, location explanation, edit sheets | Implemented; state and browser verification passed (see results JSON) |
| 06 | Discovery | discovering / collecting-quotes | Partial | Truthful services and privacy | Implemented; state and browser verification passed (see results JSON) |
| 07 | Comparison | evaluating | Partial | Distinct heading and saved constraints | Implemented; state and browser verification passed (see results JSON) |
| 08 | Recommendation | recommendation | Partial | Offer expiry/terms/operator and selection | Implemented; state and browser verification passed (see results JSON) |
| 09 | Identity | verifying-* | Inconsistent | Unified screen, demo trust source | Implemented; state and browser verification passed (see results JSON) |
| 10 | Access | authorizing-* | Inconsistent | Separate payment/access state | Implemented; state and browser verification passed (see results JSON) |
| 11 | Booking | coordinating-* | Inconsistent | Same attempt, separate booking/payment | Implemented; state and browser verification passed (see results JSON) |
| 12 | Pickup | accepted / waiting / arriving-* | Inconsistent | No invented instructions, boarding action | Implemented; state and browser verification passed (see results JSON) |
| 13 | Travel | in-trip-* | Inconsistent | No ride route copied from walk | Implemented; state and browser verification passed (see results JSON) |
| 14 | Arrival | arrival | Inconsistent | Payment summary, finish | Implemented; state and browser verification passed (see results JSON) |
| R1 | Provider failure | provider-cancelled | Partial | Explain cancellation | Implemented; state and browser verification passed (see results JSON) |
| R2 | Reconcile | reconciling | Missing | Same attempt before replacement | Implemented; state and browser verification passed (see results JSON) |
| R3 | Replacement discovery | replanning-* | Partial | Fresh offers | Implemented; state and browser verification passed (see results JSON) |
| R4 | Replacement approval | replacement-selected | Incomplete | Fresh GO; reset consent | Implemented; state and browser verification passed (see results JSON) |
| E1 | No suitable plan | no-options | Partial | Preference edit and retry | Implemented; state and browser verification passed (see results JSON) |
| E2 | Changed offer | offer-changed | Missing | No stale confirmation | Implemented; state and browser verification passed (see results JSON) |
| E3 | Verification failure | verification-failed | Partial | Withhold precise data | Implemented; state and browser verification passed (see results JSON) |
| E4 | Payment decline | payment-declined | Missing | No booking success | Implemented; state and browser verification passed (see results JSON) |
| E5 | Unknown outcome | payment-unknown / booking-unknown | Missing | Reconcile same attempt | Implemented; state and browser verification passed (see results JSON) |
| E6 | Offline/reconnect | offline / reconnecting | Partial | Freeze mutations; restore same state | Implemented; state and browser verification passed (see results JSON) |
| E7 | Restoration failed | session-error | Missing | Never silently restart | Implemented; state and browser verification passed (see results JSON) |
| E8 | Location unavailable | location-error | Missing | Demo pickup fallback | Implemented; state and browser verification passed (see results JSON) |
| E9 | Slow request | slow-request | Missing | Retry same operation | Implemented; state and browser verification passed (see results JSON) |
| E10 | Overdue | overdue | Partial | No false alert claim | Implemented; state and browser verification passed (see results JSON) |
| E11 | Cancel | cancelling / cancelled | Missing | Confirm/pending/resolved | Implemented; state and browser verification passed (see results JSON) |
| W | Walking | walk + in-trip | Partial | No payment/booking | Implemented; state and browser verification passed (see results JSON) |
| T | Transit | transit + waiting/in-trip | Incomplete | Scheduled source, no booking | Implemented; state and browser verification passed (see results JSON) |
| S | Sheets | home/preferences/context/options/details/help/contact/location | Partial | Real Base UI dialogs; return focus | Implemented; state and browser verification passed (see results JSON) |
| G | Gallery | /beacon-system | Partial | All real components, deterministic fixtures | Implemented; state and browser verification passed (see results JSON) |
| PWA | Installation/offline | manifest/sw/offline | Partial | Production audit, no private caching | Implemented; state and browser verification passed (see results JSON) |

## Coverage notes

- Main screenshots: 02–14 plus 12 accepted/approaching variants. Boot is an immediate state check, with a stable development specimen; it is not an extra onboarding decision.
- R1–R4: connected provider-failure walkthrough reconciles the old attempt and waits for new confirmation.
- E1–E11: real components exercised with deterministic reducer fixtures and real browser interactions. Unknown booking/payment/cancellation retain their attempt ID.
- Walking and transit have distinct no-booking paths; transit estimates are scheduled demo data.
- Profile and trip storage tests cover corruption, invalid flags and refresh; returning start URL restores the same local demo attempt.
- Sheets cover validation, focus dismissal, contact call shortcut, location denial, optional context and alternate selection.
- Development gallery renders production components, including long-content and reduced-motion variants. Production route is 404.
- PWA installability/offline verification uses a production build and Chromium. Physical iPhone/Android installation and OS keyboard behavior require actual devices and are not claimed.
- Checkpoints A/D/E/F mark Rishit's demonstrated local PWA track only. B/C (live provider/ranking) and G (deployed phone demo) remain unmarked.

## Parallel final verification ownership

Implementation is integrated. Existing public interfaces (`BeaconFrame`, flow screens, `JourneyScreen`, sheets, local reducer and storage) are frozen while independent final verification runs. No parallel agents edit a central source file. A discovered source fix is reported to Astra, which either fixes the shared file or explicitly transfers one isolated file before editing begins. No architectural split is needed for these read-only workstreams.

| Batch | Owner | Exclusive files | Implementation complete | Review complete | Findings resolved | Integrated | Phone verified |
|---|---|---|---|---|---|---|---|
| Shared shell/state/privacy/PWA | Astra | shared source, PWA, matrix, crossflow scripts and final report | Yes | Terra first pass + follow-up | Both P1 resolved | Yes | Production main/scenario/PWA evidence verified |
| A:01–05, setup forms, returning | beacon_frontend | scripts/verify-beacon-setup-final.mjs; workstream-a/** evidence only | Yes | B independent review accepted | Initial findings resolved | Yes | 85 checks passed on final production at four phone sizes |
| B:06–11, offer/identity/access/booking | terra_review | scripts/verify-beacon-planning-final.mjs; workstream-b/** evidence only | Yes | C independent review accepted | Initial findings resolved | Yes | Final targeted phone planning checks passed |
| C:12–14, R1–R4, E1–E11, modes | trip_final | scripts/verify-beacon-trip-final.mjs; workstream-c/** evidence only | Yes | A independent review accepted | Initial findings resolved | Yes |17 scenarios plus targeted production correction checks passed |

Cross-review cycle: B reviews A; C reviews B; A reviews C. Reviewers write only their own report and do not edit reviewed source. Astra integrates justified corrections, checks neighboring transitions, and owns the completion judgment. All existing completed artifacts and user work are preserved.

Final integration: A’s isolated home CSS corrections were explicitly transferred to that owner; all shared changes (range target, status contrast, trip details, stored-state validation) were made by Astra. Final combined `pre-pr` passed lint, 37 regression tests, typecheck and production build. A/B/C cross-reviews are accepted with no unresolved P0/P1/P2. Physical-device and live-backend limits above remain unchanged.
