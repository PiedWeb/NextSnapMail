# Mixed unread order in the Inbox feed

Since 1.8.5, the Inbox toolbar has an independent **Unread: oldest first / Non lus :
anciens d’abord** preference beside **Conversations**. Both can be active at the same
time. The preference belongs to the active account and is stored in its local SnappyMail
settings as `PiedWebUnreadOldestFirst`.

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
the native list to reload, restoring the server’s current sort. Read/unread changes reapply
the two segments without cloning message models, so selection, flags, conversation metadata
and native commands keep their original objects.

`tests/unread-order.php` covers authenticated per-account persistence and input validation.
`tests/unread-drafts.php` checks the matching IMAP sort direction. The fictional browser
fixture checks Conversation coexistence, received and Draft ordering, read-state changes,
scope, failure feedback and the mobile toolbar. No real message is opened, moved or changed.
