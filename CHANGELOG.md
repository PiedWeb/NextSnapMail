# Releases

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
