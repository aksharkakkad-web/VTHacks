# UI integration boundary

## Current evidence

Updated September 19, 2026: this checkout has shared trip contracts and provider agent services under `src/agents/`, but no implemented student `/api/trips/**` route handlers. The UI now accepts an injected frontend transport and explicit sample responses. Mahin’s simulated rideshare backend is the intended authoritative demo source; no live commercial rideshare support is claimed. See `beacon-integration/README.md` and `beacon-integration/contracts-research.md` for the current audited boundary.

The UI pass does not change the shared contracts. The PRD and `TEAM_CONTRACT.md` remain the authority for backend integration.

## Handoff to real trip state

- Preserve the visual system and sheets. Connect Mahin’s transport to the validated frontend adapter when the endpoint contract is agreed. Show exact route geometry only for an active walking leg; waiting/riding use the ride-status card.
- Feed candidates, selected plan, recommendation explanation/reason codes, verification flag, sensitive-data flag, expected arrival and status from the returned `Trip`.
- `SELECTED` means awaiting the user's GO in the frozen shared type. The PRD calls this awaiting confirmation; no shared type rename is needed.
- Render verification, coordination, waiting, in-trip, failure, replanning and arrival from actual backend events. Frontend timers must not manufacture trip/provider status, including in demos. Apply explicit judge sample responses instead.
- A completed identity check alone does not authorize release. Show release only when the backend's `sensitiveDataReleased` flag is true; precise data protection must be enforced server-side.
- Replace fixture-based candidate filtering with the Databricks-produced recommendation. The frontend demo only exercises preferences and UI states.
- Persisted profile and demo session are local preview data. They are not a server user record or a booking.
- Never cache API or trip responses in the service worker. Offline reload uses a public reconnect document; live status must be refreshed online.

## Product limits retained

No account system, payment, driver marketplace, chat, crime score, automatic emergency dispatch, or background location guarantee. Help links require user action. Browser vibration is an optional enhancement and unsupported platforms receive the same visible feedback.

## Useful QA controls

The optional judge panel exposes simulation controls so reviewers can reproduce cancellation, verification failure, unavailable options, overdue check-in and arrival without external side effects. Consumer trip details remain separate from this panel.
