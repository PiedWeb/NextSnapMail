# Linked-account unread counts

This fix is already proposed upstream: [oe79/NextSnapMail#41](https://github.com/oe79/NextSnapMail/pull/41), draft and unmerged when this repository was prepared on 2026-09-12.

It now has two parts. The first routes the `AccountUnread` request so the main account can be asked for its own INBOX status, and refreshes every entry of the account switcher instead of one additional account at a random moment. The second makes `ShowUnreadCount` a single shared setting: SnappyMail kept it in the per-account *local* settings, which live in a subfolder of their own for every additional account, so selecting a linked account that had never enabled it hid the counts of the accounts that had. It is read and written through the non-local settings, which resolve to the main account folder, and defaults to on.

`account-unread-counts-2.38.2.patch` preserves the complete reviewed diff, including PHP/JS sources, generated gzip/Brotli variants and the tests. Its exact upstream base and patched commits are in `release.json`.

Use it only in a matching **source checkout** and inspect first:

```sh
git apply --check /path/to/account-unread-counts-2.38.2.patch
git apply /path/to/account-unread-counts-2.38.2.patch
node tests/account-unread-counts.mjs
php tests/account-unread-counts.php
php tests/account-unread-count-setting.php
```

Changing the seven application files can trigger Nextcloud's application integrity check. An app update replaces them. Do not disable integrity checks or apply old minified bundles over a newer version. Check the upstream PR before porting or deploying this optional fix.

The shared-setting part touches PHP only: `Actions.php`, `Actions/Accounts.php` and `Actions/User.php`. The four JavaScript payloads keep the hashes they had at `23c03ed`, so a deployment of this part alone does not need the minified or compressed bundles rebuilt. An account that had explicitly turned the counters off in its own `settings_local` is not migrated; that stale value is simply ignored, and the next save writes the shared one.

Verified on 2026-09-15 against the pristine base `d3b0a34`: the patch applies unchanged, the resulting tree is byte-identical to `c13bf1b`, and the eight JS tests plus both PHP tests pass. Each PHP test was also confirmed to fail with its own source change reverted.

Verified earlier on NextSnapMail 0.1.11 (tag commit `aef1e4e`) after Nextcloud 34.0.4
automatically updated the app. At that time the patch covered five files; all five
pristine target hashes matched the tag, the patch applied without changes and all eight
JS tests plus the PHP routing test passed. The exact same patched payload was restored.
See `docs/deployments/nextcloud-34.0.4.md`.
