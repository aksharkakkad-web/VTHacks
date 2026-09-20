# Beacon Terra review — September 19, 2026

## Scope and evidence

Read-only review of the current local implementation and the product requirements in `Beacon_Screen_Map.md`, `Beacon_Product_Direction.md`, the acceptance matrix, and the research notes. I inspected the latest 390 px main/recovery screenshots and walkthrough frames, the reducer/storage paths, the development gallery, and the production app at `http://localhost:3100` in independent Playwright contexts.

I also verified the recommendation at 390 × 844 and 320 × 568. At 390 px the offer terms and action are visible; at 320 × 568, the action appears before the price, time, and cancellation terms. This review did not perform device installation or live provider/payment calls.

## Findings

### P1 — The initial home setup cannot accept a manual home

**Requirement:** Screen 03 calls for “home search/manual entry,” and the acceptance matrix explicitly lists “Manual entry, keyboard and edits.”

**Evidence:** [`src/app/onboarding/home/page.tsx`](../../../src/app/onboarding/home/page.tsx#L17) defines four fixed demo locations. The search only filters that list at [lines 63–66](../../../src/app/onboarding/home/page.tsx#L63), and the sheet renders only its results at [lines 189–208](../../../src/app/onboarding/home/page.tsx#L189). There is no action to save an entered residence hall/address when no result matches. The later Edit home sheet does permit typed values, but that does not make the onboarding instruction truthful.

**Impact:** A student with any home other than a Pritchard variant reaches a dead end during required setup.

**Fix:** Keep the deliberately labeled sample results, but add a clearly local-demo “Use this typed home” path with the existing name/address validation, or state on the initial screen that setup is restricted to sample destinations.

### P1 — Small-phone confirmation makes the consent action available before the offer facts

**Requirement:** Screen 08 orders price/estimate, expiry, and cancellation terms before “Confirm this plan”; exact-offer confirmation must be informed.

**Evidence:** On the current production app at 320 × 568, the initial recommendation view shows “Confirm this plan” at y=450 while the `Offer valid until` term begins at y=706; the price is also below the visible card area. The user can immediately confirm without seeing either. The markup places the action after the terms in [`flow-screens.tsx`](../../../src/components/beacon/flow-screens.tsx#L565) and [line 582](../../../src/components/beacon/flow-screens.tsx#L582), but the flex layout gives the action visual priority on short screens. The associated decision labels are only 9–10 px in [`flow-screens.module.css`](../../../src/components/beacon/flow-screens.module.css#L897)–[line 914](../../../src/components/beacon/flow-screens.module.css#L914), including the simulation/operator badge at [lines 775–784](../../../src/components/beacon/flow-screens.module.css#L775).

**Impact:** This weakens the exact-offer consent gate on compact devices and makes the source, expiry, and fee language difficult to read at normal phone scale.

**Fix:** On compact heights, keep price, expiry, cancellation, and the simulated-source label together in the initially visible review area before the primary action; allow scrolling below them for explanation/alternatives. Raise decision-critical terms/status text to a readable size (at least the surrounding 12–14 px scale) and retain the 44 px targets.

### P2 — Welcome metadata and hero copy overstate Beacon’s scope

**Requirement:** Beacon is a mobility coordinator, not a safety guarantee; this checkout is a local simulation, not live booking.

**Evidence:** The welcome metadata says “Get home safer with Beacon” in [`src/app/onboarding/welcome/page.tsx`](../../../src/app/onboarding/welcome/page.tsx#L6)–[line 9](../../../src/app/onboarding/welcome/page.tsx#L6), while the visible hero says “Beacon handles the rest” at [lines 25–28](../../../src/app/onboarding/welcome/page.tsx#L25). Later screens correctly say “Beacon coordinates options. Not an emergency service.”

**Impact:** The first indexed/visible impression promises a safety outcome and broader execution than the product can support.

**Fix:** Use the same calibrated language on Welcome and in metadata, for example that Beacon helps coordinate a way home and is not an emergency service; retain the clearer boundary already shown on Home/Help.

## Verified strengths

- No P0 finding. The normal journey visibly separates plan confirmation, provider identity, access authorization, simulated payment, and booking. The local-only/source labeling is consistently present in the recommendation and trip detail states.
- The exact-location gate is enforced in both transition state and persisted-state validation: an authorization or sensitive-data flag without verified identity and user approval is rejected in [`trip-storage.ts`](../../../src/components/beacon/trip-storage.ts#L21)–[line 22](../../../src/components/beacon/trip-storage.ts#L22).
- Replacement begins only after reconciliation, clears approval, and presents a fresh offer; walking and scheduled transit skip payment/booking as required. The current screenshots match those distinct states.
- Unknown booking/payment, cancellation pending, offline/reconnect, restoration failure, location fallback, overdue, and help are concrete states rather than generic error pages. The published main, scenario, and sheet results report no browser errors.
- The captured 360/393/430/desktop views have no horizontal overflow, major actions are 44 px or larger, sheets use Base UI dialogs, and the warm ivory/forest/sage system maintains a clear one-task hierarchy.

## Limits

This is a local browser and source review. I did not claim actual PWA installation, a physical-device safe-area audit, live provider identity, booking/payment, map, or GPS behavior.

## Follow-up verification — September 19, 2026

The two P1 findings are resolved in the updated development app at `http://localhost:3000`; no new actionable issue was found in this bounded recheck.

- **Manual home setup resolved.** The chooser now offers named, labeled Home and Address fields, validates them through the existing profile rules, selects the accepted value, and explains that it remains local-demo data. I entered `Harper Hall` / `123 Campus Drive, Blacksburg, VA` at 390 × 844; the sheet closed and the setup card showed both values, with no browser error. See [`src/app/onboarding/home/page.tsx`](../../../src/app/onboarding/home/page.tsx#L236)–[line 254](../../../src/app/onboarding/home/page.tsx#L254).
- **Offer-consent ordering and readability resolved.** At 320 × 568, the decorative plan art is removed and price, source label, walking/destination, fee, expiry, and cancellation facts precede the static Confirm button. At 390 × 844, those facts and the approval explanation likewise precede the button. Scrolling to the action at 320 keeps the complete fact row and the explanation directly above it. Decision-critical source/terms/approval text now computes to 12 px. See [`src/components/beacon/flow-screens.tsx`](../../../src/components/beacon/flow-screens.tsx#L565)–[line 594](../../../src/components/beacon/flow-screens.tsx#L594) and [`flow-screens.module.css`](../../../src/components/beacon/flow-screens.module.css#L744)–[line 748](../../../src/components/beacon/flow-screens.module.css#L748), [lines 904–920](../../../src/components/beacon/flow-screens.module.css#L904).
- **Welcome metadata resolved.** It now states that Beacon helps coordinate a way home and is not an emergency service. The visible “Beacon handles the rest” line remains by approved product direction, so it is not carried forward as a finding.
