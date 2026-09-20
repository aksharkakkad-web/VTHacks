# Beacon mobile reference study — September 19, 2026

Research used Agent Reach / Exa and rendered public source screenshots, alongside the existing Welcome. Focused initial pass: approximately 25 minutes, followed by implementation. The current Welcome is the visual anchor. Do not import the older SafeCircle board or its superseded automatic replacement consent.

## Twenty useful screen/state references

| # | Source / visual evidence | Pattern to adopt | Avoid |
|---|---|---|---|
| 1 | Existing Beacon Welcome, `baseline/welcome.png` | Generous space, memorable campus illustration, one action | Safety claim and unsupported sign-in |
| 2 | [Apple Maps search](https://support.apple.com/en-ca/guide/iphone/iph02f94fc1c/ios), existing `../references/apple-maps-2.png` | Full-width address search; clear result hierarchy | Tiny result targets, requiring precise map gestures |
| 3 | [Apple Maps route](https://support.apple.com/en-ca/guide/iphone/iph02f94fc1c/ios), `../references/apple-maps-1.png` | Destination and next action stay together | Fake map geometry, excessive mode choices |
| 4 | [Transit GO plan](https://help.transitapp.com/article/549-how-to-use-go), `references/transit-go-1.png` | One large GO, current departure first | Dense repeated ETA tiles |
| 5 | Same source, `transit-go-2.png` | Leg changes preserve trip context | Undisclosed changed terms |
| 6 | Same source, `transit-go-3.png` | Explicit scheduled versus live label | Treating estimates as observed facts |
| 7 | Same source, `transit-go-4.png` | Leave-in countdown is phase-specific | Timer suggesting guaranteed pickup |
| 8 | Same source, `transit-go-6.png` | Glanceable next action | Claiming Beacon supports lock-screen tracking |
| 9 | Same source, `transit-go-7.png` | Condense to one meaningful progress summary | Copying system chrome |
| 10 | [Transit quick start](https://help.transitapp.com/article/546-transit-6-0-quick-start-guide), `transit-quickstart-1.png` | Reduce icons while retaining meaning | Overloaded card stacks |
| 11 | Same source, `transit-quickstart-2.png` | Expand details on demand | Hiding critical price or consent terms |
| 12 | Same source, `transit-quickstart-3.png` | Different scheduled, last, and cancelled states | Color as the sole status indicator |
| 13 | Same source, `transit-quickstart-4.png` | Progress anchored in a stable layout | Decorative progress unrelated to events |
| 14 | Same source, `transit-quickstart-5.png` | Simplify main journey as trip advances | Presenting all stages simultaneously |
| 15 | Same source, `transit-quickstart-6.png` | One focused bottom sheet | Nested sheets and background interactions |
| 16 | Same source, `transit-quickstart-7.png` | Labeled settings and clear switches | Mandatory notification consent |
| 17 | [Transit offline](https://help.transitapp.com/article/90-does-transit-work-offline), `transit-offline-1.png` | Persistent offline banner changes interpretation | Continuing live-looking updates offline |
| 18 | Same source, `transit-offline-2.png` | Keep destination context while unavailable | Claiming an offline booking succeeded |
| 19 | [Uber live activity](https://www.uber.com/iq/en/blog/live-activity-on-ios/), existing `../references/uber-trip-hierarchy-1.png` | Pickup time and destination hierarchy | Fake drivers and vehicle movement |
| 20 | Same source, `../references/uber-trip-hierarchy-2.png` | Dispatch, approaching, pickup, and travelling are distinct | Vague “confirmed” for every state |

Several Transit images contain two or more screens. A blank animated-frame capture (`transit-go-5`) is excluded. Existing Apple/Uber files were visually inspected again. Page Flows Gojek booking and cancellation sequences were retrieved as text; rendered access failed and is not counted as screenshot research. Mobbin/Refero paid screens were not necessary and no access bypass was attempted.

## Additional guidance and recovery patterns

- [Apple progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators): describe the operation honestly; consistent status location; explain cancellation consequences. Text retrieved; browser certificate error was not bypassed.
- [W3C clear steps](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p04-clear-steps/): retain current step and essential choices after distraction.
- [W3C clear instructions](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p07-step-instructions/): short guidance beside the action, not only after errors.
- [W3C 44px targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html): large controls for imprecise movement and one-handed use.
- [Gojek cancellation](https://pageflows.com/post/ios/cancelling-a-booking/gojek/): review consequences before cancellation, then a distinct final result. Sequence/text evidence only.
- [Base UI Dialog](https://base-ui.com/react/components/dialog): reuse installed focus management, labeling, Escape and focus return. Existing dependency; no copied third-party application source.
- Local Next 16.3.5 guides: manifest, viewport and PWA. Use public offline fallback only; no trip or API response cache.

## Beacon decisions

Ivory canvas, forest primary action, sage supporting surfaces; warm illustration stays secondary. Large heading, one short explanation, one task summary, one dominant action. 56px primary controls, at least 44px secondary targets. Layout uses real scrolling and safe-area padding, not a fake phone status bar. Pending, warning, failed, unknown and successful states use text plus an icon. Reduced motion removes animation without hiding meaning. No new raster art is needed: existing Beacon artwork supplies a coherent family.

Every offer is labeled simulated and Beacon-operated. Confirmation, identity, access, payment and booking stay distinct. Replacement requires fresh approval. Unknown outcomes retain the original attempt. Scheduled transit and walking skip booking. Actual source constraints beat aesthetic completeness: unavailable pickup instructions and absent route geometry remain unavailable.

## License and asset boundaries

Reference captures are internal design research only; none is shipped as app artwork. Apple, Uber, Transit and Page Flows retain their original copyrights. Existing Beacon assets are reused; no third-party branding, commercial UI kits, or source code was copied. Simple new iconography uses the already installed Lucide dependency. Shared types, fixture prices and dependencies remain untouched.
