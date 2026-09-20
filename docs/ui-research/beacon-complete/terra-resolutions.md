# Terra findings and resolutions

See `terra-review.md` for the independent review and verified follow-up.

| Priority | Finding | Resolution | Verification |
|---|---|---|---|
| P1 | First-time home setup lacked manual entry | Added labeled home/address fields using existing validation, preserves the local-demo disclosure and saved draft | Agent and Terra independently entered custom homes; invalid values remain in the sheet |
| P1 | Small-phone sticky confirmation could appear before the offer terms; 9–10px labels | Confirmation now follows all facts in normal reading order; price/source/expiry/cancellation stay together; critical labels are at least 12px; short-screen decorative art hidden | Terra checked 320×568 and 390×844; browser suite asserts terms precede the action |
| P2 | Safety-oriented Welcome metadata | Replaced with coordination wording and emergency-service boundary | Metadata inspected; user-approved “Beacon handles the rest” hero preserved |

No P0 issue was found. No unresolved actionable finding remained in Terra’s bounded follow-up.

Additional final refinement: Details and Help share one row during identity/access/booking; the cancellation control remains accessible at 360×800. Gallery content uses the actual frame height so its footer is not clipped. Touch targets include a 44px search-clear action. Active layouts use dynamic viewport height and safe-area padding. Editable text is 16px to avoid iOS input zoom. Existing illustration originals are preserved; optimized WebP derivatives reduce the Welcome background from about 1.2MB to 27.5KB and its logo from about 380KB to 22.6KB.

## Parallel batch review corrections

- A: enlarged the home chooser close target and search input to 44px, enlarged the shared budget range target to 44px, and raised its manual-demo disclosure to 12px. The final setup pass reports 85 successful checks at four phone sizes.
- B: no additional correction requested. Exact terms, source labels, consent order and separate identity/access/payment/booking states passed the targeted planning audit.
- C: added trip details on travel and arrival, verified opening/closing and focus return. Walking/transit arrival now states local plan completion without implying provider access existed. Long-page controls were tapped after scrolling to prove reachability.
- Astra: removed opacity from pending-state text so it stays readable; only the decorative ring is muted. Invalid saved booleans/timestamps/recommendation fields now fail closed through the session recovery screen instead of reaching rendering.

Production confirmation for the final combined batch is recorded in verification.md and the machine-readable results.
