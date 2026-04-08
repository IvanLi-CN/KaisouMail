#!/usr/bin/env bash
set -euo pipefail

origins=()
while IFS= read -r smoke_origin; do
  if [ -n "${smoke_origin}" ]; then
    origins+=("${smoke_origin}")
  fi
done < <(
  CF_PAGES_SMOKE_ORIGINS="km.example.com, https://cfm.example.com/" \
    node .github/scripts/resolve_pages_smoke_origins.mjs
)

expected=(
  "https://km.example.com"
  "https://cfm.example.com"
)

if [ "${#origins[@]}" -ne "${#expected[@]}" ]; then
  echo "resolve_pages_smoke_origins returned unexpected count: ${#origins[@]}" >&2
  printf 'origins=%s\n' "${origins[*]}" >&2
  exit 1
fi

for index in "${!expected[@]}"; do
  if [ "${origins[${index}]}" != "${expected[${index}]}" ]; then
    echo "resolve_pages_smoke_origins mismatch at ${index}: expected ${expected[${index}]}, got ${origins[${index}]}" >&2
    exit 1
  fi
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

if CF_PAGES_SMOKE_ORIGINS="km.example.com, invalid host, https://cfm.example.com/path, *.example.com" \
  node .github/scripts/resolve_pages_smoke_origins.mjs >"${tmp_dir}/out" 2>"${tmp_dir}/err"
then
  echo "resolve_pages_smoke_origins should fail on malformed origins" >&2
  exit 1
fi

if ! grep -q "Invalid CF_PAGES_SMOKE_ORIGINS entries" "${tmp_dir}/err"; then
  echo "resolve_pages_smoke_origins did not explain malformed origins" >&2
  cat "${tmp_dir}/err" >&2
  exit 1
fi

echo "resolve_pages_smoke_origins tests passed"
