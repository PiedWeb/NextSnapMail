#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

suffix=$(date -u +%Y%m%d%H%M%S)
core_branch="export/nextsnapmail-$suffix"
product_branch="export/pied-web-$suffix"

git subtree split --prefix=apps/nextsnapmail -b "$core_branch"
git subtree split --prefix=packages/pied-web -b "$product_branch"

echo "Prepared local branches:"
echo "  $core_branch"
echo "  $product_branch"
echo "Nothing was pushed. Review each branch before selecting a remote."
