#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

version_file="${tmp_dir}/version.json"
cat > "${version_file}" <<'JSON'
{"version":"0.15.1","commitSha":"43e34f1","branch":"main"}
JSON

VERSION_CODE=200 VERSION_FILE="${version_file}" EXPECTED_SHA=43e34f1 \
  node .github/scripts/verify_pages_api_smoke.mjs > /dev/null

if VERSION_CODE=503 VERSION_FILE="${version_file}" EXPECTED_SHA=43e34f1 \
  node .github/scripts/verify_pages_api_smoke.mjs > /dev/null 2>&1; then
  echo "verify_pages_api_smoke should fail on unexpected /api/version status" >&2
  exit 1
fi

if VERSION_CODE=200 VERSION_FILE="${version_file}" EXPECTED_SHA=deadbee \
  node .github/scripts/verify_pages_api_smoke.mjs > /dev/null 2>&1; then
  echo "verify_pages_api_smoke should fail on mismatched commit SHA" >&2
  exit 1
fi

echo "verify_pages_api_smoke tests passed"
