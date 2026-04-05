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
    <title>KaisouMail Storybook</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      const target = new URL("./storybook/", window.location.href);
      target.search = window.location.search;
      target.hash = window.location.hash;
      window.location.replace(target.toString());
    </script>
  </head>
  <body>
    <p><a href="./storybook/">Redirecting to Storybook…</a></p>
  </body>
</html>
EOF
