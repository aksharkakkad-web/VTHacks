#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI (gh) to check PR overlap." >&2
  exit 2
fi

current_pr="${1:-}"
if [[ -z "$current_pr" ]]; then
  current_pr="$(gh pr view --json number --jq '.number')"
fi

if [[ ! "$current_pr" =~ ^[0-9]+$ ]]; then
  echo "Usage: ./scripts/check-overlap.sh PR_NUMBER" >&2
  exit 2
fi

current_files="$(gh pr view "$current_pr" --json files --jq '.files[].path' | sort)"
found=0

while IFS= read -r other_pr; do
  [[ -z "$other_pr" || "$other_pr" == "$current_pr" ]] && continue
  other_files="$(gh pr view "$other_pr" --json files --jq '.files[].path' | sort)"
  overlap="$(comm -12 <(printf '%s\n' "$current_files") <(printf '%s\n' "$other_files"))"
  if [[ -n "$overlap" ]]; then
    found=1
    echo "::warning::PR #$current_pr overlaps with PR #$other_pr: $(printf '%s' "$overlap" | paste -sd ', ' -)"
  fi
done < <(gh pr list --state open --json number --jq '.[].number')

if [[ "$found" -eq 0 ]]; then
  echo "No overlapping files found in other open PRs."
fi
