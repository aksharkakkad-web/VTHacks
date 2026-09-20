# Workstream B — planning and consent final verification

**Scope:** Targeted, read-only production review of screens 06–11 and the development gallery. This intentionally does not replay the full connected journey; root owns the broader main/scenario suites.

## Result

**PASS — no P0, P1, or P2 source correction is requested from Astra in this planning batch.**

The focused Playwright check passed at production `http://localhost:3100` with no browser errors. Evidence is in [`targeted-results.json`](targeted-results.json) and the adjacent PNG captures. The repeatable runner is [`scripts/verify-beacon-planning-final.mjs`](../../../../scripts/verify-beacon-planning-final.mjs).

## Verified

- **06–07:** discovery and comparison have separate headings, progress states, and cancellation paths.
- **08 consent:** at 320×568, 360×800, 390×844, 393×852, and 430×932, the plan price, simulated source, fee, expiry, and cancellation facts precede the static confirmation control. The compact 320 layout removes decorative route art rather than hiding facts. All recorded visible journey controls were at least 44×44 px.
- **Alternative selection:** selecting Rideshare changes the review to the deliberate `$8.40` offer, retains the simulated-source label, and stays in `recommendation`; it does not create a booking attempt.
- **09–11:** identity, access, simulated payment, and booking are visibly distinct. Identity starts with exact details withheld; authorization marks access separately; booking shows payment approved while booking remains pending.
- **Verification failure:** exact location stays withheld and Try again returns to identity checking without releasing it.
- **Accessibility:** the restored task moves programmatic focus to the screen heading and emits the concise `Beacon demo: …` live status. The screen intro and discovery progress also carry polite live regions.
- **Gallery:** on development `http://localhost:3000/beacon-system`, the Long content + Reduced motion fixture had no horizontal overflow or active CSS animation.

## Visual review

The screen captures have a stable low-attention hierarchy: one decision, then supporting facts, then the action. At short height, removing the illustration gives price and offer terms their own readable space. The 12 px term/source/status scale is materially clearer than the previous 9–10 px treatment. The verification/access/booking panels use a consistent row structure and distinguish pending from completed work without suggesting a confirmed booking early.

## Limits

This verifies browser-rendered local simulation and the development gallery only. It does not claim physical-device installation, real providers, payments, maps, or GPS.

## Workstream A independent evidence review

**Accepted — no new P0, P1, or P2 finding.** I read [Workstream A’s final report](../workstream-a/report.md), its 85-check [machine-readable result](../workstream-a/results.json), and four representative 390×844 captures: welcome, invalid manual-home entry, the corrected chooser sheet, and returning home. The report’s claims match the result record and inspected UI:

- All four target widths (360×800, 390×844, 393×852, 430×932) record no horizontal overflow, page errors, console errors, undersized controls, or undersized input text.
- Blank manual-home values retain the open sheet and display a readable error; valid values persist through setup and the returning-user edit.
- The previously reported 40 px sheet close target, 27 px chooser input, 38 px range control, and 11 px disclosure are each reported corrected. The focused chooser capture visually supports the improved close target and input field.
- Welcome has one clear setup action, and the focus outline visible on the inspected returning-user heading is appropriate keyboard feedback rather than a visual defect.

This was a read-only review of A’s development-server run. Root owns the refreshed production rebuild and connected acceptance run.

## State restoration and contrast spot-check

- The storage guard fails malformed saved display fields before rendering, including malformed approval/cancellation flags, timestamps, fees, attempt IDs, and recommendation data ([`trip-storage.ts`](../../../../src/components/beacon/trip-storage.ts), lines 16–33; [`beacon-storage.test.mjs`](../../../../scripts/beacon-storage.test.mjs), lines 74–80). This preserves the verified-identity, authorization, and explicit-approval conditions for precise-location release on restoration.
- I performed a targeted development capture of screen 09. Pending identity/access/payment/booking rows render at full row opacity; pending primary text is `#4d635e` and supporting status text remains `#667280`. The visual result is readable, and only the decorative pending ring is muted ([`journey-screens.module.css`](../../../../src/components/beacon/journey-screens.module.css), lines 176–177).

## Cross-flow review verdict

**No open P0, P1, or P2 correction is requested by Workstream B.** Across the reviewed evidence, Beacon gives a local, low-attention demo journey a clear sequence: setup, offer comparison, fact-first consent, identity, access, simulated payment, booking, travel, and arrival. It visibly keeps the precise-location gate closed until identity, approval, and authorization; alternative selection and recovery do not imply a fresh booking; and walking/transit retain their no-provider paths in root’s connected scenario suite.

Root’s refreshed evidence inventory records 2 main-flow checks, 17 scenario checks, 9 sheet/browser checks, and 3 PWA checks without reported errors. Workstream C independently accepted this bounded planning review without a new finding ([`planning-cross-review.md`](../workstream-c/planning-cross-review.md)). The authoritative final production reruns remain root’s responsibility; this review makes no claim of physical-device installation, live provider identity, payment, booking, GPS, or map coverage.
