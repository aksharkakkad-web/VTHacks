# Beacon student PWA — completion evidence

This is the complete student-facing **local deterministic demo**. The normal path runs from onboarding through arrival without judge controls. This checkout has no backend API route implementations; provider identity, trip authorization, payment, booking, and trip progress are clearly labeled simulations. The interface must not be described as a live transport service or a safety guarantee.

## Run and inspect

- Student flow: `http://localhost:3000/` or `/app` after onboarding.
- Judge fault controls: `http://localhost:3000/demo`; kept outside student navigation.
- Development gallery: `http://localhost:3000/beacon-system`; 46 real-component specimens and long-content/reduced-motion controls. Production returns 404.
- Production audit server: `http://localhost:3100/`.
- A fresh browser context starts at Welcome. Returning profiles skip onboarding. Refresh and the start URL restore the same local simulated trip within the session. Closing the session is not a replacement for server-backed trip recovery.

To run from a terminal: `npm run dev`. For a separate production build without disturbing an existing development server, run `BEACON_DIST_DIR=.next-beacon npm run build`, then `BEACON_DIST_DIR=.next-beacon npm run start -- --port 3100`.

## Inventory and design evidence

- [Screen/state acceptance matrix](acceptance-matrix.md): 01–14, R1–R4, E1–E11, walking, scheduled transit, sheets, restoration and PWA; ownership and integration status.
- [Research](research.md): 20 screen/state references, design decisions, source links and asset boundaries.
- [Terra review](terra-review.md) and [resolutions](terra-resolutions.md): no P0; both P1 findings fixed and independently rechecked.
- [Gallery evidence](gallery/results.json): all 46 specimens rendered. This supplements, not replaces, the connected walkthrough.
- `screenshots/`: phone captures of numbered screens, recovery/errors, sheets, compact and larger viewports.
- `frontend/` and `workstream-a/`, `workstream-b/`, `workstream-c/`: additional phone, long-content, accessibility and independent batch review evidence.

The Welcome composition remains the anchor. Existing artwork originals were preserved, with small WebP derivatives for delivery. The interface uses ivory/forest/sage, large controls, clear status labels, safe-area spacing, dynamic viewport height and reduced motion. Price, expiry and cancellation facts precede consent. Identity, private-data authorization, simulated payment and booking remain distinct. Replacement requires new confirmation.

## Recorded running application

- [Main walkthrough](video/main-walkthrough.mp4): actual 390×844 running app, real taps and automatic state transitions, from onboarding to arrival.
- [Original main recording](video/main-walkthrough.webm).
- [Recovery and edge walkthrough](video/recovery-and-edge-walkthrough.webm): real interactions through deterministic fixtures, including provider failure, fresh replacement approval, walking/transit and error recovery.

These are browser recordings, not mockup slides. Automated fixtures use the production reducer; the main walkthrough begins at Welcome without seeded trip state.

## Verification

See `verification.md` for commands and final results. Machine-readable results are `main-results.json`, `scenario-results.json`, `sheets-results.json`, `pwa-results.json`, and each workstream’s output. Phone sizes include 390×844, 393×852, 360×800 and 430×932, with an additional 320×568 compact check and desktop.

## Honest external boundaries

- No live provider/ANS/Databricks/payment/booking/notification integration is implemented in this checkout. The typed local adapter is the working fallback; sponsor credentials and teammate backend work were not changed.
- Saved-trip restoration is validated local session state. A real authoritative server restore requires the agreed backend endpoints and session binding.
- Pickup instructions, live driver identity, route geometry, and live transit arrivals are not fabricated. Walking has no live navigation geometry; transit is scheduled demo information.
- Precise browser coordinates are never transmitted by this demo. Testing location permission discards returned coordinates. The simulator separately demonstrates the required consent → verified identity → authorization gate.
- Chromium manifest/installability, service-worker behavior, safe-area CSS, blocked storage and phone viewport checks passed. Physical iPhone/Android installation, OS keyboard/safe-area behavior and background termination were not directly tested. This environment has no Safari/WebKit runtime or physical phone.
- A phone outside this machine needs a reachable HTTPS deployment for service-worker/install behavior; production localhost is valid for local audit. No deployment, push, PR, merge, payment, outgoing call, or message was performed.
