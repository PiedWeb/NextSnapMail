#!/usr/bin/env bash
set -euo pipefail

# Pass the installed Terser executable explicitly, or use the pinned npm package.
# Match upstream's class-name contract (native models depend on constructor names).
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
asset_dir="$repo_root/apps/nextsnapmail/app/snappymail/v/2.38.2/static/js"
if [[ $# -eq 1 ]]; then
    node "$1" "$asset_dir/app.js" --compress ecma=2020,drop_console=true --mangle --keep-classnames --format comments=false --output "$asset_dir/min/app.min.js"
else
    npx --yes --package terser@5.44.0 terser "$asset_dir/app.js" --compress ecma=2020,drop_console=true --mangle --keep-classnames --format comments=false --output "$asset_dir/min/app.min.js"
fi
gzip -n -9 -c "$asset_dir/min/app.min.js" > "$asset_dir/min/app.min.js.gz"
brotli --force --quality=11 --output="$asset_dir/min/app.min.js.br" "$asset_dir/min/app.min.js"
node --check "$asset_dir/min/app.min.js"
