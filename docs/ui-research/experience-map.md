# SafeCircle experience map

This is the UI track. There are no implemented trip APIs in this checkout. Provider/ANS/Databricks events remain an explicitly identified simulation using the shared `Trip`, `CandidatePlan`, and `Recommendation` contracts. Do not claim bookings or live verification.

## Interaction map

```text
First visit → Save home → Set budget and walking preference → Home
Returning visit → Home (saved preferences)
Home ↔ Edit home/preferences / optional trip context
Home → Get me home → Discovery → Quotes → Evaluation → One recommendation
Recommendation ↔ Why this plan / secondary alternatives
Recommendation → GO → Identity check → Authorized coordination → Accepted → Waiting
Waiting → Arriving → In trip → Arrived → Finish → Home
Waiting / coordination → Provider cancelled → Reevaluate → Replacement selected
→ Replacement identity check → Authorized coordination → New ride confirmed → Waiting
Any stage ↔ optional technical timeline / help
Search or recovery → No suitable options → Adjust preferences / Try again
Identity failure → Precise location withheld → Retry / Return home
Connection loss → Keep last known state, label stale, pause demo → Reconnect
Overdue → Are you home? → Confirm arrival / Still travelling / Help
```

## State inventory and intended design

| State | User objective / required information | Action and next state | Composition |
|---|---|---|---|
| Bootstrap | Restore local preferences, no false trip status | Automatic | Quiet loading surface |
| Saved home setup | Enter home name/address, know demo geography | Continue after valid input | Map + spacious form sheet |
| Preferences | Budget, normal/minimal walking; transfers optional | Save and continue | Same sheet, two essential controls; optional detail disclosed |
| Home | Saved destination and concise preferences | GET ME HOME; edit; optional context | Map dominant, low sheet, one mint CTA |
| Temporary context | Budget override / minimize walking / tired or drinking if voluntarily chosen | Apply for this trip; clear/cancel | Short dialog, no chatbot |
| Discover / quotes / evaluate | Finding the best way home, actual current progress | Automatic; optional details | One evolving search sheet, status text with semantic progress |
| Recommendation | Home ETA dominates; provider, pickup ETA, cost, explanation | GO; why/alternatives disclosure | One recommendation, white sheet; no premature Verified badge |
| Verification | Provider identity being checked, exact pickup withheld | Automatic; failure path | Calm progress in same shell |
| Coordination / accepted | Identity passed, request sent, provider acceptance pending/confirmed | Automatic | Distinct status copy; no false acceptance |
| Waiting / arriving | Pickup ETA, pickup point, provider, destination | View details / help | Map + compact trip sheet, meaningful route |
| In trip | Time to home, destination, status | Details / help | Same trip sheet with changed metric/progress |
| Cancellation | Previous ride unavailable; SafeCircle handling recovery | Automatic | Brief amber notice; no required retry |
| Reevaluate / replacement selected | Same constraints, new plan being prepared | Automatic | Calm status rows; no unverified replacement claims |
| Replacement verification / coordination | Replacement identity and authorization independently checked | Automatic | Same verification pattern |
| Replacement confirmed | New provider + ETA + price, within approved constraints | Automatic to waiting | Simple confirmation; no second acceptance |
| Arrival | Home, trip complete; access ended, sharing ended | Finish | Restrained success, short summary |
| No options | No option fits approved constraints | Edit preferences / try again | Plain recoverable empty state |
| Verification failure | Unable to verify; precise location withheld | Retry / return home | Clear failure with action, no false trust badge |
| Offline | Updates paused; last known state not current | Automatic reconnect; accessible retry | Quiet notice; no timer pretending to receive events |
| Advanced context unavailable | Basic preference-based option still usable | Normal flow | Small explanatory notice; judge view identifies fallback |
| Overdue | Check in without invented contact notification | Home / still travelling / help | Calm check-in sheet |
| Help | Immediate call action if needed | User-initiated phone link, close | Accessible dialog; no invented trusted contact |
| Technical view | Actual simulated chronology, candidate metrics, trust gate, recovery | Close; demo scenario controls | White modal/drawer, timeline and compact table |

## Invariants

- Verified badge requires `providerVerified`, not merely a provider capable of verification.
- Before GO and identity/authorization success, sensitive data is withheld.
- Replacement must fit approved budget/walking/transfer constraints; otherwise surface no-options.
- Arrival refers to the actual chosen provider (initial or replacement), not always Rideshare.
- Consumer trip details are distinct from optional judge diagnostics.
- Every visible control either performs its named action or is absent. A decorative grabber must not imply unsupported drag; use a real accessible expand/collapse control where needed.
- Status changes announced; dialogs manage focus, Escape and return focus. No fake mobile system bar.
- Default fonts: Instrument Sans; body 16px, secondary 14px, metadata 12px, screen titles 32px, primary ETA 44px.
- Map route dark forest; mint limited to CTA/current/verified/success. All colors and geometry centralized.
- Onboarding/profile data persists locally. No auth, messaging, payment, map search service, or new backend.

## Review plan

Two independent Luna Max critiques before implementation and after rendered screenshots. State families are refined sequentially: setup/home, discovery/decision, coordination/trip, recovery/arrival, supporting dialogs/fallbacks. Capture all major states, compare together, improve weakest states, then run full path plus failure scenarios and repository checks.
