# Integration browser evidence

## Final rebuilt production result

**PASS — 26 check groups, 52 screenshots, zero browser console/page errors.** Final production `http://localhost:3100` was checked after root's combined rebuild. Evidence: [`final results`](final-integration/results.json), [`MP4 tap recording`](final-integration/video/explicit-response-walkthrough.mp4) (also [WebM](final-integration/video/explicit-response-walkthrough.webm)), [`final screenshots`](final-integration/screenshots). The MP4 is H.264/yuv420p with faststart, 390×844, 68 seconds, verified with ffprobe and a full error-free decode. Its VP8 WebM source is preserved. The earlier initial run is preserved separately.

Additional final checks prove:

- Unknown booking Retry keeps the original attempt unresolved for 4.6 seconds; an explicit response resolves it.
- Real browser offline/online events lead to reconnection pending for 4.6 seconds; only the explicit response restores the same waiting trip.
- Failed verification Retry returns to pending identity with exact location withheld; it does not self-complete.
- Walk-to-stop → stop completion → I’ve boarded → I’m home works, without a map after walking.
- Absent fixture distance, duration and ride ETAs stay absent. No Lyft label is rendered.

I visually inspected final walking, unknown-source, transit-boarded, cancellation pending and 360px walking-action captures. The previous contradictory walking intro is resolved to “Route display example; not for navigation.” Route/provider update time is explicitly not supplied. The cancellation status no longer has the prior connection-note overlay.

**No unresolved P0/P1/P2 finding in this bounded browser pass.** It verifies the local adapter and deliberate sample responses, not live providers, real campus geometry, Google credentials or backend API availability. The sole line fixture is the published decoder contract example, explicitly unsuitable for navigation; its missing directions and measurements remain unknown.

## Preserved initial run

Initial production run at `http://localhost:3100` passed 19 check groups with 46 screenshots and zero browser console/page errors. The run uses actual onboarding, student confirmation and Judge controls taps; no fixture is substituted directly into the main recorded browser journey. Responsive checks restore the actual captured waiting snapshot from that journey.

Evidence: [`initial-integration/results.json`](initial-integration/results.json), [`recorded walkthrough`](initial-integration/video/explicit-response-walkthrough.webm), [`screenshots`](initial-integration/screenshots).

Verified explicit responses across discovery, comparison, identity, authorization, booking, pickup, riding and arrival. Discovery, identity, waiting, cancellation pending and replacement confirmation stayed unchanged during 4.6-second probes. Refresh retained the same attempt and response revision. Recovery reconciled the old attempt before a fresh confirmation.

Walking-to-pickup and walking-to-stop used the supplied decoder example line only while the walking leg was active; completion removed the map. Walking-home confirmation completed the trip. Loading/unavailable/stale fixtures visibly preserve missing route evidence. Waiting and riding never display a walking map. Source labels remain simulated or unconfirmed, with no Lyft claim. These are provisional adapter examples, not live backend/provider/map proof.

Phone coverage: recorded 390×844; separate 360×800, 393×852, 430×932 and 1440×1000 captures. All captured layouts passed horizontal-overflow checks; measured final visible controls met 44px targets. Walking completion controls remained reachable by scrolling.

One initial P2 copy issue was sent to root: fixture walking intro instructed the user to follow the route/directions even though the fixture is explicitly not for navigation and supplies no directions. Final refinement/rebuild verification above confirms this is fixed. No source files were changed by this browser worker.
