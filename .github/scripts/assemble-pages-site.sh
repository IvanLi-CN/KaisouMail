#!/usr/bin/env bash
set -euo pipefail

docs_src="${1:?docs build dir is required}"
storybook_src="${2:?storybook build dir is required}"
out_dir="${3:?output dir is required}"

rm -rf "${out_dir}"
mkdir -p "${out_dir}/storybook"

cp -R "${docs_src}/." "${out_dir}/"
cp -R "${storybook_src}/." "${out_dir}/storybook/"

cat > "${out_dir}/storybook.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CF Mail Storybook</title>
    <meta http-equiv="refresh" content="0; url=./storybook/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      window.location.replace("./storybook/");
    </script>
  </head>
  <body>
    <p>Redirecting to Storybook…</p>
  </body>
</html>
EOF
