# Account and global Feeds

Since 1.9.0, Pied Web keeps the working workflow in dedicated **Feed / Flux** views and
restores **Inbox / Boîte de réception** as the ordinary native folder.

## Views and defaults

- Every account has one account Feed. It uses that account's native Inbox models and actions.
- With exactly one account, **All my accounts / Tous mes comptes** is not shown and is never
  requested. The sole account Feed is the default.
- With two or more accounts, **All my accounts** is shown and is the default. The account Feed
  remains available beside it.
- Choosing an individual account from the account menu keeps the current mailbox context. Feed
  stays Feed, native Inbox stays Inbox, and Sent, Drafts, Junk, Trash and Archive resolve through
  the target account's own system-folder settings. An open message becomes that folder's list
  because its UID belongs only to the source account. A same-named custom folder is preserved.
- Inbox is always available as a separate native entry. Its request has no Pied Web Feed marker,
  so its native order and pagination are not enriched by the working workflow.

The opening view can be changed under **Settings → General → Feed**. `Auto` means the account
Feed with one account and All my accounts with several. Inbox can also be selected explicitly.
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

All my accounts uses the same four ranks across included accounts. Every row retains its account,
folder and UID; identical UIDs in different accounts or folders never share an identity. Account
labels remain visible in the overview. Conversations are resolved using each account's own
setting and are never merged across accounts.

## Opening and actions

The global view is a workspace, not a synthetic IMAP folder. **All my accounts** is located in the
account menu and the list names its current scope. Selecting a row from the active account opens
its real source. Selecting a row from another account first loads that tab-local account context,
then opens the exact folder and UID. Drafts resume in native Draft compose mode.

Since 1.10.10, the desktop list scope itself opens the original account menu;
the folder rail no longer repeats the active account. Mobile retains its account
header. Since 1.10.13, the desktop control puts the folder on its first line
and a muted, regular-weight account on its second line. It has no filled
background at rest and a neutral hover/open state, with square corners since
1.10.14. Since 1.10.19 its hover starts at the list pane edge while the label
keeps its 16 px inset, including with the rail collapsed. The full identity remains
available to assistive technology and in its tooltip. This follows the hierarchy
and tertiary-action principles in Schoger/Wathan, *Refactoring UI* (pp. 38–40,
46, 56, 60). **Search scope / Portée de la recherche** lives in the native Advanced
search popup, with folder, account and (for multiple accounts) All my accounts
choices. Since 1.10.39, **one selector** also includes the current folder and
its descendants, replacing the overlapping native scope in this theme. Its
submit handler maps the one choice before the native form builds the query,
retaining native `in:subtree` only for the native subtree path. Workspace searches
clear that competing criterion. Cancel leaves the committed scope and query unchanged. A native
`in:all`/`in:subtree` query is reflected when the popup opens. Theme exit restores
the original bound control. Folder/subtree queries keep the native fast path
outside the global view; account/global and global-view subtree searches retain the account-safe workspace and exact
folder identities. The list header states the selected search scope.

Subtrees use the IMAP hierarchy delimiter, include the explicit current folder
and selectable descendants, and exclude similarly named sibling folders. They
do not silently remove special folders under that explicitly selected scope.

The native search field can ask the server for matching headers across every authorized account
and eligible folder. Trash, Junk, Drafts, Reminders and scheduled-mail folders are excluded unless
they are the explicit active scope. The first response freezes exact message identities under a
short-lived opaque token; later pages and **Select all results** reuse that snapshot. Page selection
states the current page scope. The all-pages choice appears only after that page is selected and
stays grouped with its deselectable checkbox; all-results selection states the exact total and every
included account/folder. While a query is pending, previous results remain visible but muted and
inert. If the query fails, they stay explicitly stale and non-interactive until a retry or exit.
The server rejects expired, changed or oversized snapshots.

Repeated Enter while the identical query/scope/page is pending shares that request.
A different query, scope or page starts a new generation; stale responses cannot
replace its result. First navigation to All my accounts starts one global request,
while confirmed mailbox mutations still queue an authoritative refresh. Account
settings are loaded once per endpoint request, never cached between requests.

## List scanning

The normal desktop list uses approximately 60 px rows with unchanged 14 px type,
a visible per-message date and shorter day headings. At 1200 px and above its
default width is 30vw, bounded between 360 and 480 px; native resize remains bounded
at 480 px so the reader keeps the remaining space. Folder navigation stays 248 px
with 36 px rows; the collapsed rail stays 72 px. Medium desktops use 320–420 px.
Phone rows remove excess vertical padding while allowing long subjects two lines.
Global phone rows retain their complete account identity and 44 px row commands.
The explicit compact preference remains available on fine-pointer desktops.

Date grouping maps message models to row nodes in one pass and leaves existing
heading DOM in place when groups and native rows have not changed. Before native
Knockout disposal, mobile commands still leave date headings; a changed row/group
or removed heading rebuilds presentation and restores the same bound controls.

Flag/Unflag, Delete and Remind share one reserved row-action rail and operate on those exact
identities. Delete requires each
account's configured Trash and exposes Undo only after the mail server confirms the destination
UID mapping. Undo therefore restores the original folder and read state rather than replaying
stale source UIDs. Flag and bulk read/unread paint their intended state immediately, and reminder
rows leave the visible list only after a date is confirmed. Every optimistic state rolls back on
refusal; uncertain or partial results are reported and are never retried blindly.

Each account can be excluded from All my accounts under General settings. One unavailable mailbox
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
  it. It carries only the view/folder intent needed for navigation. A late settings response must
  not replace that target mode with its configured default.
- Search, page and action tokens are server-side snapshots bound to the authenticated user and
  bounded by TTL, row count and byte quota; never encode the private query or mailbox identities
  into the browser-visible token.
- A mutable action requires an explicit confirmation, UIDVALIDITY revalidation and monotonic batch
  cursor. Only a completed Trash move may mint an Undo token.
- Trash may stage affected rows out of view immediately, but a failed preparation or move must
  restore them. The staged visual state must never be presented as confirmed success or expose Undo.
- Reminder staging begins only after a valid date is chosen. Flag/read staging changes local header
  state only; it must preserve the exact identity snapshot and restore prior flags on refusal.
- Rows retained from an older search are inert and labelled by status as previous results. They must
  never open, select or mutate under the scope of a newer failed query.
- Leaving the Pied Web theme hides all Feed-only interface.

`tests/feed.php` covers settings scopes, defaults, account isolation, UID collisions, Drafts,
Conversations and endpoint validation. `tests/mailbox-operations.php` covers multi-account search,
tokens, quotas, UIDVALIDITY, batches, MOVE/COPYUID, Undo and reminders with mocked mail transport.
The fictional browser tests cover navigation, native Inbox isolation, system-folder continuity,
foreign-message UID removal, search pagination, selection, actions, Undo, keyboard behavior,
responsive geometry and cross-account opening.
