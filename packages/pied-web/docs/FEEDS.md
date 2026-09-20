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
Choosing **Last used view** persists the account/folder scope on the server. Per-account browser
storage accelerates the first paint and stays isolated between explicit tab/account URLs; it is
not the authority for a cross-account open or an explicit message link.

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

The global view is a workspace, not a synthetic IMAP folder. **All accounts** is located in the
account menu and the list names its current scope. Selecting a row from the active account opens
its real source. Selecting a row from another account first loads that tab-local account context,
then opens the exact folder and UID. Drafts resume in native Draft compose mode.

The native search field can ask the server for matching headers across every authorized account
and eligible folder. Trash, Junk, Drafts, Reminders and scheduled-mail folders are excluded unless
they are the explicit active scope. The first response freezes exact message identities under a
short-lived opaque token; later pages and **Select all results** reuse that snapshot. Page selection
states the current page scope, while all-results selection states the exact total and every
included account/folder. The server rejects expired, changed or oversized snapshots.

Delete and Remind operate in bounded batches on those exact identities. Delete requires each
account's configured Trash and exposes Undo only after the mail server confirms the destination
UID mapping. Undo therefore restores the original folder and read state rather than replaying
stale source UIDs. Uncertain or partial results are reported and are never retried blindly.

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
- Search, page and action tokens are server-side snapshots bound to the authenticated user and
  bounded by TTL, row count and byte quota; never encode the private query or mailbox identities
  into the browser-visible token.
- A mutable action requires an explicit confirmation, UIDVALIDITY revalidation and monotonic batch
  cursor. Only a completed Trash move may mint an Undo token.
- Leaving the Pied Web theme hides all Feed-only interface.

`tests/feed.php` covers settings scopes, defaults, account isolation, UID collisions, Drafts,
Conversations and endpoint validation. `tests/mailbox-operations.php` covers multi-account search,
tokens, quotas, UIDVALIDITY, batches, MOVE/COPYUID, Undo and reminders with mocked mail transport.
The fictional browser tests cover navigation, native Inbox isolation, search pagination, selection,
actions, Undo, keyboard behavior, responsive geometry and cross-account opening.
