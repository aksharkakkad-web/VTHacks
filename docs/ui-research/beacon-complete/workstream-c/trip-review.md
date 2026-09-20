# Workstream C — final trip and recovery phone checks

Focused production review at `http://localhost:3100`, September 19, 2026. Source remained read-only; the runner and evidence are owned by this workstream. Root's existing 17 connected scenarios cover the complete R1–R4/E1–E11 transition suite; this batch adds targeted gap checks rather than replaying that suite.

## Production result

**PASS for the targeted production checks. One P2 navigation gap was escalated and fixed on development. No P0/P1 finding.**

[`results.json`](results.json) records 28 captures at 360×800 and 393×852, no horizontal overflow, no controls below 44×44 px, and no browser console errors or page exceptions. Under the browser's reduced-motion preference there were no running animations after the rendered state settled.

- Walking and scheduled transit were entered through the real reducer's recommendation → selection → approval transitions. Cancellation opens a no-provider confirmation, progresses through “Ending this plan,” then ends with booking/payment still `not-required` and precise location unreleased. Neither mode falsely waits for a provider.
- Booking/payment unknown states explicitly reconcile the same attempt and expose no new booking or confirmation action.
- Help says Beacon is not an emergency service and does not automatically notify anyone. The actual links are `tel:911` and `tel:+15403824343`. Both match the [official Virginia Tech Police contact page](https://police.vt.edu/about/contact.html), checked through Agent Reach. No phone call was placed.
- Arrival keeps simulated-payment labeling and Finish returns Home.
- A long home label and long street address wrap without horizontal overflow; pickup trip details remain readable at both phone sizes.
- Visual inspection also covered root's R1 provider failure, offline and transit boarding evidence. These preserve unknown status, source labels and no invented pickup instructions.

## Escalated finding

**P2 — Trip details unavailable during travel and arrival.** Screen map says the details sheet is available across 08–14, but production's screen 13 footer had only arrival/help/cancellation and 14 only Finish. The core facts remained visible, so the demo flow was not blocked. Astra accepted and added Details to 13 and 14, plus corrected walk/transit arrival copy that implied provider access had existed. Follow-up development evidence is recorded separately in `details-fix-results.json`.

## Limits

This is browser-rendered deterministic local simulation. It proves neither physical-device installation/keyboard behavior nor live transport, identity, booking, payment, maps, GPS or notification behavior. Production 3100 and development 3000 evidence are identified separately; a dev correction does not establish that the running production build contains it.

## Development correction verification

**PASS at `http://localhost:3000`.** [`details-fix-results.json`](details-fix-results.json) records the targeted correction checks at 360×800 and 393×852:

- Screens 13 and 14 now open and close trip details, retain booking facts and return focus to the details trigger.
- Walking/transit arrival says “This demo plan is complete” and does not falsely claim that provider access ended.
- A long destination leaves all lower controls reachable by scrolling. The cancellation control was tapped, its dialog opened, and Keep this trip dismissed it without ending the trip.
- No horizontal overflow, undersized target or browser error was recorded.

The first reachability assertion used an exact viewport inequality; the 393px capture measured a 44px control at y=808.1875 in an 852px viewport. The 0.1875px difference is fractional scroll rounding. The final check logs the exact rectangle, permits at most one CSS pixel and additionally proves the control is tappable; it does not ignore a material clipping failure.

Workstream B was independently accepted in [`planning-cross-review.md`](planning-cross-review.md). No unresolved P0/P1/P2 finding remains in this bounded source review. Root still owns refreshing the production build and final combined verification.

## Final rebuilt production confirmation

**PASS on rebuilt `http://localhost:3100`.** Ran only `BEACON_DETAILS_ONLY=1 BEACON_URL=http://localhost:3100 node scripts/verify-beacon-trip-final.mjs` after root's combined build. All ten targeted interaction checks plus the browser-error check passed: details open/close and focus return on 13/14, truthful walking/transit arrival, and reachable/tappable long-content controls at both phone sizes. No overflow, small controls, active settled animations or browser errors were recorded.

[`details-fix-results.json`](details-fix-results.json) and the ten `*-fixed` / `*-controls-reachable` captures now reflect this final production build. The previous development result is preserved in [`details-fix-development-results.json`](details-fix-development-results.json). The earlier pending-production limitation is resolved for these corrections.

Workstream A's independent review accepted C without unresolved P0/P1/P2 findings; see [`workstream-c-cross-review.md`](../workstream-a/workstream-c-cross-review.md).
