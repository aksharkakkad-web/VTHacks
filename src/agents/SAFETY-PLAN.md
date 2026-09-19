# Public campus evidence import

## Updated direction (approved September 19)

Safety research is now an internal capability; the separate ANS safety-agent design
below is superseded. ANS remains the transport provider identity boundary. The user
asked to research and import real public crime logs, lighting, activity, closures,
official safety notices and other applicable data. New datasets live separately under
`data/campus/research/` so existing Akshar snapshots remain reproducible.

- [x] Investigate and verify authoritative sources; record gaps.
- [x] Test bounded importers before implementation (pagination, dates, provenance,
  extraction completeness, rejected hosts and preserved snapshots on failure).
- [x] Import source records, hashes and capture times without fabricating coverage.
- [x] Expose imported evidence through the app and attach only currently applicable
  signals to decisions. Never infer a private-provider route from a walking corridor.
- [x] Provide a parameterized Databricks import path and distinguish local imports
  from live workspace imports.
- [x] Run source checks, agent/data tests, pre-PR verification and independent review.
  No further live Telegram messages are authorized.

Historical traffic is not current activity, building LEDs are not path illumination,
and closure blocking requires valid dates plus actual mapped-path intersection.
The default downtown route still has no mapped geometry. A public evidence API also
supports the two existing campus corridors without changing frozen provider quotes.
Implementation and source details: `docs/PUBLIC_CAMPUS_EVIDENCE.md`. Final shipping
status belongs to the Git commits and PR; cloud Databricks import remains unverified
because this checkout has no workspace configuration.

## Superseded initial design (retained for context)

User request (September 19): add a separate agent for crime-log, lighting, activity
and other route evidence. Both the Student Agent → safety-agent connection and the
safety agent → compatible research-agent connections must use ANS. Keep committing,
pushing and integrating Akshar's work. Telegram has replaced Twilio.

## Inputs and ownership

Use Akshar's `fcfcb4d` route-evidence validator and official public snapshots without
editing his modules or manufacturing missing observations. The current source supports
two named campus walking corridors; downtown is explicitly unsupported. Lighting and
activity are unknown, and crime records are incomplete historical endpoint-name matches.
These limitations are part of the result, never a fabricated zero-risk score.

Mahin owns the research service, source/coverage contract, ANS discovery/client,
Student Agent handoff, protected trip research readout, and deployment/tests. Public
named corridors are the initial request boundary; no precise student location,
contact, identity or private trip ID may enter a research request. Never describe a
walking path as the actual route a ride/transit provider will take without route evidence.

## Implementation sequence

1. Test and integrate the latest teammate branch, then define a bounded research
   response with source URLs/times, route/segment coverage, historical-report caveats,
   lighting and activity unknowns, and nearby public resources with unverified operation.
2. Implement the independent HTTP research agent and metadata. Reuse validated route
   evidence; refresh public sources only where a verified source/contract is available.
3. Resolve the operator through ANS, verify its DNS/transparency/TLS identity, then use
   a verified capability manifest to discover the new research service. The existing
   ANS registration points at that manifest; do not invent a registration-update API.
   Keep the distinction between registered operator identity and manifest service role.
4. Discover compatible research/data peers via ANS, require the explicit research
   contract and verified identity before calling them, bound fan-out/time, exclude
   self-recursion, and report no-match/unavailable/unverified results truthfully.
5. Connect the Student Agent before ranking, preserve user-confirmation/precise-location
   gates, expose coverage/source gaps separately from the frozen shared Trip type,
   and pass only supported, genuinely grounded signals into the decision engine.
6. Verify negative identity/capability/coverage cases and the deployed own-agent call;
   do not claim live third-party research unless a compatible verified peer actually
   responds. Run relevant backend/Databricks/repository checks, review, commit, push,
   PR and deploy. Normal automated probes keep Telegram simulated or omit a contact;
   the one authorized real Telegram test has already been consumed successfully.

The result supports an informed route choice, not a safety guarantee or crime-risk
prediction. Missing full-route geometry, lighting, activity or complete incident data
must remain visible coverage gaps, including when the agent and ANS connection work.
