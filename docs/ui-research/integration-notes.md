# UI integration boundary

## Current evidence

After consolidation, this checkout contains the Trip API, Student Agent, ANS client
and Databricks adapter alongside this UI. The UI itself still uses its deterministic
frontend simulation; merging the branches does not wire its controller to the API.
Its timeline is demonstration evidence, not proof of sponsor integration. The next
steps are assigned in [the pivot update plan](../Beacon_Pivot_Updates_To_Do.md).

The UI pass does not change the shared contracts. The PRD and `TEAM_CONTRACT.md` remain the authority for backend integration.

## Handoff to real trip state

- Keep the visual components and map/sheet shell. Replace demo event production with the existing team's Trip API when it arrives.
- Feed candidates, selected plan, recommendation explanation/reason codes, verification flag, sensitive-data flag, expected arrival and status from the returned `Trip`.
- `SELECTED` means awaiting the user's GO in the frozen shared type. The PRD calls this awaiting confirmation; no shared type rename is needed.
- Render verification, coordination, waiting, in-trip, failure, replanning and arrival from actual backend events. Browser timers are demo-only.
- A completed identity check alone does not authorize release. Show release only when the backend's `sensitiveDataReleased` flag is true; precise data protection must be enforced server-side.
- Replace fixture-based candidate filtering with the Databricks-produced recommendation. The frontend demo only exercises preferences and UI states.
- Persisted profile and demo session are local preview data. They are not a server user record or a booking.
- Never cache API or trip responses in the service worker. Offline reload uses a public reconnect document; live status must be refreshed online.

## Product limits retained

No account system, payment, driver marketplace, chat, crime score, automatic emergency dispatch, or background location guarantee. Help links require user action. Browser vibration is an optional enhancement and unsupported platforms receive the same visible feedback.

## Useful QA controls

The optional judge panel exposes simulation controls so reviewers can reproduce cancellation, verification failure, unavailable options, overdue check-in and arrival without external side effects. Consumer trip details remain separate from this panel.
