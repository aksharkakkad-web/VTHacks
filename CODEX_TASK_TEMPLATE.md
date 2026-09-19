# Codex Task Template

Copy/paste this into a coding-agent task.

```text
You are working on Beacon.

Developer/owner:
[Akshar | Mahin | Rishit]

Task:
[ONE focused task]

Branch:
[feat/... | fix/...]

Read first:
- AGENTS.md
- docs/Beacon_Final_Hackathon_PRD.md
- docs/Beacon_Phase_Based_Parallel_Build_Plan.md

Do not redesign the product.

Before editing:
1. inspect git status
2. update/rebase from latest main
3. run scripts/check-overlap.sh if GitHub CLI is available
4. inspect relevant shared contracts

Work only on this task.

If a shared contract or architecture change is required:
STOP and report `CONTRACT CHANGE REQUIRED` rather than silently changing it.

Before PR:
- run scripts/pre-pr.sh
- commit
- push
- open/update a PR
- provide exact test instructions
- list contract changes or say none
```
