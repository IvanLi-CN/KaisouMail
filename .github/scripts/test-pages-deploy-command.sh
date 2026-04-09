#!/usr/bin/env bash
set -euo pipefail

workflow_path=".github/workflows/deploy-main.yml"
if grep -Fq 'pages deploy --config apps/web/wrangler.jsonc' "${workflow_path}"; then
  echo "Deploy workflow still passes apps/web/wrangler.jsonc via --config, which wrangler pages deploy rejects." >&2
  exit 1
fi

if ! grep -Fq 'cd apps/web' "${workflow_path}"; then
  echo "Deploy workflow must enter apps/web before invoking wrangler pages deploy so Pages can use the local wrangler.jsonc." >&2
  exit 1
fi

if ! grep -Fq 'pages_wrangler_bin="${repo_root}/apps/api-worker/node_modules/.bin/wrangler"' "${workflow_path}"; then
  echo "Deploy workflow no longer pins the Pages deploy wrangler binary to the repo-root install path." >&2
  exit 1
fi

if ! grep -Fq '"${pages_wrangler_bin}" pages deploy' "${workflow_path}"; then
  echo "Deploy workflow is missing the repo-root wrangler invocation for Pages deploy." >&2
  exit 1
fi

echo "pages deploy workflow tests passed"
