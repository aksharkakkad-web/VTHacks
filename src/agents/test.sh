#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/beacon-tests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
./node_modules/.bin/tsc -p src/agents/tsconfig.test.json --outDir "$test_dir"
node --test "$@" "$test_dir"/agents/*.test.js
