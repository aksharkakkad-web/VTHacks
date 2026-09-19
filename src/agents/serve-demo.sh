#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
provider_dir=$(mktemp -d "${TMPDIR:-/tmp}/beacon-providers.XXXXXX")
trap 'rm -rf "$provider_dir"' EXIT
./node_modules/.bin/tsc -p src/agents/tsconfig.test.json --outDir "$provider_dir"
node "$provider_dir/agents/serve-demo.js"
