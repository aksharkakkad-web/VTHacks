#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm run lint
node --test scripts/checkpoint-board.test.mjs scripts/safecircle-state.test.mjs scripts/beacon-storage.test.mjs scripts/beacon-integration.test.mjs scripts/beacon-atomic.test.mjs scripts/local-walkthrough.test.mjs
npm run typecheck
npm run build
