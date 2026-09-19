# Beacon product direction

This records the user's September 19 direction for all three tracks. It takes
precedence over conflicting earlier product claims. It does not change the shared
TypeScript types, API paths, decision policy, or agreed demo values.

## The objective

Beacon is a "get me home" agent for a student who is tired, overwhelmed, or impaired
after a night out. Its job is to carry the objective from wanting to leave through
arrival, reducing the decisions and handoffs the student must manage.

The Student Agent discovers transportation, collects quotes, asks Databricks to
choose one plan using the student's constraints and actual trip burden, obtains
the required confirmation, verifies and authorizes the provider, coordinates the
trip, monitors it, and automatically replans when it fails. A cancellation should
not make the student start over. Recovery stays within the approved constraints;
an uncertain booking must be reconciled before a replacement can be booked.

Uber may be an appropriate provider in a future integration. Beacon's value is
ongoing coordination across the journey, rather than operating a competing ride
service or making the student compare several apps.

## What safety means here

Reduce avoidable solo walking, outdoor waiting, confusing pickup handoffs, and
improvisation after a failed plan. These are concrete burdens, not a crime
probability or a certification that a route is safe.

Current data does not establish actual street lighting, an open indoor waiting
place, or a sober companion. Community lighting tags, historical counts and crime
reports retain their source limitations. A total wait estimate does not establish
how much of that wait is outdoors. Unknown facts remain unknown; they are not
converted to zero, false, available, lit, supervised, or safe.

Provider agents report availability, ETA, cost, pickup details and status only to
the extent supported by their data and contract. Missing required quote information
makes that quote unusable; it does not justify inventing a price or ETA. Precisely
located pickup and destination data remain behind both identity verification and
authorization, with the required user confirmation.

## Demonstration and future capabilities

Independently callable ride agents may simulate transportation for the demo, and
their offers and bookings must be labeled simulated even when HTTP and ANS are
real. Beacon currently has no live Uber or Lyft booking integration.

Commercial rideshare handoffs, official campus escorts, and opt-in walks with known
contacts are future provider capabilities. They are not implemented capabilities
to advertise. Do not match strangers or infer that any person is sober. A trusted
Telegram alert contact is not a confirmed walking companion or escort.

## Owners and shared-contract flags

- **Akshar:** Databricks decision engine and evidence-based assessment of trip burden.
- **Rishit:** the student-facing journey, including accurate source and unknown labels.
- **Mahin:** provider/Student Agent coordination, verified and authorized handoffs,
  trip state, monitoring, and recovery.

The current coordination flow has confirmation, provider verification, scoped
pickup disclosure, monitoring, cancellation recovery, and arrival cleanup. See
`src/agents/MVP-READINESS.md` for the tested deployment and remaining live setup.

The following gaps are flagged for agreement before either side builds new shared
fields or relies on new semantics:

| Gap | Current boundary | Owners to align |
| --- | --- | --- |
| Pickup instructions and meeting point | `ProviderTrip` returns an ID and status; `CandidatePlan`/`Trip` do not carry provider-confirmed pickup instructions. Sending pickup coordinates is not proof that pickup logistics were explained or confirmed. | Mahin + Rishit; Akshar if pickup burden affects ranking |
| Unknown transfers in the decision result | The provider adapter now preserves an omitted optional `transfers` field. The existing evaluator still uses `plan.transfers ?? 0` internally and returns a numeric count. That assumption must not be presented as an observed zero. | Akshar + Mahin + Rishit |
| Outdoor waiting, shelter, and companionship | Current shared fields contain total wait and walking estimates, without evidence of outdoor exposure, open shelter, or a confirmed companion. | All three before adding capabilities or scoring inputs |

No shared field is added by this direction update. Any later contract proposal must
define provenance, freshness, unknown representation, privacy/confirmation behavior,
and compatibility with existing callers before implementation begins.
