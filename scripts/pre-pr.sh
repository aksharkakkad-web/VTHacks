#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm run lint
node --test scripts/checkpoint-board.test.mjs
npm run typecheck
npm run build
