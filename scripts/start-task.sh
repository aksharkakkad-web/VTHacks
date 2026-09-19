#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -ne 2 || ! "$1" =~ ^(feat|fix|chore|docs)$ || ! "$2" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Usage: ./scripts/start-task.sh feat short-kebab-name" >&2
  exit 2
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash your changes first." >&2
  exit 1
fi

git fetch origin main
git switch main
git merge --ff-only origin/main
git switch -c "$1/$2"
