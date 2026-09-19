<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Beacon repository instructions

Beacon is a mobile-first campus mobility coordinator, not an emergency-dispatch service or safety guarantee. Read `docs/Beacon_Final_Hackathon_PRD.md` for product and security requirements, `docs/Beacon_START_HERE.md` and `docs/TEAM_CONTRACT.md` for shared contracts, `docs/Beacon_Phase_Based_Parallel_Build_Plan.md` for track tasks and integration checkpoints, and `docs/Beacon_Git_PR_Merge_Workflow.md` for ownership and PR rules.

Use the root Next.js App Router application, TypeScript, Tailwind CSS, shadcn/ui, and npm. Keep sponsor credentials server-side and out of Git. Do not silently change `src/types/**`, `.env.example`, `package.json`, API paths, or frozen demo values after the team signs off.

Coding agents should run the routine commands themselves: from a clean checkout, use `./scripts/start-task.sh feat short-task-name`, implement on that branch, and run `./scripts/pre-pr.sh` before reporting the work. Use mocks at the track boundaries so Akshar (Databricks), Mahin (agents/ANS/trip state), and Rishit (PWA) can work independently. At each phase-plan integration checkpoint, reconcile all three tracks against the same contracts and end-to-end demo. Do not ask teammates to run routine scripts for you, but do not push, open a PR, merge, deploy, or change GitHub settings without Akshar's explicit approval.
