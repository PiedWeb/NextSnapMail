# Pied Web scheduled mail sender

Independent Nextcloud app `piedwebmailscheduler`, version 1.0.3. It sends the messages the
Mail plugin scheduled, at the time they were scheduled for, whether or not a browser is open.

## What it does, and what it refuses to do

A scheduled message is an ordinary message in a `Scheduled` folder, next to the account's own
Drafts folder, carrying one extra header:

```text
X-Pied-Web-Send-At: 2026-09-18T06:00:00Z
```

The mailbox is the queue. This app opens the mailbox, reads that folder, and for every message
whose time has come: claims it with the IMAP keyword `$pwsending`, hands it to the account's own
SMTP server, marks it `$pwsent`, files a copy in Sent, and removes it from the queue.

The claim is taken before the SMTP transaction and never taken back. A run interrupted at any
point therefore leaves a claimed message that later runs report and never send again — at most
once, with a message the author can still see, rather than a message that might leave twice.

A mailbox whose IMAP server refuses custom keywords is left alone: at-most-once cannot be
promised there, so nothing is sent.

Failures are kept where the author can see them. A refused transaction releases the claim and
the next pass retries; a message still refused a day after its time is marked `$pwsendfailed`
and stops being attempted. Both states are shown in the Mail interface, on the message itself.

## Credentials

It serves the mailboxes whose owner has already asked NextSnapMail to remember the password, in
the app's personal settings. It reads that stored value with NextSnapMail's own helper and keeps
no copy. A mailbox that is not already remembered is simply not served — this app stores no
secret of its own and adds none to the server. Two Nextcloud users holding the same mail address
are served once, so two passes can never claim the same message.

## Install

Extract `piedwebmailscheduler/` into Nextcloud's `apps/`, then:

```sh
php -d apc.enable_cli=1 occ app:enable piedwebmailscheduler
php -d apc.enable_cli=1 occ piedweb:mail:send-scheduled --dry-run --force
```

The dry run reports what is due per mailbox and sends nothing. With the app enabled, Nextcloud's
own cron carries the pass, which is one check every five minutes.

For a message to leave within the minute it was promised, give the command its own crontab line:

```cron
* * * * * cd /home/robindfr/nextcloud && /usr/bin/php -d apc.enable_cli=1 occ piedweb:mail:send-scheduled -q
```

Both routes run the same pass and the same claim, so running both is safe. A mailbox is only
opened when its poll interval has elapsed or when the browser has left a note that something is
due sooner, so the per-minute line costs nothing while nothing is scheduled.

```sh
# every five minutes by default
php -d apc.enable_cli=1 occ config:app:set piedwebmailscheduler interval --value=300
```

## Rollback

```sh
php -d apc.enable_cli=1 occ app:disable piedwebmailscheduler
```

Scheduled messages then stay in their folder, unsent and visible, until the app is enabled again
or the author moves them back to Drafts from the Mail interface. Nothing else changes: the app
owns no data, no table and no file of its own beyond one poll timestamp per mailbox in
`oc_appconfig`.

After installing, add this app's files to `scripts/audit-live.py` in the parent repository so the
read-only audit tracks them like the other companion apps.

## Checks

```sh
NEXTSNAPMAIL_SOURCE=/path/to/NextSnapMail php tests/sender.php
```

Forty checks over folder resolution, the claim order, header rewriting, recipients, filing,
retry and abandonment, using the native MailSo header parser, sequence sets and stream helpers.
IMAP and SMTP transport are simulated: the checks open no mailbox and send no message.
