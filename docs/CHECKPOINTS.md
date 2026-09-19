# Fast checkpoint handoff

The [shared GitHub checkpoint board](https://github.com/aksharkakkad-web/VTHacks/issues?q=is%3Aissue+%22Beacon+checkpoint+board%22) shows where all three tracks stand. It does **not** block anybody from continuing to code. A teammate can start the next piece while another finishes this one.

When your agent has finished and checked your track's piece of a checkpoint, it adds that letter to **your** file (`checkpoints/akshar.json`, `checkpoints/mahin.json`, or `checkpoints/rishit.json`) in the same change. It should not edit another person's file. A PR or branch alone does not mark anyone ready: the change needs to land on `main` and pass CI. Then GitHub updates the board and @mentions the team. When all three are ready for one letter, the board calls for a **10-minute team sync**. GitHub notification delivery still depends on each person's notification settings.

| Checkpoint | Akshar — choices | Mahin — coordination | Rishit — app |
| --- | --- | --- | --- |
| A — Shared contracts | Mock options in → one choice + reason out | Mock providers → option list; trip shape fits | Get Me Home demo with mock choice and status |
| B — Real provider options | Accept real provider-shaped options | Three providers return usable options | Show real options/loading without breaking |
| C — Real Databricks choice | Live query picks and explains one option | Feed options in; use answer for trip | Show answer and reason clearly |
| D — Verified provider handoff | Keep choice usable through handoff | Verify provider and permission before sharing exact pickup | Show verified status and request progress |
| E — Trip monitoring | Keep choice context available | Arrival and overdue paths work; alert only when overdue | Show arrival and overdue states |
| F — Cancellation recovery | Re-evaluate remaining options | Cancel first provider; switch to verified replacement | Show the switch and new status |
| G — Full demo | Live choice works repeatedly or honest fallback is labeled | Whole trip path runs repeatedly | Demo works from deployed app on a phone |

Agents should use the smallest proof that matters (a test, real query result, or demo run), run `./scripts/pre-pr.sh`, and say what was actually verified. Marking a letter ready is a team signal, **not** automatic proof that Databricks, ANS, SMS, or a provider is live. Never call a mock a live integration. Do not wait for others to start the next task; sync when the board says all three are ready.
