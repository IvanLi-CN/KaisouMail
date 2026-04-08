#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

health_file="${tmp_dir}/health.json"
version_file="${tmp_dir}/version.json"

printf '%s\n' '{"ok":true}' > "${health_file}"
printf '%s\n' '{"commitSha":"abc1234"}' > "${version_file}"

HEALTH_CODE=200 \
VERSION_CODE=200 \
HEALTH_FILE="${health_file}" \
VERSION_FILE="${version_file}" \
EXPECTED_SHA=abc1234 \
SMOKE_LABEL=Preview \
node .github/scripts/verify_api_smoke.mjs > /dev/null

if HEALTH_CODE=500 \
  VERSION_CODE=200 \
  HEALTH_FILE="${health_file}" \
  VERSION_FILE="${version_file}" \
  EXPECTED_SHA=abc1234 \
  node .github/scripts/verify_api_smoke.mjs > /dev/null 2>&1; then
  echo "verify_api_smoke should fail on unexpected /health status" >&2
  exit 1
fi

printf '%s\n' '{"commitSha":"wrong"}' > "${version_file}"
if HEALTH_CODE=200 \
  VERSION_CODE=200 \
  HEALTH_FILE="${health_file}" \
  VERSION_FILE="${version_file}" \
  EXPECTED_SHA=abc1234 \
  node .github/scripts/verify_api_smoke.mjs > /dev/null 2>&1; then
  echo "verify_api_smoke should fail on mismatched commit SHA" >&2
  exit 1
fi

echo "verify_api_smoke tests passed"
