# Shared, default-on unread counter setting

Deployed 2026-09-15 on nc.robin-d.fr (`node212-eu.n0c.com`). Nextcloud 34.0.4.1,
NextSnapMail 0.1.11, SnappyMail 2.38.2. `occ status`: installed, maintenance false,
needsDbUpgrade false. No app, plugin or theme version changed.

## Reported behaviour and cause

From one additional account the account switcher showed no unread count at all, while
from the main account it showed the expected non-zero badges. `ShowUnreadCount` was read
and written through the **local** settings of whichever account was active
(`Actions/Accounts.php` `getAccountData`, `Actions/User.php` `DoSettingsUpdate`), and
`FileStorage::GenerateFilePath` gives every additional account its own subfolder when
the storage is local. The stored flags confirmed it: `true` for the main account and
another additional account, absent for the affected account. The patched
`refreshAccountUnreadCounts` clears every badge when the flag is false, so one linked
account that had never enabled it hid the counts of the accounts that had.

## Change

`ShowUnreadCount` now goes through the non-local settings, which resolve to the main
account folder for additional accounts too, and defaults to on. Three PHP files of the
embedded application changed; the core patch covers seven files instead of five.

| File | Before | After |
| --- | --- | --- |
| `app/libraries/RainLoop/Actions.php` | `89af8034…` (pristine base) | `86586fa4…` |
| `app/libraries/RainLoop/Actions/Accounts.php` | `624273167…` (previous patch) | `f0fb4928…` |
| `app/libraries/RainLoop/Actions/User.php` | `f5e3c987…` (pristine base) | `f8102dfe…` |

The four JavaScript payloads were not touched and keep the hashes they had at `23c03ed`:
`app.js` `547b570b…`, `app.min.js` `73bdb933…`, `.gz` `863efd83…`, `.br` `5e72ce7c…`.
All seven installed hashes equal `release.json` `core_patch.files`. Patch source and
upstream base are unchanged (`d3b0a34`); the patched commit is now `c13bf1b`.

## Backup and rollback

The three pre-change files, with the hashes in the table above, are outside the web root:

`/home/robindfr/nextsnapmail-unread-setting-before-20260915T205145Z/`

To roll back, copy `RainLoop/Actions.php`, `RainLoop/Actions/Accounts.php` and
`RainLoop/Actions/User.php` from that directory back into
`~/nextcloud/apps/nextsnapmail/app/snappymail/v/2.38.2/app/libraries/RainLoop/`, then
recycle the workers as below. That restores exactly the previous five-file patch
(`patched_commit` `23c03ed`), and `release.json` must be reverted with it. No data
migration has to be undone: the change reads a different file, it rewrites none.

## Web activation

`~/.lsphp_restart.txt` is ineffective on this host, as recorded for 1.7.31 to 1.7.33.
Workers were recycled with `pkill -u robindfr lsphp` and a warm-up request
(`status.php` 200); the surviving worker was three seconds old, against 842 to 954
seconds before. With `opcache.validate_timestamps=0`, only that recycle makes changed
core PHP reachable.

## Verification

- `php tests/account-unread-counts.php`, `php tests/account-unread-count-setting.php`,
  `node --test tests/account-unread-counts.mjs`: 8 JS tests and both PHP tests pass.
  The new PHP test drives the real `getAccountData` and `DoSettingsUpdate` and the real
  `FileStorage::GenerateFilePath` with in-memory doubles; each of its three source
  changes was confirmed to make it fail when reverted on its own. The `AppData` read is
  the one call site it cannot drive, and is guarded by a source assertion instead.
- The regenerated patch applies to a pristine `d3b0a34` checkout with no change, and the
  resulting tree is byte-identical to `c13bf1b`.
- `occ integrity:check-app nextsnapmail` reports INVALID_HASH for exactly these seven
  locally patched files, with no EXTRA_FILE or MISSING_FILE. Integrity checking was not
  disabled; upstream acceptance of PR #41 remains the durable fix.
- Authenticated live session: with the affected additional account active,
  `ShowUnreadCount` is now `true` where it was `false`, and the switcher shows the
  expected non-zero badges for the other accounts. The session was returned to the
  main account, as found. Only
  the account menu was opened; no message was opened, marked or captured.

## Limits

The affected additional account shows no count of its own because its INBOX has no
unread message, not because of a failure; a zero is deliberately not displayed. An account
that had explicitly turned the counters off in its own `settings_local` is not
migrated, its stale value is ignored. The default being on means the switcher issues an
INBOX `STATUS` per linked account, at most one per account per 30 seconds, for users who
never touched the setting.
