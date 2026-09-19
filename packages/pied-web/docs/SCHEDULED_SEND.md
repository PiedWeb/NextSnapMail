# Scheduled send

Since 1.8.0, **Programmer l'envoi / Schedule the send** stands beside Send in the composer.
A scheduled message leaves at the time it was given, whether or not a browser is open. That
last part is not a browser trick: it needs the companion Nextcloud app described below. The
composer asks that app when it last ran, and refuses to schedule anything if no answer comes
back, rather than parking a message that nothing would come and collect.

## What the author sees

The control opens a small panel anchored to it: this evening, tomorrow morning, Monday
morning — whichever of those are still ahead — and a field for any other date and time. The
composer then closes as it does for an ordinary send, and the notice that normally counts
down the undo window says **Envoi programmé** with the chosen moment and an **Annuler** that
puts the message straight back in the composer.

The scheduled message itself waits in a `Scheduled` folder, next to the account's own Drafts
folder. It is an ordinary message: it can be read, searched and moved with native commands.
Opening it shows a bar with its send time and **Remettre en brouillon**, which cancels the
schedule and moves the message to Drafts. Every row in that folder carries its send time, or
the state it is in — being sent, already sent, or abandoned after repeated failures.

A message is prepared exactly as a send prepares it, signatures, encryption and Bcc included.
What waits in the folder is the finished message, not a draft of it. The date a recipient
reads is the moment it actually left, not the moment it was written.

## What sends it

[`integrations/scheduler/`](../integrations/scheduler/README.md) holds the Nextcloud app
`piedwebmailscheduler`. It opens each served mailbox, reads that folder, and hands every due
message to the account's own SMTP server. It serves the mailboxes whose owner already asked
NextSnapMail to remember the password in its personal settings; it stores no secret of its
own, and does not serve a mailbox that is not already remembered.

Nextcloud's own cron carries it, which is a pass every five minutes. For a message to leave
within the minute it was promised, give `occ piedweb:mail:send-scheduled` its own crontab
line. Both routes run the same pass.

## Sent once, or not at all

Before its SMTP transaction, a message is claimed with the IMAP keyword `$pwsending`, and the
claim is never released. A pass interrupted anywhere — SMTP timeout, PHP fatal, a killed cron
— therefore leaves a claimed message that later passes report and never send. The cost is
that a message interrupted between "accepted by the server" and "filed in Sent" needs the
author to look at it. The alternative would be a message that goes out twice.

The states a message can hold, all visible in the interface:

| Keyword | Meaning | What happens next |
| --- | --- | --- |
| none | Waiting for its time | Sent when due |
| `$pwsending` | A pass claimed it | Never sent again; the author decides |
| `$pwsent` | SMTP accepted it, filing did not finish | Never sent again; the copy may be missing from Sent |
| `$pwsendfailed` | Refused for a day after its time | Never attempted again |

A refused transaction that is not yet a day old releases the claim, and the next pass retries.
A mailbox whose IMAP server refuses custom keywords is left untouched: at-most-once cannot be
promised there, so nothing is sent and the pass says so.

## Where the schedule lives

In the message, and nowhere else:

```text
X-Pied-Web-Send-At: 2026-09-18T06:00:00Z
X-Pied-Web-Send-Dsn: 1
```

Both headers are written by the plugin's `filter.save-message` hook and removed before the
message is transmitted or filed, along with `X-Draft-Info` and, for the transmitted copy,
`Bcc`. A save that cannot be stamped fails rather than leaving a message in that folder with
no time on it — and such a message, if one appears, is reported and never sent.

Two kinds of file live outside the mailbox, both under `pied-web-ux/scheduled/` in the
plugin's private data, and both holding nothing but a timestamp. One note per mailbox, named
by a hashed address, tells the sender that something is due before its next poll; losing it
delays a send to that next poll, it never drops one. One heartbeat, written by every pass,
tells the composer that a sender is running here — older than thirty minutes, or missing, and
the composer refuses to schedule. No message, recipient, address or credential is written
there.

## Limits

The queue folder is a sibling of the account's Drafts folder, named `Scheduled`, and is
created on first use. A mailbox with no Drafts folder configured cannot schedule. A folder
name that would collide with Drafts, Sent, Trash, Spam, Archive or INBOX is refused rather
than used.

This is a delayed submission, not a recall: once the message has been handed to SMTP it is
gone. It is also not a server-side queue in the mail server's sense — the mail server sees an
ordinary submission at the scheduled moment.

## Native contracts and checks

`PiedWebScheduledSend` is an authenticated POST endpoint with three operations: `folder`
(resolve and create), `list` (due times and states for the queue) and `cancel` (back to the
composer, or back to Drafts). It reads the folder from server-side account settings, never
from the browser. Storing a scheduled message is the native `SaveMessage` action with the
native `getMessageRequestParams`, so crypto, attachment serialisation and draft references
follow the engine. The sender rewrites headers by copying every kept line byte for byte,
so boundaries, encodings and signatures survive exactly as the engine wrote them.

- `tests/scheduled-send.php`: 45 checks over the endpoint, the stamped header, the note for
  the sender and its heartbeat, with the native message builder and header parser, and
  mocked IMAP.
- `integrations/scheduler/tests/sender.php`: 41 checks over folder resolution, claim order,
  header rewriting, recipients, filing, retry and abandonment, with mocked IMAP and SMTP.
- `tests/browser/test-scheduled-send.js`: 19 checks over the composer control and its panel,
  mounted on the engine's own composer header template.

No message was sent and no mailbox was opened for any of these checks. Two parts have no
fixture — the due-time badges on the queue's message rows and the bar above an open scheduled
message — and were instead read on the production mailbox during the
[deployment of 2026-09-17](deployments/scheduled-send-2026-09-17.md), which also sent one real
message end to end. They stay uncovered by the automated checks.
