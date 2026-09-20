# Workstream A — Setup and home final verification

Date: 2026-09-19  
Final verification target: rebuilt production at `http://localhost:3100`  
Runner: `scripts/verify-beacon-setup-final.mjs`

## Verdict

PASS. The setup and returning-user paths completed at 360×800, 390×844, 393×852, and 430×932. The final automated pass recorded 85 passed checks, 0 failed checks, 0 touch-target issues, 0 input-font issues, 0 page errors, 0 console errors, and no horizontal overflow in the captured screens.

No unresolved P0, P1, or P2 findings remain in this workstream.

## Behaviors verified

- A new user reaches the welcome screen and sees one setup path: **Get started**.
- Reduced-motion mode disables the splash image animation.
- The home step supports both the demo suggestions and manual **Home label** / **Address** entry.
- Blank manual-home values show the validation message and keep the sheet open.
- A valid manual home appears on the setup screen and persists into the saved draft.
- A refresh restores the saved home draft.
- A blank preference budget is rejected; valid preference changes save.
- The preference step supports keyboard movement.
- Home and preference edits from the returning-user screen reject invalid values without closing their dialogs.
- Valid home and budget edits persist after refresh.
- A returning user skips onboarding and reaches `/app`.
- Every inspected interactive target is at least 44×44 CSS pixels, and every inspected text input uses at least a 16px font.

## Findings resolved during this pass

| Severity | Finding | Resolution and evidence |
| --- | --- | --- |
| P1 | The home chooser close button measured 40×40. | `.sheetClose` now measures 44×44. |
| P1 | The chooser search input itself measured 234×27 although its surrounding field was taller. | The input now measures 234×44. |
| P2 | The preferences range control measured 38px high at every tested width. | The shared control fix now measures at least 44px; the final audit reports no target issues. |
| P2 | The manual-home demo-routing disclosure rendered at 11px. | It now renders at 12px while retaining the explicit fixed-demo-routing disclosure. |

## Visual inspection

The captured screens retain Beacon's ivory, forest, and sage direction. The hierarchy is readable at the narrowest viewport, primary actions remain visible at the bottom of each setup screen, the illustrative map is labeled, manual-entry errors are legible, and the returning-user card remains usable without horizontal clipping. The 430×932 layouts gain whitespace without stretching the content into a desktop composition.

## Evidence

- Machine-readable results: [`results.json`](./results.json)
- Screenshots: [`screenshots/`](./screenshots/)
- Focused corrected sheet capture: [`390x844-03-sheet-target-fix.png`](./screenshots/390x844-03-sheet-target-fix.png)

## Commands

```sh
PLAYWRIGHT_MODULE=/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
BEACON_URL=http://localhost:3100 \
node scripts/verify-beacon-setup-final.mjs
```

Result: `{"checks":85,"failed":0,"targetIssues":0,"inputFontIssues":0,"pageErrors":0,"consoleErrors":0}`

`node --check scripts/verify-beacon-setup-final.mjs` and focused `git diff --check` also passed.
