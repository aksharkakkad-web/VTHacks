# Atomic backend integration mapping

Inspected `origin/main` at `d252f6a`. This is a source-contract review, not a claim that live credentials, laptop worker, notifications, or provider integrations were exercised.

## One authoritative response

Use `GET /api/trips/:id/journey` after each action and for restoration. It returns `{journey, trip, coordination, ride, arrival, notification, selectionCurrent, navigation, planning, planningSnapshotId}`. Do not combine independently fetched trip/evidence snapshots into consent state. Action responses are `Trip`, not the atomic envelope: refetch the journey before rendering actionable details.

| UI surface | Exact response source and rule |
| --- | --- |
| Discovery / comparison | `trip.state`, `trip.candidates`, `trip.recommendation`; dynamic IDs are opaque strings, not frozen fixture IDs. |
| Recommendation | `trip.selectedPlan`, `journey.complete.selected`, `journey.complete.alternatives`; display authoritative prices/durations. `journey.complete.execution` identifies Databricks vs local fallback. |
| Confirm button | Enabled only for a current selection and `coordination.requiredAction === "confirm"`; submit current `journey.revision`, selected plan ID and quote ID. Refresh on `JOURNEY_CHANGED` / `SELECTION_CHANGED`. |
| Identity / authorization | `trip.providerVerified`, `trip.sensitiveDataReleased`, `coordination.operator.verification` (`ans_verified`, `local_demo`, `not_verified`). Local demo verification is not live ANS verification. |
| Payment / booking | `coordination.requiredAction` (`check_booking`, `refresh_quotes`, `payment_declined`, `confirm`, `none`), `coordination.payments`, `paymentMode`, `paymentNotice`, `remainingBudgetMinor`. Unknown settlement remains pending. |
| Pickup details | `coordination.selectedOffer.pickupInstructions`, `journey.pickup`, `ride.meetingInstructions`, `ride.driver`, `ride.vehicle`, `ride.pickupEtaSeconds`. Absent fields remain unavailable. |
| Update timestamp | `ride.providerUpdatedAt`, or clearly labeled receipt time `ride.receivedAt`; `journey.createdAt` is snapshot creation, not a provider update. |
| Walking map | Find active leg by `journey.nextStep.legId` in `journey.complete.selected.legs`; show map only when `nextStep.showMap` and leg `kind === "walk"`. Use this leg's `route`, not the whole journey or a fixture. |
| Wait / ride / bus | Active leg kind `wait`, `ride`, or `bus` uses status content; `ride.stage` is `searching`, `assigned`, `approaching`, `arrived`, `in_trip`, `completed`, `cancelled`, or `unknown`. Ride completion is not home arrival. |
| Navigation handoff | `navigation.googleMapsUrl` / `appleMapsUrl` target current walking leg endpoint; `pathRelationship` says external app selects its own path. |
| Replacement | New selected plan and `coordination.requiredAction === "confirm"`; require fresh revision/quote consent. Do not reuse the old booking's approval. |
| Arrival | `trip.state === "ARRIVED"` or `arrival.status === "ARRIVED"`; no elapsed-time arrival inference. |
| Overdue / contact alert | `trip.state === "OVERDUE"`, `notification.state` (`sending`, `sent`, `simulated`, `failed`, `uncertain`). `simulated` means no Telegram message sent; `sent` means accepted by Telegram, not read by contact. |
| Agent activity | Owner-only `GET /api/trips/:id/activity?after=<cursor>`; optional presentation enhancement, not booking authority. |

## Actions

All public mutations use same-origin JSON and the HttpOnly `beacon-session` cookie. Store only a trip ID for restoration; server state remains authoritative.

| Interaction | Endpoint / payload / sequencing |
| --- | --- |
| Start trip | `POST /api/trips` with `journeyContract: "beacon-journey-v1"`, `origin: {lat,lng}`, `preferences: {home:{lat,lng}, maxBudget, walkingPreference, transferPreference, ...}`, optional `temporary_context`. Returns trip ID and establishes owner cookie. |
| Find/evaluate | `POST /api/trips/:id/discover {}` then `/evaluate {}`. Await each; no UI timer simulates completed stages. |
| Confirm offer | `POST /api/trips/:id/confirm {journeyRevision, planId, quoteId}`. `quoteId` is from `coordination.selectedOffer`; walking/transit may have no quote. `journeyContract` is a create parameter. |
| Verify/request | `POST /verify {}` then `/request {}` after confirmation. Repeated `/request` reconciles an uncertain booking or returns the existing active booking instead of creating another. |
| Refresh | `GET /journey`; this only reads state. It does not invoke provider polling or monitoring. Backend monitor must run separately. |
| Current location | `POST /location {lat,lng,recordedAt,accuracyMeters}`. Reject stale/out-of-order samples; use real browser permission and coordinates, or explicitly labeled operator demo input. |
| Home confirmation | `POST /arrive {}`. This completes the entire trip and cleans up provider/location state; never use for pickup walk completion. |
| Changed conditions | `POST /replan {journeyRevision,reason}` where reason is `route_changed`, `pickup_changed`, or `conditions_changed`. Existing booking cleanup and fresh consent are server-owned. |
| Provider-cancellation demo | `POST /api/demo/trips/:id/cancel-provider {}` triggers provider failure/recovery, not user cancellation. |
| Ride demo progress | `POST /api/demo/trips/:id/advance-ride {stage,pickupEtaSeconds?}` for `approaching`, `arrived`, `in_trip`, `completed`, `cancelled`. Requires enabled demo and existing booking. |
| Laptop pairing | `POST /api/demo/planner/pair {code}` only when `BEACON_PLANNER_MODE=codex_laptop`. Human/operator gets code from the authenticated worker path. UI must never request worker token. |
| Laptop planning | `POST /api/trips/:id/planning {}` after pairing; 202 response. Atomic response includes planning bound to the current snapshot. Handle `PAIRING_REQUIRED`, `PAIR_CODE_INVALID`, stale/queue errors honestly. |

## Backend gaps and operational dependencies

1. **User cancellation was absent upstream; implemented in this integration.** `POST /api/trips/:id/cancel {}` now returns a stopped trip, followed by atomic `cancellation: {status:"pending"|"resolved",attemptId?,requestedAt,resolvedAt?}`. The sidecar dominates the frozen `FAILED` state. Provider cleanup retains the same attempt, pending settlement retries through the monitor, and no replacement is requested. Repeated cancellation is idempotent. Other trip mutations reject with `TRIP_CANCELLED`. Calling `/arrive`, reset, or demo cancel-provider is still not a substitute.
2. **No walk-complete or board action.** Active leg advances from sufficiently fresh, accurate location near the leg endpoint or from ride observations. UI cannot fabricate coordinates for a normal student action. Keep walking/transit progress location-driven, or add an explicit backend acknowledgment contract if required.
3. **No arbitrary alternative selection action.** Confirm validates the already-selected plan; supplying another `planId` does not select it. Comparison can be informative, or selection requires a backend change/re-evaluation route.
4. **GET journey is read-only.** Live provider progress/reconciliation/deadline checks require `agent.monitor()` via protected `POST /api/trips/monitor`, or authenticated provider events; browser polling alone will not progress a ride. Operator demo actions are available when enabled.
5. **No trip-list/current-trip lookup.** Restore from locally persisted trip ID plus owner cookie. Missing cookie/expired server record must show a recoverable new-trip prompt; never recreate a booking automatically.
6. **Trusted contact is Telegram-specific.** Create accepts `trustedContact: {name,telegramChatId,consent,shareLocation}`. A phone number from onboarding is not a chat ID. No general contact-pairing endpoint was found; planner pairing is unrelated. Do not claim a configured notification destination without a real valid Telegram contact and consent.
7. **Arrival GPS policy is strict.** Radius 75m, accuracy at most 30m, at least 3 samples spanning 30s, maximum 20s sample gap, maximum 30s sample age. Manual `/arrive` remains available. Provider `completed` intentionally leaves home arrival unconfirmed.
8. **No accepted/pending stage for every visual screen.** Backend action work can finish within one response. Show real request-in-flight states, then the returned state; do not add delays just to expose all 14 screen shells.

Source anchors: `src/lib/trip-state/http.ts`, `src/agents/student/service.ts`, `src/agents/student/input.ts`, `src/agents/student/coordination.ts`, `src/lib/journey/contracts.ts`, `src/lib/decision-client/journey-types.ts`, `src/lib/journey/navigation.ts`, `src/lib/journey/arrival.ts`, `src/lib/planner/http.ts`. Relevant regression cases are in `src/agents/journey-coordinator.test.ts` (exact consent, repeated request, cancellation/replanning, location advancement, final walking leg) and `src/agents/arrival.test.ts`.
