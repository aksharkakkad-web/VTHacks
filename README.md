# Beacon

Beacon is a mobile-first campus mobility coordinator for the outcome **“Get me home.”** The frontend demo walks through transit and rideshare journeys using simulated trip updates. The connected application separately coordinates provider agents, recommendations, verification, and recovery.

## Present the frontend demo

Open `/demo` for the complete clickable walkthrough using the existing Beacon screens. Choose Transit or Rideshare, confirm the plan, and use the visible progress controls to reach pickup, boarding, travel, and arrival. At the arrival check, choose home or destination not reached to show the Telegram alert preview, then restart for another run.

The walkthrough runs locally in the browser without planner pairing or provider credentials. Transportation and the Telegram message are simulated; no real notification is sent. The connected application remains at `/app`, and `/demo?transport=live` explicitly opens its connected demo.

## Run locally

Use Node.js 22 and npm:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000/demo>. No sponsor credentials are required for the frontend walkthrough. Put real values only in `.env.local`, which is ignored by Git. Do not put server credentials in `NEXT_PUBLIC_*` variables.

Before a PR, run `./scripts/pre-pr.sh`. It runs lint, core tests, typecheck, and production build. Connected trip APIs require their documented backend configuration; the frontend walkthrough does not.

## Team kickoff

Read [the kickoff guide](docs/Beacon_START_HERE.md) together, then review [the prepared team contract and open checks](docs/TEAM_CONTRACT.md). The product/UX track is Rishit, provider-agent/ANS/trip orchestration is Mahin, and Databricks/data/recommendation is Akshar. The [phase plan](docs/Beacon_Phase_Based_Parallel_Build_Plan.md) sequences their work and integration checkpoints. The [PRD](docs/Beacon_Final_Hackathon_PRD.md) is the product/security source of truth; [Git workflow](docs/Beacon_Git_PR_Merge_Workflow.md) covers ownership and small PRs.

For this 24-hour sprint, the three tracks can start now against the shared types and mocks. Agree on the proposed demo values quickly; verify Databricks, ANS, and PWA prerequisites in parallel rather than delaying all coding. Meet at the phase plan's integration checkpoints, and do not claim a real sponsor integration until it is demonstrated.

Akshar's [Databricks track PRD and build contract](docs/DATABRICKS_TRACK_PRD.md) specifies the logic, scoring, data, teammate handoffs, acceptance tests, and sponsor-aligned demo using the opening-ceremony challenge brief. It is an implementation baseline, not a claim that the Databricks integration is already built.

## Repository layout

```text
src/app/                   Next.js App Router, PWA UI, and API routes
src/components/            Beacon screens and shared UI components
src/types/                 shared CandidatePlan, Recommendation, Trip types
src/agents/                provider and student-agent coordination
src/integrations/          ANS, Databricks, maps, notifications
src/lib/                   policy, trip state, demo helpers
databricks/                notebooks and SQL
docs/                      PRD, kickoff, phases, workflow, team contract
.github/                   CI, ownership, PR template
scripts/                   task and pre-PR helpers
```

Shared TypeScript contracts are in `src/types`. Connected trip API behavior is documented in `src/agents/API.md`; the frontend walkthrough uses browser-local simulation state.

## GitHub setup remaining

The local `origin` points to `https://github.com/aksharkakkad-web/VTHacks.git`. The initial push, test PR, CI, and overlap-warning run have succeeded. GitHub `main` protection is not enabled yet; add Mahin/Rishit's real GitHub handles to `.github/CODEOWNERS` if desired. Agents should run the local scripts themselves and use the checkpoint plan for integration.
