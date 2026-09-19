# Mixed unread order in the account Feed

Since 1.8.5, the working-mail toolbar has an independent **Unread: oldest first / Non lus :
anciens d’abord** preference beside **Conversations**. Both can be active at the same
time. The preference belongs to the active account and is stored in its local SnappyMail
settings as `PiedWebUnreadOldestFirst`.

Since 1.9.0, this workflow belongs to the account **Feed** rather than Inbox. The preference
defaults on to preserve the established workflow. The restored native Inbox never shows the
control and its unmarked `MessageList` response is left untouched.

Since 1.8.6.1, **Settings → General → Message list** also has a per-account
**When a message becomes read / Quand un message devient lu** choice, stored as
`PiedWebUnreadOrderReadBehavior`:

1. **Keep its place until refresh** (default): an automatically read row changes state in
   place. It joins the read segment on the next native list refresh.
2. **Reorder after leaving the message**: only the open row is held in place. Opening another
   message or closing the reader releases it into the read segment and anchors the newly open
   row at the same viewport position.

The choice has no effect when the mixed-order preference is off.

When enabled in an account Feed backed by `INBOX`:

- every unread received row is gathered on the first Inbox page;
- rows whose visible/root message is unread come first, from oldest to newest;
- conversations whose visible/root message is read but an older member is unread form a
  second oldest-first group, so read-looking roots never interrupt the visibly unread rows;
- the native first page's read rows follow, from newest to oldest;
- later pages omit unread rows already gathered on page one while retaining their native
  read rows and pagination;
- a conversation is still retained when one of its `threadUnseen` members is unread, but its
  native root read state and read-status action are not falsified;
- the unread Drafts reminder query uses ascending date order, so its first page contains
  the genuinely oldest reminders instead of merely reversing the newest ten.

The Draft reminders remain a separate section. They are not inserted into native Inbox
selection because Inbox and Drafts UIDs can collide and SnappyMail’s move/delete commands
are scoped to one folder. Search results, an opened native thread, Sent, Drafts, Trash,
Archive and custom folders keep their native order and do not show the control.

SnappyMail still owns Inbox pagination and total counts. The plugin enriches the first native
`MessageList` response before SnappyMail revives it, so the gathered rows remain real native
message models: selection, flags, conversation metadata, moves and the reader use their normal
objects. The server hook reuses that request's authenticated IMAP connection, current sort and
UID/thread caches. It performs a targeted `UNSEEN` search and fetches only unread headers; when
the first native page already covers every unread UID, it does no supplementary query. Very
large unread sets are fetched in native batches on the same connection. Failure of this optional
step leaves the ordinary native page intact.

Disabling the preference clears the gathered UID set and reloads the account Feed's native list. Read/unread
changes follow the account's **When a message becomes read** setting: either the row stays in
place until refresh, or the active row stays pinned until the reader leaves it and is then
reclassified without moving the next visible row. Search, thread detail, native Inbox and
non-Inbox requests never run or merge the supplementary collection.

`tests/unread-order.php` covers authenticated per-account persistence, input validation,
Feed-marker and first-page scope, native Inbox exclusion, the targeted query shape and the
no-query fast path.
`tests/unread-drafts.php` checks the matching IMAP sort direction. The fictional browser
fixture checks Conversation coexistence, complete native merging, later-page deduplication,
separate root-unread and conversation-member groups, received and Draft ordering, read-state changes, scope,
failure feedback and the mobile toolbar. No real message is opened, moved or changed.
