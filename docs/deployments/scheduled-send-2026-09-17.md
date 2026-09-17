# Deployment: scheduled send, 2026-09-17

Plugin **1.8.3** and a new companion Nextcloud app, **`piedwebmailscheduler` 1.0.3**, installed
on the n0c production instance. The composer can give a message a time; the app hands it to the
account's own SMTP server when that time comes, with no browser open.

Three plugin releases and four app releases reached production in this session. Two defects
were found by deploying and then using the feature on the real mailbox, and both are recorded
below with what they cost: nothing left the mailbox that should not have, and nothing was lost.

## Preflight

Read-only comparison of the installed payload against the 1.7.53 manifest: 40 of 40 tracked
files identical, none missing, no foreign file, mode 644 throughout. The installed `index.php`
announced `VERSION = '1.7.53'`. `apps/piedwebmailscheduler` did not exist.

Backups outside the web root, before any write:

- `~/nextsnapmail-pied-web-backups/pied-web-ux-1.7.53-20260917T062517Z/`
  (36 files; `index.php` 6 101 B, SHA-256 `aae30f2d…`)
- `~/nextsnapmail-pied-web-backups/PiedWeb-theme-1.7.53-20260917T062517Z/`
  (4 files; `style.css` 225 832 B, SHA-256 `11fae7e3…`)
- `~/crontab-before-scheduled-send-20260917T062820Z.txt` (24 lines)

Both payload hashes equal the 1.7.53 manifest, so the backup is the release it claims. The
theme is unchanged by this work and rebuilt to the same bytes.

## Installation

Plugin files were staged privately in `~/.pw-stage-*` (mode 700), their bytes compared with the
manifest, and the server's own `php -l` accepted every PHP file before any write. Assets were
installed first, the version-bearing `index.php` last. After each write the whole payload was
compared with the manifest: 42 of 42 files, mode 644, no drift, nothing missing, no foreign
file. Workers were recycled with `pkill -u robindfr lsphp` and warmed up; with
`opcache.validate_timestamps=0` the served bundle key is the only proof of web activation, and
it changed at each step: `c4e5134a…` (1.7.53) → `27b8b41a…` → `3fc49564…` → `f7358b99…` (1.8.3).

The app was extracted into `apps/`, `occ app:enable piedwebmailscheduler`, files 644 and
directories 755, its eight files equal to `integrations/scheduler/release.json`. Later versions
were installed the same way and registered with `occ config:app:set piedwebmailscheduler
installed_version`, the app carrying no migration of its own. `occ status` reports
`maintenance: false` and `needsDbUpgrade: false`.

One crontab line was added, after the backup above:

```cron
* * * * * cd /home/robindfr/nextcloud && /usr/bin/php -d apc.enable_cli=1 occ piedweb:mail:send-scheduled -q
```

Nextcloud's own cron already carries the same pass every five minutes through the app's timed
job. The per-minute line is what makes a message leave within the minute it was promised. Each
invocation costs one Nextcloud bootstrap and, when nothing is due and the poll interval has not
elapsed, no mailbox connection at all.

## What the deployment found

**1.8.0 and 1.8.1 refused every schedule.** The composer hands over `new Date(...).toISOString()`,
which carries milliseconds; the header stamp accepted an instant only without them. The first
real schedule on the production mailbox came back "Message non programmé. Reprenez-le pour
réessayer." — the correct behaviour for a refusal, but the refusal was wrong. The two sides had
never met: the PHP checks fed hand-written instants and the browser check asserted the
millisecond form. Both now use the shape the composer actually sends. Fixed in **1.8.2**; no
message was stored, lost or sent while it was broken.

**1.8.0's control wore the Nextcloud button border and grey fill.** It carries the native `btn`
class to keep the header's metrics, and the preserved control sheet styles `#rl-app button.btn`
with `!important` and one class more than the rule meant to override it. The fixture reproduced
it once the check measured the control itself rather than only the panel. Fixed in **1.8.1**.

**The sender logged a suppressed `unlink` warning** on every pass that found an empty queue —
Nextcloud logs suppressed warnings anyway. Fixed in app **1.0.3**. **The app's first poll
timestamp key was 69 characters**, over Nextcloud's 64-character limit, so the interval was
never recorded; fixed in app **1.0.1** before anything depended on it.

## Verification

- `python3 tools/verify.py`: 42 payload files, reproducible theme, syntax passed. Python
  diagnostics: 5 tests. `tests/scheduled-send.php`: 45 checks. `integrations/scheduler/tests/sender.php`:
  41 checks. `tests/browser/test-scheduled-send.js`: 19 checks. All passing.
- Authenticated production page, `nc.robin-d.fr/apps/nextsnapmail/`: the icon set holds 24
  glyphs including `clock`, `PiedWebUx.scheduleSend`, `canSchedule` and `formatSendAt` are
  present, and the Pied Web theme is active.
- The control in the live composer: between Envoyer and Enregistrer, 141 × 36 with a 20 px
  glyph, on the same row as both native buttons, border `0px`, background transparent. Its
  panel opens on its own white surface, inside the viewport, 300 px wide, three times offered,
  every control at least 44 px, the confirm the only filled one.
- The endpoint answers on production: `folder` returns `Scheduled` with a heartbeat seconds
  old, `list` returns the queue, `cancel` in both modes was exercised.
- **End to end, on the real mailbox**: a message to the account itself, scheduled at 06:47 Z for
  06:50 Z, was stored in `Scheduled` (uid 3, `X-Pied-Web-Send-At: 2026-09-17T06:50:00Z`, state
  `pending`), reported by the server as `pending 1, next 2026-09-17T06:50:00+00:00`, and then
  sent by the per-minute cron with no browser action: at 06:51 Z the queue was empty, the note
  removed, and the message was at the top of **Sent** and unread at the top of **INBOX**.
- The queue's own surfaces were read on production, which no fixture covers: the row badge
  showed `aujourd'hui à 09:06`, state `pending`, 20 px on the primary tint, and the reader bar
  showed the same time with a 44 px **Remettre en brouillon**, which moved the message to Drafts
  and emptied the queue.
- `scripts/audit-live.py` in the parent notebook, after the writes: 69 of 69 tracked files match
  the published manifests — the eight app files are now tracked — Calendar description patch
  present, `.htaccess` directives and the Mail attachment cache window as expected
  (`evidence/live-2026-09-17-scheduled-send.json`). `occ status`: no maintenance, no pending
  database upgrade.

## Boundaries

One real message was sent, from the account to itself, to prove the path. Nothing else was
composed, sent, moved, deleted, flagged or marked unread, except the test messages this
deployment created and cancelled.

Two artefacts are left in the mailbox for the owner to remove: the draft
*Test de programmation — à supprimer*, left in **Drafts** by the reader-bar cancel, and the pair
*Envoi programmé — contrôle de déploiement* in **Sent** and **INBOX**, which is the proof above.

The `Scheduled` folder itself was created on the mailbox by the first use of the feature. It is
empty. Removing it is a normal folder deletion in the interface; the feature recreates it on the
next schedule.

Encrypted and signed messages were not scheduled on production. The path prepares them exactly
as a send does — the stored copy is the finished message — but only plain messages were sent
through it here. A mailbox whose IMAP server refuses custom keywords would be skipped entirely;
this one supports them, which the successful claim proves.

The dark theme was not measured on production: the account renders the light theme.

## Rollback

Plugin, from the backup of this session:

```sh
cp ~/nextsnapmail-pied-web-backups/pied-web-ux-1.7.53-20260917T062517Z/{background-send.js,composer-icons.js,composer-icons.json,ux.css,index.php} \
   ~/nextcloud/data/appdata_nextsnapmail/_data_/_default_/plugins/pied-web-ux/
rm ~/nextcloud/data/appdata_nextsnapmail/_data_/_default_/plugins/pied-web-ux/{ScheduledSend.php,scheduled-send.js}
pkill -u robindfr lsphp
```

then confirm the bundle key changes and `VERSION` reads `1.7.53`. The two added files must be
removed: 1.7.53's `index.php` does not load them, but leaving them would fail the payload check.

Sender, independently of the plugin:

```sh
php -d apc.enable_cli=1 occ app:disable piedwebmailscheduler
crontab ~/crontab-before-scheduled-send-20260917T062820Z.txt
```

Scheduled messages then stay in their folder, unsent and visible, until the app is enabled again
or their author moves them back to Drafts. Disabling the app alone is the right first move if
sending misbehaves: the plugin then refuses new schedules, because the heartbeat stops, and
nothing already scheduled leaves. Removing `apps/piedwebmailscheduler/` and the appconfig keys
`poll-*` and `installed_version` completes the removal. This release writes no user data and no
mail configuration; the notes it keeps are two timestamps under
`data/appdata_nextsnapmail/_data_/_default_/pied-web-ux/scheduled/`.
