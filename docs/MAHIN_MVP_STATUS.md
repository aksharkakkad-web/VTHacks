# Mahin's provider-network MVP handoff

Verified September 19, 2026 against consolidated main `d7d2bc9` plus branch `feat/mahin-provider-network-mvp`. This completes the backend implementation slice. It does not declare the combined student-facing or hosted pilot ready.

## What now works

Beacon accepts versioned developer offers without platform-specific Student Agent branches. The reference Campus Ride and Independent Ride services use the same HTTP adapter; conformance also covers an additional same-mode service. All reference transport and payments are simulated and operated by Beacon.

ANS discovery supports distinct service IDs under one operator, with scoped capabilities. Manifest/offer validation checks registered identity and endpoint, contract version, service area, fixed complete USD price and expiry. Live endpoints are identity-verified before quote admission and again before precise-location release. Local demo trust is labeled separately and never sets a live ANS badge.

The student confirms one displayed plan and quote. A short-lived signed grant restricts the booking to its provider, quote, attempt, payload and amount. Exact retries are idempotent; conflicting payloads and expired/tampered grants fail. The provider books and reports status; Beacon owns monitoring and recovery. Redis-backed handlers retain request fingerprints and cancellation tombstones across instances.

A lost response triggers reconciliation of the same attempt. Cancellation must return terminal status and settled payment before releasing budget. Fees reduce remaining budget; unknown settlement reserves the original amount. Beacon recommends a replacement and asks for confirmation again. Arrival erases private trip data and retains cleanup retry intent; a late location update cannot restore erased data.

The owner-only evidence endpoint supplies offer terms, pickup instructions, operator/verification labels, simulated payment state, remaining budget and required action. Grants, credentials and internal consent IDs are never returned. Final simulated outcomes use Akshar's existing sanitized ingestion contract with immutable retry payloads and unrelated observation IDs; unknown acceptance/pickup times stay null.

## Evidence from this checkout

| Check | Result |
| --- | --- |
| `bash src/agents/test.sh` | 131 passed, including 10 HTTP provider conformance tests and 17 network trip behaviors |
| `node databricks/run.mjs test` | 92 passed; existing policy preserved |
| `./scripts/pre-pr.sh` | Lint, 25 checkpoint/PWA state tests, typecheck and default production build passed |
| Production app + local provider HTTP smoke | v2 quote → local policy recommendation → exact confirmation → identity/authorization gate → booking → cancellation → replacement confirmation → arrival passed |
| Privacy/monitoring smoke | Session/evidence/callback protections, overdue state and fixture cleanup passed; no contact submitted and no real alert sent |
| Chrome, 390×844, production PWA script | Service worker installed; offline navigation showed reconnect fallback; only `/offline.html` and public icon cached; blocked storage still allowed setup with session-only notice |
| Independent spec/quality reviews | Provider primitives, coordination/recovery and HTTP provider lifecycle approved after regression fixes |

The smoke used **local demo identity trust**, **local decision-policy fallback**, **simulated rides** and **simulated payments**. It did not call live ANS, Databricks, Telegram or a commercial transport provider. Redis settlement Lua was inspected, but the HTTP conformance suite used shared memory stores; deployed Upstash behavior was not established by that test.

## What each teammate needs next

| Owner | Remaining integration work |
| --- | --- |
| Rishit | Connect the existing PWA screens to Trip/evidence APIs. Send displayed `{planId, quoteId}` on confirmation; render replacement confirmation, expiry, payment uncertainty/decline and truthful source labels. Reload authoritative trip state after reconnect. Existing UI is still its local demo controller. |
| Akshar | Review the frozen eligible-offer fixtures and remaining-budget handoff. Keep the existing decision policy and provenance labels. Provision/approve the optional outcome table before enabling ingestion, and verify hosted workspace credentials/data versions. |
| Mahin / deployment integration | After UI integration, verify the actual hosted candidate: scoped ANS credentials and registration profile, shared Redis, external monitor, current Databricks access and mobile journey. Review real platform access/payment design separately before activating commercial bookings or money. |

Start with [the contract](MAHIN_MVP_CONTRACT.md), [API handoff](../src/agents/API.md), [frozen examples](../src/agents/fixtures/provider-network-v2.json) and [provider developer guide](PROVIDER_DEVELOPER_GUIDE.md).

## Is it a PWA?

Yes. The repository already has a standalone web manifest, install icons, production service-worker registration and a public offline fallback. The current shell is branded SafeCircle. The checks above verify its local production browser behavior, not installation on a physical phone or readiness of a connected deployed student journey. Offline mode cannot book a ride or confirm arrival; private trip/API responses are not cached.
