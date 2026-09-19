# Databricks combined-vision completion record

September 19, 2026. Akshar owns data/decisions; Mahin owns provider orchestration/booking; Rishit owns UI. Baseline: consolidated main `d7d2bc9`. This covers the original safety/cost vision **plus** the provider-network addition.

Latest product decision: strongest useful POC, with unsupported coverage allowed. Missing lighting/access observations are nonblocking and visible. They cannot become invented measurements, pickup authorization, a crime-risk probability or a safety guarantee. Actual closures, expired offers and budget limits still apply. Connected geometry is required to claim a mapped route.

## Data-side capabilities

| Capability | Implementation and limit |
| --- | --- |
| Personalized comparison | Existing deterministic `beacon-v2` SQL/local policy compares price, waiting/travel, walking preference, transfers, weather and known lighting. SQL output must match the local calculation. Unknown transfers retain the existing policy warning; historical crime does not numerically predict danger. |
| Provider network | `evaluateProviderNetwork` / `evaluateNetworkOffers` accept reviewed server-side offers. Distinct operator/service/quote/version identities remain distinct. Fixed all-fee USD prices or binding caps only; caps ranked at their maximum. No grant, booking or payment is issued. |
| Combined options | Provider services, mapped walking and scheduled transit compete in one evaluation. Named campus corridors collect public options; full-feed stop-to-stop results may also be supplied. Missing map/timetable results are omitted, never invented. |
| Recovery | Deduct deduplicated committed charges, outstanding authorizations and fees from approved budget. Exclude the exact failed operator/service pair. Pending refunds do not increase available budget. |
| Evidence | Admission rejections survive local fallback and managed audit. Responses retain source/version/expiry, exact selected-offer binding, public inventory, historical lighting, weather, closure context and unknowns. |
| Lighting / pickup / waiting | `assessJourneyReadiness` binds observations to the complete ordered route inventory and pickup evidence to provider/service/site/time. Assessment is nonblocking and never authorizes booking. Published hours do not establish admission or pickup permission. |
| Full-feed transit | Seven Delta tables and validated direct-trip SQL. Public stop IDs, explicit access/egress minutes, source freshness, service epochs, ordered stops, boarding restrictions and boarding buffer. Estimated walks allowed and labeled. No transfer planner or live bus location. |
| Native AI | Existing Databricks `ai_query` curates grounded fact IDs. It cannot change the winner, invent evidence or create a safety score. Template fallback remains available. |

## Data breadth

- Official BT capture: **297 stops, 24 routes, 3,658 trips, 74,301 stop times, 10,456 trip/date records**, September 19–October 2, 2026. Scheduled, not live.
- **719 historical crime-log records**, 717 distinct case IDs, one quarantined record. Partial published reporting, not complete crime coverage or current danger.
- **1,179 community lighting objects**: 54 mapped lamps and 1,125 lighting-tagged ways. Inventory/tags are not verified working lights.
- **72 historical illumination measurements at 36 intersections**, 28 with coordinates and eight without. Actual January–March 2026 measurement windows retained; coordinate CRS unverified. No automatic route join or present-day illumination claim.
- **1,970 official campus pathway features**, plus broader town research network. Two runtime mapped corridors: Newman–Pritchard and Eggleston–Pritchard. Wider pilot: 10/50 directional pairs supported by draft research geometry, not activated navigation.
- **14 published construction areas**, refreshed weather/alerts, **130 emergency-phone locations**, **65 emergency-equipment locations**, **20 notice-page records**, four historical pedestrian summaries, and three sites with published waiting-location hours.
- Provider reliability starts unknown: no fabricated outcome history or trained risk model. Existing outcome pipeline may use genuine later outcomes.

Counts describe retained datasets, not proof that every path has current observations. Route-specific coverage is explicit; `routeExposureScore` stays null when unsupported.

## Activation and verification

Akshar explicitly approved public-data activation in existing `workspace.beacon` on September 19. Imports are additive, source-versioned, using the existing SQL warehouse. No new paid service, upgrade, provider booking/contact, Git push/merge or app deployment was authorized.

- Refreshed public weather/construction; rebuilt both runtime routes against the current construction snapshot and imported matching managed route versions. Final route import: `01f1b45e-a327-1f72-9b92-d909990efcf8`.
- Real SQL decision and persisted audit: `01f1b45e-f487-1563-9780-a902c673a334`.
- Managed route read: `01f1b45e-f972-1a6a-9093-470672e3f4d8`.
- Native AI response: `01f1b45e-f9df-14ba-9d44-72fd9deec93d`, model `databricks-meta-llama-3-3-70b-instruct`.
- Zero-budget SQL selected mapped free walking: `01f1b45e-fc94-155f-a4c4-4cd07bd851b3`.
- Full-feed activated: all seven source-version counts verified; 74,301 stop times readback `01f1b45f-1b5a-1c6e-9dd6-27444cbbb002`; completion marker `01f1b45f-2cf6-1232-b581-0ac6306c898c`.
- Live direct transit query `01f1b45f-50d6-1dd0-bd7a-dc05a4f6fd39`: public stops 8008→1400, PHD departure 19:30 UTC September 19, arrival 19:34:37; source `scheduled`, access/egress estimated, $0. Unknown stop correctly returned null. This was a dated acceptance run, not a perpetual departure promise.
- Expanded public import `29ccb19282a1dd6a822ff8d5e142b013f99a5b76277d474828aff897a9d890ae`: 2,112 typed records across eight datasets, including 36 historical lighting sites; 388 archive parts and 3,595 item parts. Independent readback `01f1b45f-7f30-17ce-89eb-d1a652897a26`; archive/completion readback `01f1b45f-802f-1f74-81f7-f08f6200d399`. Provider outcome count remained zero/unknown.
- Live network smoke: initial campus service `01f1b45f-5c12-1c0f-bba9-0aa71b06d029`; exact-service cancellation selected independent service `01f1b45f-5cb0-1982-b9c6-46561e58074c`; existing $4 liabilities prevented a $7 replacement within $10 budget. Services simulated, SQL real, no bookings.
- Combined server handoff ran September 19 at 19:24 UTC: full-feed bus, existing corridor bus, mapped walk and simulated paid offer. $0 budget selected the mapped walk and rejected the paid offer. SQL `01f1b45f-a98c-1585-b3f3-dfc57460a1b5`, audit persisted, 72 historical measurements exposed, estimated stop-walk provenance preserved. Nonblocking readiness correctly remained incomplete.

Verification: 125/125 Databricks track tests, 26/26 native/import tooling tests, 76/76 agent tests, 73/73 Python ingestion tests, and pre-PR lint/typecheck/build plus 25/25 checkpoint/UI-state tests. Python PDF tests used the bundled workspace Python with `pdfplumber`; system Python lacks that dependency. Independent review prompted fixes to cross-operator recovery exclusions, scheduled-source labeling and public transit provenance retention. Live checks above are real Databricks results, not mocks. The first bulk import attempt hit Databricks' 1 MiB parameter limit before stop-time ingestion; bounded smaller batches succeeded, preserving insert-only semantics and writing completion markers last. No new compute/service was created.

## Ownership and completion boundary

Akshar's A–G data-side checkpoints are marked ready. D/E mean the tested decision handoff and retained choice context, not Mahin's provider verification/monitoring or Rishit's screens. GitHub announces readiness only after this change reaches main and CI passes. Independent final review reported no remaining critical/important findings; public-option provenance retention regression passed.

This track delivers data, managed queries, decision logic, evidence, tests and callable server handoffs. Existing Trip API already uses `evaluateTripIntelligence`; its evidence now includes public context and measured-lighting sidecars. New provider-network and arbitrary-public-stop adapters are handoffs for Mahin, not a silently replaced booking protocol. Rishit must render returned geometry/source labels instead of illustrative routes. Deployment and all-track mobile acceptance are distinct from data-track completion.

See [app handoff](DATABRICKS_APP_HANDOFF.md). Refresh construction-derived routes before a demo: their source deadline is one hour, not renewed by requests. Full-feed capture expires after seven days and has a finite service horizon. No software run can establish complete current lighting or crime reporting from these public sources.
