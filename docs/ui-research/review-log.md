# Independent review log

## Round 1 — proposed experience and current implementation

Two independent reviewers used `gpt-5.6-luna` at `max` reasoning. They inspected the approved board, current components, PRD and proposed state map. They were asked to find flaws rather than approve.

Both identified these material issues:

1. Verified badge appeared before verification; replacement trust/authorization steps absent.
2. Cancelled and unconfirmed replacement provider pins/ETAs remained on the map.
3. Onboarding, persisted profile, optional context, accepted/waiting/arriving/in-trip, and fallback states missing.
4. Destination/map buttons did nothing; consumer details opened judge diagnostics.
5. Help was a browser alert containing an invented trusted contact.
6. Modal keyboard behavior, Escape/focus return and table headers missing.
7. Body text often 10–13px, some controls under 44px, arbitrary color/shape values, gradients, moving route dashes, fake system home indicator.
8. Arrival could attribute an initial trip to replacement provider; completion time hard-coded.
9. Technical timeline and recommendation copy did not use actual typed state or explanation.

Accepted: all behavior/truthfulness/readability findings. Use one central typed demo model and reuse screen families, rather than adding dashboard pages.

Rejected: copying reference text that implies guaranteed personal safety, adding a new confirmation after autonomous replacement, or expanding into extra bottom-nav sections.

Fixture values: preserve the current visual fixture ($2/8 minute shuttle, $8.40/6 minute replacement). Kickoff numbers are explicitly proposed and unsignalled; final backend scenario remains a team integration choice, not a UI redefinition.

Subsequent rendered reviews and final evidence are recorded after implementation below.
