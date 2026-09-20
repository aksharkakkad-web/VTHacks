# Integration acceptance matrix

Owners: Astra = contracts/state/storage/judge/gallery/PWA/integration; frontend = mobility components/renderer/styles; Terra = regression tests + read-only review; QA = new real browser walkthrough. No overlapping source ownership. The completed original screen inventory is retained in `../beacon-complete/`; this matrix scopes the integration change only.

| Screen/state | Production path/component | Owner | Implementation | Review / phone proof |
|---|---|---|---|---|
| 01 Restore | trip-storage + SafeCircleApp | Astra | Demo restores; backend snapshot waits for refresh | Passed: browser demo restore + backend-refresh unit tests; endpoint pending |
| 02–05 Onboarding/Home | Existing screens | Astra | Preserved; no decorative map masquerading as route | Passed: new-user real-tap regression and preserved baseline |
| 06–07 Discovery/comparison | FindingScreen | Astra | No timed status changes; explicit response only | Passed: final 26-group browser run + 53 regression tests |
| 08 Offer/confirmation | RecommendationScreen | Astra | Exact-offer consent, repeated tap guard retained | Passed: final 26-group browser run + 53 regression tests |
| 09 Identity | JourneyScreen | Astra | Response driven; distinct from access | Passed: final 26-group browser run + 53 regression tests |
| 10 Authorization | JourneyScreen | Astra | Response driven; private-data gate validated | Passed: final 26-group browser run + 53 regression tests |
| 11 Booking | JourneyScreen | Astra | Response driven; retry cannot manufacture accepted | Passed: final 26-group browser run + 53 regression tests |
| 12 Walking to pickup | MobilityScreen | Frontend/Astra | Exact vertices, active walking leg only | Passed: final 26-group browser run + 53 regression tests |
| 12 Walking to stop | MobilityScreen | Frontend/Astra | Map hides after student reaches stop; explicit boarding | Passed: final 26-group browser run + 53 regression tests |
| 12 Waiting | MobilityScreen | Frontend/Astra | Ride card; no map; optional supplied fields only | Passed: final 26-group browser run + 53 regression tests |
| 13 Riding | MobilityScreen | Frontend/Astra | Ride card; no map; user arrival supported | Passed: final 26-group browser run + 53 regression tests |
| 13 Walking home | MobilityScreen | Frontend/Astra | Exact supplied geometry or honest unavailable view | Passed: final 26-group browser run + 53 regression tests |
| 14 Arrival | JourneyScreen | Astra | No map; access revoked; explicit user/response action | Passed: final 26-group browser run + 53 regression tests |
| R1–R4 Recovery | Existing Journey/Finding/Recommendation | Astra | Response-driven reconciliation/replacement, fresh consent | Passed: final 26-group browser run + 53 regression tests |
| Route loading/unavailable/stale | MobilityScreen | Frontend | Separate views, retry, directions fallback | Passed: final 26-group browser run + 53 regression tests |
| Unknown ride source | MobilityScreen | Frontend | Provider source not confirmed | Passed: final 26-group browser run + 53 regression tests |
| Simulated ride source | MobilityScreen | Frontend | Simulated rideshare · Demo data | Passed: final 26-group browser run + 53 regression tests |
| Optional missing fields | RideFacts | Frontend | Omitted, pickup instructions unavailable | Passed: final 26-group browser run + 53 regression tests |
| Offline/reconnecting | JourneyScreen/transport | Astra | No auto status progression; waits for response | Passed: final 26-group browser run + 53 regression tests |
| Cancellation/unknown result | JourneyScreen/adapter | Astra | Pending until response; retry remains unknown | Passed: final 26-group browser run + 53 regression tests |
| E1–E11 other errors/help | Existing screens | Astra | Preserved; no map; response/user recovery only | Baseline error coverage preserved; changed unknown/offline/verification cases rerun; regression tests pass |
| Judge controls | TechnicalPanel | Astra | Explicit sample application, outside /app | Passed: final 26-group browser run + 53 regression tests |
| Gallery | /beacon-system | Astra | Real components, all mobility modes, long/reduced motion | Passed: 84 component checks / 20 captures |
| PWA | Existing manifest/SW | Astra | Preserved; no private/API caching added | Passed: final PWA/installability/offline/restricted-storage run |

Integration complete for the available frontend boundary. Source owner fixes are integrated; Terra review has no open P0/P1/P2. Phone verification uses Chromium emulated viewports, not a physical iPhone or Android handset. Backend endpoints, actual Google map configuration and agreed campus walking payload remain external dependencies. No live provider or route claim is made.
