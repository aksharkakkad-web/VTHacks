# Beacon onboarding wireframes

The rendered onboarding-only source of truth is [Beacon_Onboarding_Wireframes.html](Beacon_Onboarding_Wireframes.html).

## Required flow

Welcome → Set home → Preferences → Permissions → App Home

1. **Welcome:** One-sentence purpose and one Get started action. No sign-in until a real account system exists.
2. **Set home:** Selected destination and illustrative map. Change location opens the supporting search sheet.
3. **Preferences:** Maximum budget, less walking and fewer transfers. Preferences are not guarantees.
4. **Permissions:** Explicit consent for precise trip location and monitoring. Trusted contact is optional. Browser geolocation permission occurs later when a trip needs it.

## Supporting states

- Choose home sheet: search plus a manual-entry fallback.
- Trusted contact sheet: optional contact and overdue-notification consent.
- Permission unavailable: does not block onboarding.

## Excluded

No splash, universal sign-in, commercial platform linking, card entry, provider selection, temporary trip-context questionnaire or redundant completion screen.

## Product rules

- Onboarding happens before a high-friction trip.
- Home and preferences are editable later.
- Enabling location access does not itself share location.
- Exact pickup stays withheld until plan confirmation and provider identity and authorization checks.
- Trusted-contact data is not provider data.
- Payment remains simulated and does not belong in onboarding.
