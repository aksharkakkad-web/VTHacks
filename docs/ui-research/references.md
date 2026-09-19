# Visual references and decisions

The supplied SafeCircle board remains the authority for color, typography and shape. External screenshots are study material, not app assets.

| Source | Captured evidence | Pattern adapted | States |
|---|---|---|---|
| [Uber: Pickup in 3 minutes](https://www.uber.com/iq/en/blog/live-activity-on-ios/) | `references/uber-trip-hierarchy-1.png`, `-2.png` | Pickup/destination time first, vehicle second, overall progress third. Distinct dispatch, en-route, arriving, on-trip wording. | Recommendation, coordination, waiting, in-trip |
| [Transit 6.0 quick-start](https://help.transitapp.com/article/546-transit-6-0-quick-start-guide) | `references/transit-trip-progress-1.png`, `-2.png` | Large readable ETA; stable map with evolving sheet; details expand without losing the destination. Remove unnecessary walk/wait icon clutter. | Home, recommendation, active trip, details |
| [Apple: Use Maps on iPhone](https://support.apple.com/en-ca/guide/iphone/iph02f94fc1c/ios) | `references/apple-maps-1.png`, `-2.png` | Native field sizing, close/back affordances, destination grouped with its route, one bottom action. Study geometry and information hierarchy; omit translucency and unrelated mode controls. | Home setup, saved destination, dialogs, route overview |
| [Lyft: That little island changes everything](https://design.lyft.com/that-little-island-changes-everything-b89b108f45b4) | Page may be blocked; text research only if no image captured | Predictable phase-based progress; waiting and in-trip progress must mean different things. | Waiting, arriving, in-trip |

## State-by-state application

- Setup/home: use Apple-style labeled, full-width controls in the existing white sheet. Only home and preferences; no account or marketing carousel. Home sheet remains compact enough to leave geographic context visible.
- Search: use stable geometry and changing status text, not four completed technical claims at once. Detailed source names stay in judge mode.
- Recommendation: Uber hierarchy puts the time-to-home above provider, with pickup and price nearby. One GO, details below it. Verification is future tense until checked.
- Waiting/in-trip: Uber distinguishes pickup ETA from arrival ETA; Transit keeps destination visible and progress readable. No fake moving vehicle or busy dashed animation.
- Cancellation/recovery: preserve the map and sheet; change the message and progress. Only genuine disruption uses amber. Identity checks are reset for replacement. No second approval inside existing constraints.
- Arrival: one quiet success mark and three factual summary rows. Do not automatically change the recorded provider to Rideshare.
- Errors/dialogs: use the same typography, white surface and 44px controls. Plain recovery action, no security dashboard or browser alert.

## Implementation references

- [Base UI Dialog](https://base-ui.com/react/components/dialog): existing dependency; keyboard focus, dismissal, labeling and focus return. Do not hand-roll a non-modal aside pretending to be a modal.
- [MDN Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API): feature-detect, user-interaction dependent, unsupported browsers continue normally. Respect reduced-motion preference. No iOS haptic claim.

## Deliberately rejected

Transit's orange full surfaces, Apple Maps translucency, large mode selectors, duplicated comparison cards, Uber branding, arbitrary decorative gradients, animated route dashes, fake system home indicator. These conflict with the approved SafeCircle system or add cognitive work.
# Help contact verification

The [official Virginia Tech Police contact page](https://police.vt.edu/about/contact.html), checked September 19, 2026, distinguishes emergency 911, non-emergency dispatch 540-382-4343, and general information 540-231-6411. The help sheet should link to emergency and non-emergency dispatch, not mislabel the general office line as dispatch. QA verifies the `tel:` targets without placing calls.
