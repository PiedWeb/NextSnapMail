# Mixed unread order in the Inbox feed

Since 1.8.5, the Inbox toolbar has an independent **Unread: oldest first / Non lus :
anciens d’abord** preference beside **Conversations**. Both can be active at the same
time. The preference belongs to the active account and is stored in its local SnappyMail
settings as `PiedWebUnreadOldestFirst`.

Since 1.8.6.1, **Settings → General → Message list** also has a per-account
**When a message becomes read / Quand un message devient lu** choice, stored as
`PiedWebUnreadOrderReadBehavior`:

1. **Keep its place until refresh** (default): an automatically read row changes state in
   place. It joins the read segment on the next native list refresh.
2. **Reorder after leaving the message**: only the open row is held in place. Opening another
   message or closing the reader releases it into the read segment and anchors the newly open
   row at the same viewport position.

The choice has no effect when the mixed-order preference is off.

When enabled in the ordinary `INBOX` feed:

- unread received rows on the current native Inbox page come first, from oldest to newest;
- read received rows follow, from newest to oldest;
- the unread Drafts reminder query uses ascending date order, so its first page contains
  the genuinely oldest reminders instead of merely reversing the newest ten.

The Draft reminders remain a separate section. They are not inserted into native Inbox
selection because Inbox and Drafts UIDs can collide and SnappyMail’s move/delete commands
are scoped to one folder. Search results, an opened native thread, Sent, Drafts, Trash,
Archive and custom folders keep their native order and do not show the control.

SnappyMail still owns Inbox pagination. Received rows are rearranged only inside each page;
the plugin does not issue an unbounded cross-page Inbox query. Disabling the preference asks
the native list to reload, restoring the server’s current sort. Read/unread changes follow
the selected transition mode without cloning message models, so selection, flags,
conversation metadata and native commands keep their original objects.

`tests/unread-order.php` covers authenticated per-account persistence, the mode-1 fallback,
atomic updates and input validation.
`tests/unread-drafts.php` checks the matching IMAP sort direction. The fictional browser
fixture checks Conversation coexistence, received and Draft ordering, read-state changes,
both transition modes, viewport anchoring, settings placement, scope, failure feedback and
mobile geometry. No real message is opened, moved or changed.
