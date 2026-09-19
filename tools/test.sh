#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

cd "$repo_root/apps/nextsnapmail"
php tests/account-unread-counts.php
php tests/account-unread-count-setting.php
node tests/account-unread-counts.mjs

cd "$repo_root/packages/pied-web"
python3 tools/verify.py
for file in tools/web-runtime-maintenance/*.php; do
    php -l "$file" >/dev/null
done
python3 -m unittest discover -s tests -p 'test_*.py'

native_source="$repo_root/apps/nextsnapmail"
for test in \
    tests/filtered-selection.php \
    tests/attachment-image.php \
    tests/unread-drafts.php \
    tests/unread-order.php \
    tests/feed.php \
    tests/folder-order.php \
    tests/virtual-conversation-search.php \
    tests/conversation.php \
    tests/scheduled-send.php \
    tests/reminders.php \
    integrations/scheduler/tests/sender.php \
    integrations/scheduler/tests/reminders.php
do
    NEXTSNAPMAIL_SOURCE="$native_source" php "$test"
done
