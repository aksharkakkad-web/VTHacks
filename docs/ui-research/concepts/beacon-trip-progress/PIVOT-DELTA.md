# Screen changes after the provider-network pivot

Reviewed September 19, 2026. Imported main documents at `ef8b2bdb4ddd59a8eca5e9ddb1f39774f72edb15`. PR #23 was OPEN at review; its contract was inspected at `bcf8d946b6dda5eb2bc66b4a011ab8c134216410`. PR behavior is a pending integration target, not merged behavior.

Sources: `docs/Beacon_Pivot_What_Changes.md`, `docs/Beacon_Pivot_Updates_To_Do.md`, `docs/Beacon_Product_Direction.md`; PR #23 `docs/MAHIN_MVP_CONTRACT.md` and `docs/MAHIN_MVP_STATUS.md`.

## Corrections to the four concepts

- Availability: display compatible returned services, not a permanently fixed provider list. Separate service name from actual operator. Clearly label simulated execution; do not suggest commercial provider partnerships.
- Comparison: compare eligible, unexpired offers against saved constraints. Preserve unknown walking/wait/transfers and actual ranking source. Saved preferences are not proof that all requirements have been observed or satisfied.
- Provider: identify the operator separately from the service. Display actual identity-check status and source. Local demo trust must never look like live ANS verification. Identity is not booking or payment permission.
- Authorization: show booking authorization and simulated payment as separate states. Keep exact location private until required checks pass. Current image lacks payment pending/declined/unknown states and needs redesign for these.

The existing visual palette and custom campus art remain usable; copy and state coverage need revision. These are concepts, not a new integration claim.

## Prioritized PWA work

1. Inspect the latest merged contracts and reconcile the current local UI work without overwriting it. Confirm whether PR #23 has merged before implementing against its additive coordination model.
2. Add owner-authenticated Trip/evidence API consumption. Drive progress from authoritative responses, not timers. Preserve visibly separate demo controls.
3. Redesign recommendation/confirmation to show operator, service, simulated/live source, price basis and total, expiry, material cancellation terms, and unknowns. PR #23 requires the displayed `{planId, quoteId}` for v2 confirmation.
4. Add booking pending, accepted, rejected/unknown, simulated payment status, and actual pickup instructions or an unavailable label. Do not invent vehicle movement from a walking route.
5. Add reconciliation before replacement. PR #23 requires fresh replacement confirmation unless explicit bounded replacement permission was recorded. Earlier notes that rejected a second confirmation must not be reused as the default for this contract.
6. Cover expired/changed offers, payment declined/unknown, no feasible plan, reconnect, repeated taps, and arrival. Reload authoritative state on reconnect; do not cache private API data.
7. Verify the integrated small-phone journey and privacy/consent behavior after implementation.

Main's TODO checklist is a planning document, not a live completion ledger. PR #23 reports backend implementation and local tests, while explicitly leaving UI and hosted integration outstanding. Those test results were read, not rerun in this documentation task.
