# Mahin's provider-network MVP contract

September 19, 2026. Implementation starts from consolidated main `d7d2bc9`.

This is the additive contract notice for Mahin, Rishit and Akshar. The approved pivot is implemented as a simulated transport/payment MVP. Existing `CandidatePlan`, `Recommendation`, `Trip`, API paths, decision policy and demo prices remain compatible. This document records the boundary before implementation; completion evidence will be added after verification.

## Boundaries

- Provider wire profile: `beacon-mobility-v2`, alongside the existing v1 adapter. A registered operator may expose multiple distinct service IDs of the same mode. ANS verifies operator/endpoint identity; it does not authorize payment or establish affiliation with a transport brand.
- The v2 simulated provider quote carries a manifest and a fixed USD offer with a stable quote ID, expiry, total in minor units, cancellation terms and pickup instructions. Unsupported profiles, unsupported payment/auth requirements, mismatched identity, unsupported areas, stale offers and incomplete prices are excluded before ranking.
- The decision adapter still receives ordinary `CandidatePlan` values and existing evidence signals. Private offer-to-plan mapping remains in the trip store. Neither Databricks nor the browser receives booking grants, service credentials or exact addresses through this new boundary.
- Confirmation binds to the selected offer and terms. Replacements are recommended automatically but require a new confirmation unless explicit bounded replacement permission was recorded. A previous confirmation is not blanket permission to spend on a different quote.
- New provider booking requests carry a short-lived, recipient-bound HMAC authorization using the existing per-provider credential. This is a limited MVP service-authentication scheme, not OAuth or a claim of independently issued agent identity. The provider verifies issuer, recipient, operation, quote, booking attempt, payload binding, amount and expiry. Exact retries reconcile one persisted booking; changed payloads cannot reuse that authorization.
- Payment is simulated USD authorization only; no card entry, processor token or real charge. Confirmed cancellation/release is required before spending the released amount on a replacement. Unknown settlement stays unknown. No commercial provider is enabled by this slice.

## Rishit's additive read model

`GET /api/trips/:id/evidence` will add `coordination`, containing safe operator/service identity labels, offer price/expiry/terms, pickup instructions, whether confirmation is required, and simulated payment progress. It retains the existing session ownership and `Cache-Control: no-store` protections. Existing trip actions remain unchanged; failed/expired/reconfirmation states use existing trip states plus explicit event/error codes.

`POST /api/trips/:id/confirm` remains the confirmation boundary. The backend rechecks the current selected offer; the client must display fresh evidence and should bind confirmation to its displayed plan/quote when supplied by the finalized schema. The precise-location gate remains server-side.

The PWA manifest, icons, registration and offline fallback already exist. Current student screens still run the frontend demo controller; Rishit owns wiring them to the real trip/evidence responses. This backend work does not make browser timers proof of booking.

## Optional outcome ingestion

`DATABRICKS_PROVIDER_OUTCOMES_TABLE` is an opt-in server setting proposed by this slice, using the existing host/token/warehouse configuration and Akshar's `ingestProviderOutcome` contract. Akshar must provision the outcome table before activation. Without the table setting, final sanitized observations remain queued in the private trip store until its retention expires; they are not claimed as cloud-ingested. Simulation never contributes to real reliability. No schema creation runs automatically.

## Implementation checklist

- [ ] Versioned manifest/offer validation and frozen fixtures.
- [ ] Scoped authorization and simulated payment state.
- [ ] HTTP provider execution and discovery compatibility.
- [ ] Persisted offer-bound confirmation, booking, recovery and safe UI view.
- [ ] Developer guide and independently callable provider conformance checks.
- [ ] Full backend HTTP smoke, privacy/retry failures and repository checks.

Live accounts, real processor settlement, commercial platform access and a connected student UI retain their separate owner/release gates in the approved pivot plan.
