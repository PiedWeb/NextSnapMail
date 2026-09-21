# Mail reminders

## User contract

**Me le rappeler** is available on an open Inbox message and in the existing selected-message
bar. It offers this evening when still useful, tomorrow morning, one week and a free local date.
A conversation action includes the root and every native thread UID once.
Once a valid date is chosen, affected visible rows leave the list immediately while the confirmed
move runs. A refused operation restores those rows, their selection and focus; merely opening the
date picker never changes the list.

The operation marks each message read and moves it to a visible `Reminders` folder next to the
account's configured Drafts folder. The folder shows the due date on each row. Its reader can
change that date or **Return to Inbox** immediately. When the due minute arrives, the server
moves the message to `INBOX` without `\\Seen`; the normal unread count and Pied Web's optional
unread-first flow then surface it again.

This is snooze/remind-later behavior, not a calendar event, task or new copy. Other IMAP clients
can inspect or move the waiting message from `Reminders`, though only Pied Web interprets its
date. A message moved elsewhere by another client is deliberately not moved back later.

## Storage and worker

The mailbox is the queue. A waiting message carries one custom IMAP keyword:

```text
$pwremind-<due Unix time encoded in base 36>
```

No subject, sender, recipient or body is copied into Nextcloud data. The browser endpoint reads
and writes only UIDs, flags, folders and the due instant. The existing
`piedwebmailscheduler` runner scans `Scheduled` and `Reminders` in one mailbox pass, and its
ordinary heartbeat/hint files contain only timestamps and an account-key digest.

The endpoint accepts at most 200 UIDs and dates from roughly now through 400 days. It refuses to
move mail when the sender heartbeat is older than thirty minutes or the IMAP server cannot store
custom keywords. If the initial move fails, its reminder keyword is removed and messages that
were unread become unread again. If a due or manual return fails, the message remains read and
stamped in `Reminders` for retry.

## Operations and rollback

Disabling `piedwebmailscheduler` stops automatic wake-up; waiting messages remain visible in
`Reminders`. They can be returned with the UI while the plugin remains enabled, or moved to
Inbox in any IMAP client and marked unread. Removing the custom `$pwremind-*` keyword prevents a
message left in `Reminders` from being moved automatically.

Restoring plugin 1.8.14 removes the UI and endpoint but does not delete mail. Restoring scheduler
1.0.3 stops interpreting reminder keywords. Upgrade or rollback must preserve the folder and
message flags; there is no reminder table or content file to migrate.

## Validation

- `tests/reminders.php` drives the authenticated endpoint against mocked IMAP with native
  MailSo flags and sequence sets.
- `integrations/scheduler/tests/reminders.php` drives due, future, dry-run and failed-wake paths.
- `tests/browser/test-reminders.js` covers reader and bulk actions, immediate row staging and
  rollback, thread UIDs, failure copy, dates, keyboard focus, the folder badges, immediate return
  and 390 px geometry with fictional messages and mocked transport.
