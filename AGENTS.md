<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Beacon repository instructions

Beacon is a mobile-first campus mobility coordinator, not an emergency-dispatch service or safety guarantee. Read `docs/Beacon_Final_Hackathon_PRD.md` for product and security requirements, `docs/Beacon_START_HERE.md` and `docs/TEAM_CONTRACT.md` for shared contracts, `docs/Beacon_Phase_Based_Parallel_Build_Plan.md` for track tasks and integration checkpoints, and `docs/Beacon_Git_PR_Merge_Workflow.md` for ownership and PR rules.

Read `docs/Beacon_Product_Direction.md` for the latest approved product direction: the Student Agent owns the journey home and recovery after failures. Its concrete safety purpose is reducing avoidable trip burden; unknown lighting, shelter, or companionship stays unknown. Commercial rideshare, campus escorts, and walks with known contacts remain future capabilities. Flag shared-contract changes before building against them.

For Akshar's Databricks/data/decision work, also read `docs/DATABRICKS_TRACK_PRD.md`: the detailed implementation baseline and sponsor-brief evidence. Its proposed additive contracts are not already-implemented types; coordinate shared changes with Mahin and Rishit.

Use the root Next.js App Router application, TypeScript, Tailwind CSS, shadcn/ui, and npm. Keep sponsor credentials server-side and out of Git. Do not silently change `src/types/**`, `.env.example`, `package.json`, API paths, or frozen demo values after the team signs off.

Coding agents should run the routine commands themselves: from a clean checkout, use `./scripts/start-task.sh feat short-task-name`, implement on that branch, and run `./scripts/pre-pr.sh` before reporting the work. Use mocks at the track boundaries so Akshar (Databricks), Mahin (agents/ANS/trip state), and Rishit (PWA) can work independently. At each phase-plan integration checkpoint, reconcile all three tracks against the same contracts and end-to-end demo. Do not ask teammates to run routine scripts for you, but do not push, open a PR, merge, deploy, or change GitHub settings without Akshar's explicit approval.

For checkpoints A–G, follow `docs/CHECKPOINTS.md`. After checking your track's piece, add its letter to only your `checkpoints/<person>.json` in the same PR. The shared GitHub board announces readiness after that change reaches `main` and CI passes. Keep working while other tracks finish; meet for a short integration sync when the board says all three are ready.

## 24-hour hackathon priority

Akshar's priority is speed to a working, repeatable end-to-end demo. Start the three tracks now with mocks at unfinished boundaries; verify sponsor access in parallel. Build the smallest useful slice, push approved small changes early, and meet briefly at checkpoints A–G in the phase plan. Defer polish, data depth, and non-blocking edge cases. Do not turn this into extra process or ask Akshar to run routine commands. Still protect secrets, the verified-and-authorized precise-location gate, and the core demo path; never present a simulation as a live integration.
