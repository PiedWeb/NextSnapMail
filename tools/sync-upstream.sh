#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

if [[ -n $(git status --porcelain) ]]; then
    echo "Refusing to synchronize a dirty worktree." >&2
    exit 2
fi

repository=$(python3 -c 'import json; print(json.load(open("UPSTREAM.lock.json"))["components"]["nextsnapmail"]["repository"])')
branch=$(python3 -c 'import json; print(json.load(open("UPSTREAM.lock.json"))["components"]["nextsnapmail"]["branch"])')
current=$(git ls-remote "$repository" "refs/heads/$branch" | awk '{print $1}')
locked=$(python3 -c 'import json; print(json.load(open("UPSTREAM.lock.json"))["components"]["nextsnapmail"]["commit"])')

if [[ "$current" == "$locked" ]]; then
    echo "NextSnapMail is already synchronized at ${current:0:12}."
    exit 0
fi

if ! git remote get-url nextsnapmail-upstream >/dev/null 2>&1; then
    git remote add nextsnapmail-upstream "$repository"
fi

git fetch nextsnapmail-upstream "$branch"
git subtree pull \
    --prefix=apps/nextsnapmail \
    nextsnapmail-upstream "$branch" \
    -m "Merge NextSnapMail upstream ${current:0:12}"
python3 tools/check-upstream.py --update
git add UPSTREAM.lock.json
git commit --amend --no-edit

echo "Merged NextSnapMail ${current:0:12}; run ./tools/test.sh before review."
