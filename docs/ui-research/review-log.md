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

## Round 2 — state-model review

The independent flow reviewer found walking incorrectly entering ANS, failed-provider retry after no-options, nested offline/resume loss, unguarded action payloads, stale pause across trips, cancelled routes remaining visible, and hard-coded arrival timestamps. These were corrected in the UI-only demo controller; shared API contracts remain untouched. Regression coverage now includes each case and malformed saved data.

## Round 3 — actual mobile renders

The visual reviewer inspected setup, home, preferences and editing at 390 × 844: 7.8/10 overall, Home 8.5/10. Accepted improvements: setup Back, retained draft input, short-height modal scrolling, quieter demo label, clear optional-contact disclosure. Subsequent core-flow review scored 7.9/10 and highlighted replacement progress, current-versus-completed timeline emphasis, exposed reason codes, and the arrival action.

Accepted: remove consumer reason-code chips and technical authorization prose, make replacement progress explicit, strengthen the current timeline step, use a dark Finish action, and remove invented vehicle identifiers. Keep detailed trust events in the judge panel.

Rejected: removing a legitimate keyboard focus ring and converting recommendation into an unrelated full-page layout. Keyboard focus is required; the approved map-plus-sheet shell remains consistent while information density is reduced.

These scores describe intermediate renders, not final approval. The final review is performed after the fixes and complete browser run.
