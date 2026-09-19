# Beacon — Quick Start (No Jargon)

> Local foundation status: the app, shared types, CI, and scripts have been created. See `README.md` and `docs/TEAM_CONTRACT.md` for what remains before the team splits. Do not repeat repository creation.

## One person does this first

1. Create the GitHub repo + Next.js app.
2. Copy the starter-kit files into the repo.
3. Replace GitHub usernames in `.github/CODEOWNERS`.
4. Push the setup.
5. Turn on branch protection for `main`.
6. Make sure GitHub Actions run on a test PR.

## Then all 3 together

Open:

```text
docs/Beacon_START_HERE.md
```

Together:

1. create/freeze shared types
2. freeze API paths
3. freeze demo scenario/numbers
4. create `.env.example`
5. confirm:
   - Akshar can access Databricks
   - Mahin can start ANS setup
   - Rishit can run PWA/map/geolocation
6. check every box under `YOU MAY NOW SPLIT`

## Then split

### Akshar

Start:

```bash
./scripts/start-task.sh feat databricks-ranking
```

Goal:

```text
CandidatePlan[] → Databricks → Recommendation
```

### Mahin

Start:

```bash
./scripts/start-task.sh feat provider-agents
```

Goal:

```text
Student Agent → provider endpoints → CandidatePlan[]
```

Also start ANS registration early.

### Rishit

Start:

```bash
./scripts/start-task.sh feat take-me-home-flow
```

Goal:

build the entire visible demo with mocks:

```text
TAKE ME HOME
→ selection
→ navigation
→ cancellation
→ recovery
→ HOME / OVERDUE
```

## While working

Push small commits.

Open a draft PR early when useful.

GitHub automation will:

- run CI
- warn if your PR changes the same files as another open PR
- warn when shared/high-impact files are changed

Codex instructions live in:

```text
AGENTS.md
```

Every coding agent should read it.

## Before any PR

Run:

```bash
./scripts/pre-pr.sh
```

## After an important PR merges

Everyone:

```bash
git checkout main
git pull --rebase origin main
```

Then start the next task from fresh `main`.

## Do not wait until the end to integrate

Use:

```text
docs/Beacon_Phase_Based_Parallel_Build_Plan.md
```

Reunite at its checkpoints.

## Simple roadmap

```text
SETUP TOGETHER
↓
SPLIT
↓
real providers
↓
real Databricks
↓
real ANS
↓
navigation + emergency monitoring
↓
automatic cancellation recovery
↓
real data depth
↓
demo hardening
↓
pitch
↓
freeze
```

## The rule

> Small PRs. Stable main. Push early. Integrate at checkpoints.
