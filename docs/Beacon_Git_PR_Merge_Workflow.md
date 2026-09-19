# Beacon — Git / PR / Merge Workflow

**Goal:** Let Akshar, Mahin, and Rishit work in parallel without destroying each other's work.

---

# 1. Branch Strategy

Use:

```text
main
```

as the only shared stable branch.

Nobody should code directly on `main`.

Every task gets a short-lived feature branch.

Examples:

## Akshar — Databricks

```text
feat/databricks-connect
feat/recommendation-engine
feat/gtfs
feat/incident-context
```

## Mahin — Agents / ANS

```text
feat/provider-contract
feat/student-agent
feat/ans-discovery
feat/ans-verification
feat/replanning
feat/trip-monitor
```

## Rishit — Product / PWA

```text
feat/home-flow
feat/navigation-ui
feat/replan-ui
feat/judge-view
feat/onboarding
```

---

# 2. Protect `main`

Rules:

- no direct pushes to `main`
- all changes enter through PRs
- PRs should stay small
- at least one teammate reviews each PR quickly
- merge only when app still builds / tests pass

For a hackathon, review can be fast:

```text
"Does this break my subsystem?"
"Does this change a shared contract?"
"Does the app still run?"
```

Do not turn code review into a 30-minute ceremony.

---

# 3. File Ownership

Avoid overlap by default.

## Akshar owns

```text
/databricks/**
/src/integrations/databricks/**
/src/lib/decision-client/**
/data/**
```

## Mahin owns

```text
/src/agents/**
/src/integrations/ans/**
/src/lib/trip-state/**
/src/lib/authorization/**
/src/integrations/notifications/**
/src/app/api/trips/**
/src/app/api/demo/**
```

## Rishit owns

```text
/src/app/**
/src/components/**
/src/lib/client/**
/src/lib/demo-ui/**
```

## Shared / dangerous files

```text
/src/types/**
package.json
package-lock.json / pnpm-lock.yaml
.env.example
README.md
```

If touching a shared file:

1. post in team chat first
2. make the change
3. merge quickly
4. everyone pulls immediately

---

# 4. Daily / Continuous Workflow

Before starting a new task:

```bash
git checkout main
git pull --rebase origin main
git checkout -b feat/your-task
```

Work normally.

Commit small logical chunks:

```bash
git add .
git commit -m "feat: add campus ride quote endpoint"
```

Before opening PR:

```bash
git fetch origin
git rebase origin/main
```

Resolve any conflicts on your own branch.

Then:

```bash
git push -u origin feat/your-task
```

Open PR into:

```text
main
```

---

# 5. Why Rebase Before PR

Do not let every branch drift for 10 hours.

Before PR:

```bash
git fetch origin
git rebase origin/main
```

This means:

- your branch is tested against the newest `main`
- conflicts are solved by the person who knows the branch
- the PR is easier to merge

If you already pushed and then rebased:

```bash
git push --force-with-lease
```

Use:

```text
--force-with-lease
```

Never plain:

```text
--force
```

---

# 6. After Any PR Merges

Everyone should pull soon.

Safe update:

```bash
git checkout main
git pull --rebase origin main
```

Then on your current feature branch:

```bash
git checkout feat/current-task
git rebase main
```

This prevents branches from diverging badly.

---

# 7. PR Size Rule

Prefer:

```text
1 feature = 1 PR
```

Good PR:

```text
feat: add ANS provider resolution
```

Bad PR:

```text
feat: agents + UI + map + Databricks + random refactor
```

Small PRs reduce:

- conflicts
- review time
- rollback risk
- integration surprises

---

# 8. Shared Contract Rule

The most dangerous overlap is:

```text
/src/types/**
```

If Akshar needs a new field on `CandidatePlan`:

Do NOT silently add it.

Post:

```text
CONTRACT CHANGE:
CandidatePlan adding:
historicalExposure?: number

Reason:
Databricks route context
```

Mahin and Rishit acknowledge.

Then one person changes the type and merges it quickly.

Everyone pulls.

This avoids three incompatible versions of the same object.

---

# 9. Dependency Rule

Only one person should edit `package.json` / lockfile at a time.

If you need a package:

Post:

```text
DEPENDENCY CHANGE:
Installing @foo/bar
Editing package.json + pnpm-lock.yaml
```

Merge that PR first.

Then everyone pulls before another dependency change.

Lockfiles create ugly conflicts very easily.

---

# 10. API Route Ownership

Avoid two people creating the same API route.

Mahin owns:

```text
/api/trips/**
/api/demo/**
```

Rishit calls these routes but does not change backend behavior.

Akshar exposes Databricks through:

```text
/src/integrations/databricks/**
```

Mahin calls that adapter.

This boundary is intentional:

```text
Rishit
PWA
↓
Mahin
Trip API / Student Agent
↓
Akshar
DecisionEngine / Databricks
```

---

# 11. Integration PRs

At each phase checkpoint, create one explicit integration PR.

Example:

```text
integrate/provider-databricks
```

or:

```text
integrate/ans-trip-flow
```

Use integration branches only when two subsystems genuinely need wiring.

Do not use one permanent `develop` branch.

For a 3-person hackathon:

```text
main + short-lived features
```

is simpler.

---

# 12. Who Owns an Integration Conflict?

Rule:

> The person whose feature branch is being merged resolves their own branch conflicts.

If conflict is between two subsystem assumptions:

Both owners join for 5 minutes.

Examples:

```text
Mahin + Akshar
→ CandidatePlan / Recommendation mismatch
```

```text
Mahin + Rishit
→ Trip API / frontend mismatch
```

Do not have a third teammate guess at someone else's logic.

---

# 13. Merge Order

When multiple PRs depend on each other, merge in dependency order.

Example:

```text
1. shared type change
2. backend producer
3. backend consumer
4. UI integration
```

Not:

```text
UI first
then type changes
then backend
```

If Rishit's UI needs a new Trip field:

1. merge type contract
2. merge Mahin's backend support
3. merge Rishit's UI use

---

# 14. Checkpoint Merge Procedure

At an integration checkpoint:

## Step 1

Everyone commits current work.

```bash
git add .
git commit -m "wip: checkpoint"
```

Prefer completing the task, but do not leave uncommitted changes before integration.

## Step 2

Merge ready PRs into `main`.

## Step 3

Everyone:

```bash
git checkout main
git pull --rebase origin main
```

## Step 4

Run locally:

```bash
npm run dev
```

and if available:

```bash
npm run build
npm run lint
```

## Step 5

Run the checkpoint demo.

## Step 6

Only after checkpoint passes:

create new feature branches from fresh `main`.

---

# 15. Never Carry Old Feature Branches Forever

After PR merge:

```bash
git checkout main
git pull --rebase origin main
git branch -d feat/old-task
```

Optional remote cleanup:

```bash
git push origin --delete feat/old-task
```

Then create a fresh branch for next work.

Long-lived branches are where hackathon merge disasters come from.

---

# 16. Conflict Avoidance by Architecture

The codebase should be intentionally split so most commits never touch the same files.

```text
Rishit:
UI only

Mahin:
Agent/API only

Akshar:
Databricks/data only
```

Integration happens through frozen contracts:

```text
CandidatePlan
Recommendation
Trip
```

If you find yourselves constantly editing the same file, the subsystem boundary is wrong.

---

# 17. PR Template

Every PR description should be tiny:

```text
WHAT
- added campus ride quote endpoint

CONTRACT CHANGES
- none

HOW TO TEST
- POST /api/agents/campus-ride/quote
- expect valid CandidatePlan

BLOCKS / DEPENDS ON
- none
```

If changing a shared contract:

```text
CONTRACT CHANGES
- CandidatePlan adds reliability?: number
```

---

# 18. Commit Message Style

Keep it obvious.

Examples:

```text
feat: add Databricks recommendation query
feat: add ANS provider discovery
feat: add trip cancellation state
fix: prevent duplicate overdue SMS
fix: handle unavailable provider
chore: add mapbox dependency
refactor: isolate provider adapter
```

Do not obsess over perfect Conventional Commits.

Clarity matters more.

---

# 19. Emergency Hotfix Rule

If `main` breaks:

Nobody continues feature work until it is fixed.

Create:

```text
fix/main-build
```

Fix it.

Merge.

Everyone pulls.

A broken `main` destroys parallel velocity.

---

# 20. Demo Branch / Tag

Do not create a separate long-lived demo branch.

Keep `main` demoable.

At major stable checkpoints, tag it:

```bash
git tag demo-v1
git push origin demo-v1
```

Later:

```bash
git tag demo-v2
git push origin demo-v2
```

If something breaks badly near judging, you have a known-good commit.

---

# 21. Recommended Tags

After sponsor-complete flow:

```text
demo-sponsor-complete
```

After autonomous recovery:

```text
demo-recovery-complete
```

Before final judging:

```text
demo-final
```

---

# 22. Vercel / Deployment Rule

Deploy `main`.

Feature branches may get preview deployments if Vercel provides them.

Workflow:

```text
feature branch
→ preview
→ PR
→ merge
→ main production deployment
```

Do not manually deploy random local versions.

The team's source of truth is:

```text
main
```

---

# 23. Team Chat Protocol

Use very short messages.

When starting:

```text
STARTING:
feat/ans-verification

FILES:
src/integrations/ans/**
```

Before shared edit:

```text
SHARED FILE:
editing src/types/provider.ts
adding reliability field
```

When PR ready:

```text
PR READY:
#12 ANS verification

CONTRACT:
no change
```

When merged:

```text
MERGED:
#12

PULL MAIN
```

That alone will prevent many conflicts.

---

# 24. The Golden Rule

Do not optimize for:

> everyone coding constantly

Optimize for:

> everyone coding independently against stable boundaries

A 5-minute coordination message is cheaper than a 45-minute merge conflict.

---

# 25. Exact Recommended Workflow

For every task:

```bash
# start from current main
git checkout main
git pull --rebase origin main

# create task branch
git checkout -b feat/my-task

# code
git add .
git commit -m "feat: my task"

# sync before PR
git fetch origin
git rebase origin/main

# test
npm run build

# push
git push -u origin feat/my-task

# open PR
```

After merge:

```bash
git checkout main
git pull --rebase origin main
git branch -d feat/my-task
```

Then create the next branch.

---

# 26. Team-Specific Integration Boundaries

## Akshar ↔ Mahin

Only integrate through:

```text
CandidatePlan[]
→ DecisionEngine
→ Recommendation
```

Mahin should not directly query Databricks tables from random agent files.

Akshar should expose one clean adapter:

```ts
decisionEngine.recommend(plans, context)
```

---

## Mahin ↔ Rishit

Only integrate through:

```text
/api/trips/**
```

Rishit should not import Student Agent internals directly.

Mahin should return a `Trip`.

---

## Akshar ↔ Rishit

They should have almost no direct dependency.

Rishit sees Databricks-derived results through:

```text
Trip.recommendation
```

not through direct Databricks calls.

This drastically reduces conflicts.

---

# 27. Final Merge-Safety Checklist

Before merging any PR:

- [ ] branch rebased on latest main
- [ ] app builds
- [ ] no secrets committed
- [ ] shared type changes announced
- [ ] API contract still matches
- [ ] no unrelated files changed
- [ ] no giant lockfile conflict
- [ ] PR has clear test instructions

Before every integration checkpoint:

- [ ] all ready PRs merged
- [ ] everyone pulled latest main
- [ ] app builds on at least 2 machines
- [ ] checkpoint flow works
- [ ] stable commit tagged if important

---

# 28. Final Team Rule

> **Main stays green. Branches stay short. Contracts stay stable. Integrate at checkpoints.**

That is the entire Git strategy.
