# Beacon — One-Time Repository Setup

> Local foundation status: repository initialization, Next.js scaffold, shared types, scripts, and CI files are done. Use `README.md` for current commands. The initial push, GitHub settings, test PR, teammate handles, and sponsor access checks remain pending. The example setup commands below are historical guidance, not steps to repeat in this populated folder.

**One teammate runs this setup. Everyone else joins after it is complete.**

Recommended setup owner: whoever creates/owns the GitHub repository.

---

# 1. Create the application/repository

If starting from nothing:

```bash
npx create-next-app@latest beacon --typescript --tailwind --eslint --app --src-dir
cd beacon
git init
```

Create/push the GitHub repository.

Pick ONE package manager and keep it for the whole hackathon.

For simplicity, npm is fine.

---

# 2. Copy this starter kit into the repo root

After copying, the repo should contain:

```text
AGENTS.md
CONTRIBUTING.md
CODEX_TASK_TEMPLATE.md

.github/
  pull_request_template.md
  CODEOWNERS
  workflows/
    ci.yml
    overlap-warning.yml

scripts/
  start-task.sh
  pre-pr.sh
  check-overlap.sh

docs/
  Beacon_START_HERE.md
  Beacon_Final_Hackathon_PRD.md
  Beacon_Phase_Based_Parallel_Build_Plan.md
  Beacon_Git_PR_Merge_Workflow.md
```

Run:

```bash
chmod +x scripts/*.sh
```

---

# 3. Replace GitHub username placeholders

Edit:

```text
.github/CODEOWNERS
```

Replace:

```text
@AKSHAR_GITHUB
@MAHIN_GITHUB
@RISHIT_GITHUB
```

with your real GitHub usernames.

Commit this setup through an initial setup branch/PR if the repo already has a protected main.

---

# 4. Create the project skeleton

Together, follow:

```text
docs/Beacon_START_HERE.md
```

Create shared types and repo folders before the team splits.

---

# 5. Make sure package scripts exist

At minimum, the project should support:

```text
build
lint
```

Prefer adding:

```text
typecheck
test
```

Example:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint",
    "test": "echo \"No tests yet\"",
    "build": "next build"
  }
}
```

Use commands appropriate to the actual Next.js version.

The CI script automatically skips missing optional scripts but always expects a production build.

---

# 6. GitHub settings to enable manually

Repository → Settings → Rules / Branch protection for `main`.

Recommended hackathon settings:

- Require a pull request before merging
- Prevent direct pushes to `main`
- Require status checks
- Require the `CI` workflow
- One approval for normal PRs
- Allow repository admins/team to bypass only if absolutely necessary
- Do NOT configure rules so strict that all 3 people can deadlock each other

Optional:

- automatically delete head branches after merge
- allow squash merge
- disable merge commits if desired

Use **Squash and merge** for normal feature PRs.

---

# 7. Verify GitHub Actions

Open a tiny test PR.

Confirm:

- CI starts
- build runs
- overlap warning workflow runs

Merge only after this works.

---

# 8. Team kickoff

Now all 3 teammates open:

```text
docs/Beacon_START_HERE.md
```

Complete its final split checklist together.

Only then split into:

- Akshar → Databricks
- Mahin → agents/ANS
- Rishit → product/PWA

---

# 9. Normal task workflow after setup

Start a task:

```bash
./scripts/start-task.sh feat my-task
```

Code.

Before PR:

```bash
./scripts/pre-pr.sh
```

Push and open a **draft PR early** when practical.

The overlap bot will warn if your PR shares files with another open PR.

---

# 10. Important limitation

GitHub/Codex cannot see another teammate's uncommitted local work.

Coordination becomes reliable only after work is:

- pushed
- visible in a branch
- ideally visible in a draft PR

So push small commits early.

Do not hide six hours of work locally.
