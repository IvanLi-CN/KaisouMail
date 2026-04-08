#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

config_path="${tmp_dir}/wrangler.jsonc"
cat > "${config_path}" <<'JSON'
{
  "routes": [
    { "pattern": "api.one.example.com", "custom_domain": true },
    { "pattern": "api.two.example.com/*" },
    { "pattern": "api.three.example.com/v1/*" },
    "https://api.four.example.com"
  ]
}
JSON

urls=()
while IFS= read -r smoke_url; do
  if [ -n "${smoke_url}" ]; then
    urls+=("${smoke_url}")
  fi
done < <(
  VITE_API_BASE_URL="https://api.base.example.com/" \
    node .github/scripts/resolve_api_smoke_urls.mjs "${config_path}"
)

expected=(
  "https://api.base.example.com"
  "https://api.one.example.com"
  "https://api.two.example.com"
  "https://api.four.example.com"
)

if [ "${#urls[@]}" -ne "${#expected[@]}" ]; then
  echo "resolve_api_smoke_urls returned unexpected count: ${#urls[@]}" >&2
  printf 'urls=%s\n' "${urls[*]}" >&2
  exit 1
fi

for index in "${!expected[@]}"; do
  if [ "${urls[${index}]}" != "${expected[${index}]}" ]; then
    echo "resolve_api_smoke_urls mismatch at ${index}: expected ${expected[${index}]}, got ${urls[${index}]}" >&2
    exit 1
  fi
done

echo "resolve_api_smoke_urls tests passed"
