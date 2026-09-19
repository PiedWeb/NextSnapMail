# Account and global Feeds

Since 1.9.0, Pied Web keeps the working workflow in dedicated **Feed / Flux** views and
restores **Inbox / Boîte de réception** as the ordinary native folder.

## Views and defaults

- Every account has one account Feed. It uses that account's native Inbox models and actions.
- With exactly one account, **All accounts / Tous les comptes** is not shown and is never
  requested. The sole account Feed is the default.
- With two or more accounts, **All accounts** is shown and is the default. The account Feed
  remains available beside it.
- Inbox is always available as a separate native entry. Its request has no Pied Web Feed marker,
  so its native order and pagination are not enriched by the working workflow.

The opening view can be changed under **Settings → General → Feed**. `Auto` means the account
Feed with one account and All accounts with several. Inbox can also be selected explicitly.
The chosen view is remembered per active account for the browser session.

## Ordering

An account Feed keeps the existing native list and actions, then applies the configured workflow:

1. genuinely unread Drafts reminders, oldest first;
2. visibly unread Inbox roots, oldest first;
3. read roots whose conversation contains an older unread member, oldest first;
4. read Inbox roots, newest first.

The mixed order, Draft reminders and read segment can be switched in General settings. Their
defaults reproduce the workflow that existed before the Feed was split from Inbox. Searches,
opened threads and folders other than Inbox retain native behavior.

All accounts uses the same four ranks across included accounts. Every row retains its account,
folder and UID; identical UIDs in different accounts or folders never share an identity. Account
labels remain visible in the overview. Conversations are resolved using each account's own
setting and are never merged across accounts.

## Opening and actions

The global view is an overview, not a synthetic IMAP folder. Selecting a row from the active
account opens its real source. Selecting a row from another account first uses the native account
switch, reloads that authenticated account, then opens the exact folder and UID. Drafts resume in
native Draft compose mode. Cross-account selection and bulk actions are deliberately absent;
normal actions become available after opening the source account.

Each account can be excluded from All accounts under General settings. One unavailable mailbox
is reported without hiding rows fetched from the others. The endpoint returns message-list header
data only and persists no copied mail. Opening a Draft fetches its body only after the source
account is active.

## Implementation contracts

- `PiedWebFeed=1` is added only to first-party account Feed `MessageList` requests. The server-side
  unread augmentation must ignore an unmarked Inbox request.
- The global endpoint enumerates the authenticated main and additional accounts, creates an
  independent native mail client per included account and uses that account's own local settings.
- A global row key is `(account email, folder, UID)`. Never reduce it to UID alone.
- The server-reported account count remains authoritative while SnappyMail's account store is
  temporarily empty during bootstrap; otherwise the multi-account default can be lost in a race.
- A pending cross-account target is kept in session storage only until the target account consumes
  it. A late settings response must not replace that target's account-Feed mode with the default.
- Leaving the Pied Web theme hides all Feed-only interface.

`tests/feed.php` covers settings scopes, defaults, account isolation, UID collisions, Drafts,
Conversations and endpoint validation with mocked mail transport. `tests/browser/test-feed.js`
covers single- and multi-account navigation, the native Inbox boundary, request marking, ordering,
settings, responsive geometry and cross-account opening with fictional data.
