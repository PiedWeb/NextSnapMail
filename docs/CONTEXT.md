# Product and implementation memory

The owner uses NextSnapMail inside Nextcloud with multiple personal/work accounts.
The desired experience is a quiet, readable mail client inspired by Roundcube's folder
navigation, integrated with the Nextcloud shell. Both phone and desktop matter.

## Decisions to preserve

- Pied Web branding, neutral surfaces and teal selection/primary actions; local licensed fonts/icons.
- Consistent folder geometry and native special-folder icons. A collapsed 72 px icon rail
  with small counters; secondary counters are quieter than inbox unread counts.
- Conversation totals and unread counts are visually distinct; list stars stay visible,
  use an outlined/filled pair, and preserve native folder/selection commands.
- Only unread subjects are bold. Sender and subject have separate visual hierarchy.
- Mobile keeps the active account domain visible; use the full address where space permits.
- Reply/Reply all/Mark unread share the reader toolbar with existing actions. Menus keep labels.
- Contacts navigates to Nextcloud Contacts. The redundant Calendar shortcut was removed;
  calendar invitation import uses the native integration.
- Swipes and plain Delete act on the intended list messages through native Trash commands.
  All filtered pages use a confirmed, account/folder/filter-scoped UID snapshot.
- The five-second Undo Send floats after closing compose, while mailbox use continues.
  It delays browser submission; there is no recall after delivery or server scheduled send.
- Markdown and source complement the native visual editor. Send/save remains native HTML.
- Interleaved quotes stay open; trailing history can remain folded. Keep manual quote choices.
- Formatting has a compact main row and More options. Use the existing Lucide icon assets.
- Images paste into the body, with browser compression modeled on Pushword's multi-upload:
  JPEG/PNG/WebP, maximum dimension 1980 px, target 1.8 MB, initial quality 0.85.
  Compression only replaces a smaller result. Animation and transparency are preserved.
- Image size presets and the resize handle change display size independently of byte compression.
  Controls, alt-text editor and feedback must never enter the sent HTML.
- Since 1.6.6, the Image toolbar opens the native Nextcloud file picker. Selected images
  download through authenticated same-origin WebDAV, compress locally and insert inline.
  Drag/drop remains a normal attachment; Compress is explicit on attachment cards.

- Since 1.7.0, only actual unread Drafts-folder messages appear above the first Inbox page.
  A distinct section protects single-folder native UID selection; clicking resumes Draft mode.
  Read drafts are not reminders. See `UNREAD_DRAFTS.md` for scope and refresh rules.

## Native contracts that previously caused regressions

- Squire installs a capture paste listener on the editable root. Our file handler must
  capture on its parent first, otherwise the image can be inserted twice.
- Native Knockout exposes `ko.computed(fn, {pure:true})`, not `ko.pureComputed` here.
- Reader delegated flag clicks historically depended on the `subjectParent` ancestor.
  The plugin now uses the native message-list action directly with pending/error handling.
- Inbox/Drafts UIDs can collide. Never insert multiple-folder items into native Inbox selection.
  Native ComposeType.Draft is 5; revive the full Message response and restore isHtml explicitly.
- Native attachment callbacks mark complete before setting MIME type and tempName.
  Subscribe to those metadata changes too. Commit a replacement only after upload succeeds.
- Async image operations must hold the originating draft epoch and cursor range.
  Block send/save during replacement; never resurrect a removed attachment or insert in another draft.
- Preserve native quote `details` with `blockquote` as last element for reply/print cleanup.
- Toolbar rearrangement must retain bound nodes, native command references and cursor selection.
- Restore relocated account menus and Nextcloud shell styling when leaving the theme.

## Historical milestones

| Version | Main change |
| --- | --- |
| 1.3 | Shell/list/reader redesign; 30 screenshot-only critique attempts. Final 8.2/10, best 8.3, stopped at requested cap; never claimed 9/10. |
| 1.4.0–1.4.1 | Swipe/Delete, labeled reader menu, unsubscribe placement, checkbox geometry, account stacking and compact rail alignment. |
| 1.5.1–1.5.2 | Markdown editor/paste and native flag ancestor/pressed-state repair. |
| 1.6.0–1.6.2 | Background Undo Send, direct native flag action, Lucide settings icon and functional Nextcloud Contacts link. |
| 1.6.3–1.6.4 | Interleaved quote readability and native compose toolbar redesign. |
| 1.6.5 | Inline resize/alt/remove, compression on clipboard/local attachments; first standalone GitHub release of all accumulated changes. |
| 1.7.1 | Clear conversation metadata and always-visible, accessible stars. |
| 1.7.0 | Actual unread drafts in the Inbox feed; account-safe native draft resume. |
| 1.6.6 | Nextcloud image picker, compression for Nextcloud/restored attachments and embedded HTML image paste; repository maintenance memory. |

Earlier critique screenshots used native-template fixtures with fictional mail, not an authenticated
live mailbox. Original private reports remain in the historical local workspace. Git tags preserve
the standalone distributions from 1.6.5 onward. `CHANGELOG.md` and deployment records supersede
historical notes for current installed behavior.

Not implemented: a unified inbox, server scheduled delivery, or a new vacation responder.
Sieve availability/settings and existing calendar options are configuration concerns; never overwrite
them while deploying this theme/plugin. The linked-account unread change is preserved separately
as upstream PR #41 and the version-specific patch.
