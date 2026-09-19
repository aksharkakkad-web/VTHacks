# Beacon

Beacon is a mobile-first campus mobility coordinator for the outcome **“Get me home.”** Independent provider agents offer plans, Databricks recommends one, the student confirms, and GoDaddy ANS verifies the selected provider before precise trip data is shared. If a provider fails, Beacon replans. This repository is the **starter foundation**, not a working trip flow or safety service yet.

## Run locally

Use Node.js 22 and npm:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. No sponsor credentials are required to start the foundation app. Put real values only in `.env.local`, which is ignored by Git. Do not put server credentials in `NEXT_PUBLIC_*` variables.

Before a PR, run `./scripts/pre-pr.sh`. It runs lint, typecheck, and production build. `npm run dev` starts the Next.js app only; trip APIs and sponsor integrations are not implemented yet.

## Team kickoff

Read [the kickoff guide](docs/Beacon_START_HERE.md) together, then review [the prepared team contract and open checks](docs/TEAM_CONTRACT.md). The product/UX track is Rishit, provider-agent/ANS/trip orchestration is Mahin, and Databricks/data/recommendation is Akshar. The [phase plan](docs/Beacon_Phase_Based_Parallel_Build_Plan.md) sequences their work and integration checkpoints. The [PRD](docs/Beacon_Final_Hackathon_PRD.md) is the product/security source of truth; [Git workflow](docs/Beacon_Git_PR_Merge_Workflow.md) covers ownership and small PRs.

For this 24-hour sprint, the three tracks can start now against the shared types and mocks. Agree on the proposed demo values quickly; verify Databricks, ANS, and PWA prerequisites in parallel rather than delaying all coding. Meet at the phase plan's integration checkpoints, and do not claim a real sponsor integration until it is demonstrated.

## Repository layout

```text
src/app/                   Next.js App Router and eventual PWA UI
src/components/            shadcn/ui component foundation
src/types/                 shared CandidatePlan, Recommendation, Trip types
src/agents/                provider and student-agent track (planned)
src/integrations/          ANS, Databricks, maps, notifications (planned)
src/lib/                   policy, trip state, demo helpers (planned)
databricks/                notebooks and SQL (planned)
docs/                      PRD, kickoff, phases, workflow, team contract
.github/                   CI, ownership, PR template
scripts/                   task and pre-PR helpers
```

The empty track directories will be created by their owners as implementation begins. Shared TypeScript contracts exist now; API paths are listed in `docs/TEAM_CONTRACT.md` but no trip endpoints exist yet.

## GitHub setup remaining

The local `origin` points to `https://github.com/aksharkakkad-web/VTHacks.git`. The initial push, test PR, CI, and overlap-warning run have succeeded. GitHub `main` protection is not enabled yet; add Mahin/Rishit's real GitHub handles to `.github/CODEOWNERS` if desired. Agents should run the local scripts themselves and use the checkpoint plan for integration.
