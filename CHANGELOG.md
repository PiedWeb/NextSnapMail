# Releases

## 1.7.12, 2026-09-14

First Pied Web Confort proposal for desktop widths of at least 1200 px: a wider folder pane and message list, 40 px folder rows, more breathing room in the message list and reading pane, and slightly larger sender text. The existing mobile and medium-width layout keeps its previous geometry. The plugin version gives SnappyMail's compiled CSS a fresh cache key; the 1.7.10 virtual Sent conversation behavior remains intact.

Fictional browser previews at 1200/1440 px in light and dark mode showed no horizontal overflow. A 390 px screenshot before and after the theme change was pixel-identical; 320 px had no horizontal overflow. See `docs/previews/1.7.12/` and the deployment record.

## 1.7.10, 2026-09-14

The open conversation now searches the configured Sent folder for replies by
`References` and `In-Reply-To`, showing matches in a clearly marked read-only
part of the stack. Matches open through the native reader with their real Sent
folder and UID. This works for older replies without migrating mail. The 1.7.8
send hook that added another copy to the original folder has been removed, so
future replies are stored only according to SnappyMail's normal Sent setting.
Copies already created by 1.7.8 or 1.7.9 remain untouched and are deduplicated
in this view by Message-ID. The query is scoped to the active account's Sent
folder and runs only for an opened thread. See `docs/VIRTUAL_CONVERSATIONS.md`
for matching and limits.

Validation: native 2.38.2 header-search parser, eleven fictional browser
scenarios including historical replies, native reader opening, account races,
retry and mobile layout; release checks. No real mail was sent or moved.

## 1.7.9, 2026-09-14

The Conversations button now reads SnappyMail's actual `useThreads` setting.
Previously it read the differently cased `UseThreads` key, so it displayed an
inactive state even when conversations were enabled. The corrected pressed state
drives the visible highlight introduced in 1.7.7, including after page reload.
The native grouping setting and message queries remain unchanged.

Validation: 16 fictional browser checks for both setting values, click targets,
desktop/mobile styling and dark mode; syntax, release and installation checks.
The authenticated production browser showed the active state after targeted
LiteSpeed OPcache invalidation. See `docs/deployments/1.7.9.md`.

## 1.7.8, 2026-09-14

Newly sent replies are copied into the folder of the message being answered, so
SnappyMail's folder-scoped conversation view can include them. The normal Sent copy
is preserved. Reply all follows the same path; forwards and replies already saved
in the original folder are not duplicated. The copy is marked read and keeps the
native Message-ID/References headers. This applies to future sends only, and
stores an additional message in the original folder. If that extra IMAP append
fails, sending and the normal Sent copy continue.

Validation: native 2.38.2 send-hook contract and eight fictional transport checks,
including stream rewind and failed-copy fallback; release checks.

## 1.7.7, 2026-09-14

The Conversations toggle now has a clearly visible pressed state in desktop and
mobile toolbars. Its icon follows the button color, and the selected background
and outline remain legible in light and dark mode. The underlying grouping
setting, reload behavior and accessible pressed state are unchanged.

Validation: fictional browser fixture at desktop and mobile widths, both color
schemes; reproducible theme build and release checks.

## 1.7.6, 2026-09-13

The reader's Copy as Markdown button now confirms a completed copy with a brief
contrasting checkmark, or shows a distinct failure mark if clipboard access fails.
The existing French/English status announcement remains; the button returns to its
copy icon after 2.4 seconds and honors reduced-motion preferences. The feedback
replays on consecutive copies without changing the clipboard result.

Validation: reader-copy browser checks including visual success, failure and reset;
signature and compose-Markdown regression checks. See `docs/COPY_MARKDOWN.md` and
the deployment record for production activation.

## 1.7.5, 2026-09-13

Copy as Markdown now recognizes common image-heavy HTML signature tables and
replaces their layout with compact contact lines. Names, roles, phone numbers,
addresses and useful email/site links remain; logos, tiny icons and empty spacer
cells are omitted. Quoted signatures are cleaned too. Data tables with headers
and the compose Markdown editor keep their existing behavior.

Validation: six fictional signature fixture checks, seven reader-copy checks and
25 existing compose-Markdown checks. See `docs/COPY_MARKDOWN.md` and the
deployment record for installation and Web activation.

## 1.7.4, 2026-09-13

The reader toolbar now has a **Copier en MD / Copy as Markdown** button beside
the message actions. It copies the currently displayed message body as Markdown,
including collapsed quotations, without changing the message or its read state.
The compose Markdown view still preserves rich HTML when editing drafts.

Validation: seven reader-copy browser fixture checks cover formatting, keyboard
activation, quotations, clipboard fallback and narrow mobile layout. See
`docs/COPY_MARKDOWN.md` and the deployment record for installation and web checks.

## Nextcloud 34.0.4 compatibility verified, 2026-09-12

Nextcloud updated from 34.0.3 to 34.0.4. Its native app upgrade also installed
NextSnapMail 0.1.11. Mail 1.7.3, Calendar workspace 1.0.1 and Office workspace
1.0.3 remain active. The app update replaced the five unread-account patch files;
a pristine 0.1.11 checkout accepted the reviewed patch, all nine patch tests passed,
and the restored payload matches its original fingerprints exactly. Other custom
payload files were preserved. See [full verification](docs/deployments/nextcloud-34.0.4.md).

## Calendar workspace 1.0.1, 2026-09-12

Calendar fills the viewport, with its native app grid before the event filter. A separate
`piedwebcalendar` add-on preserves Mail 1.7.3. Fourteen live desktop/390/320 px checks passed.
Native navigation to Files and back and dark colors also passed. The initial 1.0.0 trial
revealed a mobile focus-trap conflict; 1.0.1 mounts the original menu inside the drawer.
See [deployment evidence](docs/deployments/calendar-1.0.1.md).

## 1.7.3 activation completed, 2026-09-12

The remaining Nextcloud wrapper was caused by web OPcache still executing plugin 1.7.2.
Targeted authenticated invalidation activated the already installed 1.7.3 release.
The actual desktop and mobile mail now fill the viewport and the native app grid works.
Temporary maintenance code was removed, configuration restored exactly, and all 39
installation checks passed. Runtime files, release tag and archive are unchanged.
See [deployment evidence](docs/deployments/1.7.3.md).

## 1.7.3, 2026-09-12

Mail now fills the window while Pied Web is active in Nextcloud. The native applications
grid stays at top left beside the account; the surrounding Nextcloud bar disappears.
Mobile search expands from an icon below the single mail header. The original launcher
and search bindings are preserved, with safe theme/host restoration.

Message checkboxes align vertically with stars. Checked rows have a stronger teal surface
and thin full outline, distinct from the current message and unread subject weight.

Validation: 18 shell/selection cases (desktop, 390/320 px, dark, theme changes, compact
rail and iframe) plus 15 native metadata cases. Actual desktop launcher/selection geometry
was also previewed in the authenticated session. See docs/MAIL_SHELL.md and the deployment
record for the final installation and web activation checks.


## 1.7.2 activation repair, 2026-09-12

An authenticated session finally identified the missing changes: LiteSpeed OPcache was
still executing plugin 1.6.4 with timestamp validation disabled. Targeted invalidation
activated the existing 1.7.2 payload. The framed counter is gone in the live Inbox and
the unread-draft module now loads. No unread drafts were present on the checked account.
The temporary maintenance helper was removed and configuration restored exactly.
Runtime files/tag remain unchanged; the repository now records the guarded maintenance
workflow and requires web validation after PHP deployment/rollback.
See [web activation repair](docs/deployments/1.7.2-web-runtime-repair.md).

## 1.7.2, 2026-09-12

Followed messages have a filled amber star, a stronger star surface and a tinted row;
selection retains its teal treatment. Conversation metadata styling now ships in the
compiled Pied Web theme, independent of the plugin initialization class. Without JavaScript,
the original numeric text still displays with a quiet borderless style and no chevron.
The optional labels and keyboard controls also initialize if the native view event was missed.
A theme stylesheet marker governs activation and native style replacement restores attributes.

The owner still saw the old 13/4 badge after 1.7.1. Installed hashes matched and the actual
server-compiled CSS rendered the new badge locally. The live authenticated session was
unavailable (HTTP 401); a stale browser/FPM resource was not confirmed. This release hardens
the style/init boundary and improves followed-message visibility; it does not claim that
the previous session mismatch was diagnosed. See the deployment record for verification.

Validation: 15 native-dispatch metadata checks, 5 theme-only/late-init checks, desktop,
390/320 px and dark previews, payload syntax, reproducible theme and installation diagnostics.

## 1.7.1, 2026-09-12

Conversation counts now separate the total from an explicit unread label, for example
13 and “4 non lus”, with a quiet background and an explanatory accessible tooltip.
List stars remain visible at rest, with a filled accent star for followed messages.
They align on the right in split/mobile lists and retain a 44 px phone target. On screens
up to 360 px, conversation metadata moves below the subject to preserve sender width.
Reader stars also have a stronger contrast and a 20 px glyph.

Native Knockout text bindings, conversation navigation and flag/multi-selection commands
are preserved. Enter/Space activate the same native controls; labels follow French/English
and restore original attributes when leaving Pied Web.

Validation: 15 metadata browser checks and 25 unread-draft regressions using the extracted native list click dispatcher with mocked
flag transport; desktop, 390/320 px and dark-mode snapshots. No actual mail flag changes.
Payload syntax/build and installation diagnostics passed. See the deployment record.

## 1.7.0, 2026-09-12

Genuinely unread drafts now appear in a dedicated section at the top of the first Inbox
page. The server uses the current account’s configured Drafts folder and native UNSEEN
search; read and deleted drafts are excluded. Three reminders appear initially, with further
results available through Show more. Clicking resumes native Draft composition with its
original UID, recipients, attachments and reply references.

The section deliberately keeps draft UIDs outside the received-message selection, because
native multi-select commands assume a single folder. Search and later Inbox pages remain
unchanged. Account changes invalidate pending requests; refresh, retry, empty-Inbox,
mobile and dark-mode behavior are covered. See `docs/UNREAD_DRAFTS.md` for limits.

Validation: 25 browser draft scenarios, 19 native parser/endpoint checks, 22 editor image
regressions, 25 filtered-selection checks, 10 attachment storage checks and 5 installation
diagnostics. Native models are used with fictional mail and mocked transport/popup opening;
no real mail operations or authenticated live browser session. Payload syntax and reproducible
theme build passed; the deployment record documents actual server compilation and hashes.

## 1.6.6, 2026-09-12

The compose Image button now opens the native Nextcloud file selector. Selected raster images
are downloaded with the current authenticated session, compressed locally and inserted inline.
Compression also handles clipboard HTML containing a single embedded image. Local file paste
and drag/drop keep their established inline/attachment behavior.

Compress now appears on Nextcloud-imported and restored JPEG/PNG/WebP attachments, which
previously lacked a browser File. An authenticated, account-scoped image-read endpoint retrieves
the temporary original on demand. The original is retained unless the smaller replacement
uploads successfully. Metadata subscriptions handle native completion ordering. Compress has a contrasting surface
and border so it no longer blends into the attachment card.

Repository maintenance memory now lives in `AGENTS.md`, `docs/CONTEXT.md`, `docs/MAINTENANCE.md`
and deployment records. The verifier also rejects missing payload files and version mismatches; the installation
diagnostic supports hosting accounts without Python’s newer `str.removeprefix`.
Image behavior and limits are documented in `docs/IMAGES.md`.

Validation: 17 Nextcloud/native picker scenarios, 10 native storage/endpoint checks, 22 image
checks, 11 edge cases, 23 toolbar and 25 Markdown regressions; 25 filtered-selection checks,
5 installation diagnostics, syntax and reproducible theme. Browser transport/popup lifecycle
and mail transport are mocked; no real mail is sent or deleted. See the deployment record
for actual server compilation and installed fingerprint verification.

## 1.6.5, 2026-09-12

First standalone distribution of the complete Pied Web customization. Plugin and compiled theme are byte-identical to the validated deployed baseline. Repository packaging adds no production behavior change.

Includes the accumulated navigation, reader, filtered-selection, swipe/keyboard, background Undo Send, Markdown, toolbar and image improvements. The account unread correction remains a separate upstream patch.

Image release validation before packaging: 22 native image/attachment checks, 11 edge cases, 23 toolbar regression checks and 25 Markdown checks. Actual Squire/HtmlEditor, native attachment callbacks and serialization were used with synthetic data and mocked transport. Responsive previews were checked at 1280/390/320 pixels, including dark mode. No authenticated live-mail browser or real mail operations were used for these checks.

Repository validation additionally checks byte-identical payloads, reproducible theme generation, syntax, read-only upgrade diagnostics and filtered-selection behavior. Future releases should update the version matrix only after verifying compatibility.
