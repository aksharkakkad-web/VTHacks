# Beacon hackathon demo acceptance

The local demo is prepared for presentation. Scope follows the user's final direction: prioritize complete screens, correct visuals, and working presentation journeys over exhaustive repair of historical test harnesses.

## Present it

Open http://localhost:3000/demo. Complete onboarding, tap **Get me home**, review the plan, and **Confirm this plan**. The server supplies discovery, comparison, verification, authorization, simulated payment, booking, pickup and trip updates. Tap **I'm home**, then **Finish** to return Home. No Judge action is needed for the normal trip.

For recovery, open Judge controls while waiting and tap **Cancel provider**. The cancelled attempt reconciles, a replacement offer appears, and the student must confirm that offer. For student cancellation, tap **Request cancellation**, review the terms, and submit. Pending cancellation resolves through a server response.

## Fresh evidence

- `scripts/pre-pr.sh`: lint, 54 unit/integration checks, type checking, production build.
- `bash src/agents/test.sh`: six provider checks.
- `scripts/verify-beacon-gallery.mjs`: 46 screen/sheet examples at 390px; no page errors or horizontal overflow.
- `scripts/verify-beacon-setup-final.mjs`: 85 checks across 360/390/393/430px; zero failures, small touch targets, input font defects, page errors or console errors.
- `scripts/verify-beacon-signoff.mjs`: normal journey, exact Screen 08 heading, response pickup/time, no waiting map, recovery with fresh consent, cancellation pending/resolved with the same attempt, three actual browser recordings. Exact current results and recording paths: [results.json](results.json).
- Additional browser checks: refresh restores the same authoritative attempt; 360/393/430/1440px waiting cards have no horizontal overflow. Captures are under `screenshots/viewport-*.png`.
- The normal, waiting, replacement, arrival and cancellation screenshots were visually inspected. Screen inventory includes all 14 core screens plus recovery, errors and supporting sheets.

Run browser scripts with `PLAYWRIGHT_MODULE=/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright BEACON_URL=http://localhost:3000`.

## Response fields and boundaries

`src/lib/demo/transport-server.ts` owns deterministic sessions. `/demo/transport` returns normalized TripResponse values through the replaceable TripTransport interface. Stage selects the screen; revision/trip/attempt IDs reject stale, foreign and duplicate updates; verification/authorization/payment/booking fields preserve separate gates. Mobility ride fields supply pickup location, meeting instructions, ETA, reference and update time. No driver identity or vehicle is invented. Source is visibly **Simulated rideshare · Demo data**.

Mobility leg kind selects walking versus status cards. The walking renderer uses supplied route geometry; the existing contract geometry is explicitly an example, not campus navigation. No browser Google Routes call or credentials were added. Screen 08 says **Your plan is ready.** before booking. Terminal screens display completed/cancelled status instead of pickup placeholders.

## Timer inventory

- safe-circle-app interval: polls the server every 500ms and applies its validated response; the callback cannot advance a stage by itself.
- safe-circle-app timeout: expires an offer using its supplied expiry timestamp, never approves a booking.
- launch-animation timeout: visual launch transition only.
- The server paces deterministic fixture events. These are simulation responses, not real provider events. Arrival/boarding actions use the transport when connected.

## Honest limitations

This is a local deterministic demonstration. No live rideshare booking, charge, ANS, Databricks or Google Routes integration is claimed. The repository has provider modules but no compatible student trip API to connect; the isolated demo transport fills that boundary. Sessions are in server memory: restarting the server requires starting a new demo trip. Existing $2/$8.40 fixtures were preserved despite older planning documents quoting different values.

Historical scripts that assume elapsed-time frontend progression or a Judge panel that remains open are preserved as historical coverage, not represented as passing current acceptance. The current presentation acceptance is the targeted suite above; exhaustive modernization of every old harness remains outside this expedited presentation pass. Nothing was pushed or deployed.
