# Product and implementation memory

The owner uses NextSnapMail inside Nextcloud with multiple personal/work accounts.
The desired experience is a quiet, readable mail client inspired by Roundcube's folder
navigation, integrated with the Nextcloud shell. Both phone and desktop matter.

## Decisions to preserve

- Pied Web branding, neutral surfaces and teal selection/primary actions; local licensed fonts/icons.
- Since 1.7.3 mail fills the Nextcloud window. Preserve the native app grid at top left;
  hide surrounding Nextcloud chrome only with Pied Web, restore it on exit. Mobile search
  expands below the single header. Checked message rows have a stronger teal surface.
  See MAIL_SHELL.md for native launcher ownership and fallbacks.
- Since 1.7.12 the first Confort proposal applies only from 1200 px: wider navigation/list,
  40 px folder rows and roomier message reading. The established mobile layout is deliberately
  unchanged; compare fictional 390 px screenshots when adjusting desktop CSS again.
- Since 1.7.13 the desktop minimum width applies only while folders are expanded. A collapsed
  rail is 72 px and faint dividers separate messages.
- Since 1.7.14 a desktop-only read-status dot sits at the start of each row and calls the native
  seen/unseen action for a message in the active list. Attachment indicators sit in a fixed
  right-hand column. Unstarred desktop stars appear on hover/focus; starred ones remain
  visible. Mobile keeps its visible star and unchanged row geometry; SnappyMail's native
  row double-tap already has another meaning.
- Since 1.7.15 visible checkboxes are hidden only when the selection script has mounted.
  Ctrl/Command+click enters native checked selection on desktop; a 550 ms long touch does
  so on mobile. Further row taps toggle checked state. A count, Done button and Escape exit
  keep the mode explicit. Scroll movement cancels long touch, and swipe deletion is disabled
  while selection is active. Native checkboxes remain the fallback if the script is absent.
- Since 1.7.16 desktop rows at 1200 px and wider hide relative times; day headings
  still mark the timeline and the opened message retains its full date. The row border
  directly before a day heading is transparent to avoid a double separator. Mobile
  date and divider styling remains unchanged.
- Since 1.7.17 desktop day headings add a short leading rule without moving the date
  label, balancing the existing trailing rule; the mobile headings stay unchanged.
- Consistent folder geometry and native special-folder icons. A collapsed 72 px icon rail
  with small counters; secondary counters are quieter than inbox unread counts.
- Conversation totals and unread counts are visually distinct; list stars use an
  outlined/filled pair and preserve native folder/selection commands.
  Since 1.7.2 followed messages use an amber star and row tint. Metadata CSS belongs to the
  theme and works before plugin initialization; theme changes and late DOM mounting are tested.
- The Conversations toggle uses its existing `aria-pressed` state for a visible teal
  icon, background and full outline in every list toolbar layout. Keep the icon
  color tied to the button state, including mobile and dark mode. SnappyMail's
  bootstrap setting is `useThreads` (lowercase `u`); the saved server setting is
  `UseThreads`. The button must read the bootstrap spelling to show the real mode.
- Since 1.8.4, that preference belongs to `INBOX` only. Hide its control elsewhere,
  strip native thread parameters from list and reader requests outside `INBOX`, and
  never start the Pied Web conversation reader from Trash, Sent, Drafts, Archive or
  a custom folder. An Inbox conversation may still contain its matching Sent replies.
- Since 1.8.5, `INBOX` also has an independent per-account mixed-order preference.
  When active in the ordinary feed, unread received rows on each native page are oldest-first,
  followed by read rows newest-first; unread Draft reminders are queried oldest-first too.
  Keep Draft rows outside native Inbox selection, keep native pagination, and leave searches,
  opened threads and other folders in their native order. See `UNREAD_ORDER.md`.
- Native IMAP threads are folder-scoped. Since 1.7.20, Conversations mode
  assembles the opened message's native folder thread with matching Sent replies
  from read-only header searches. The newest message, received or sent, opens
  with SnappyMail's native reader and actions; other messages are folded cards
  around it. Mounting retries after the reader DOM appears, since the plugin
  event can precede its template. The older list-only panel missed normal
  opened messages. Since 1.7.10 the send hook no longer creates copies.
  Existing copies from 1.7.8/1.7.9 are not deleted. See
  `VIRTUAL_CONVERSATIONS.md`.
- The 1.7.21 reader keeps SnappyMail's bound Close action beside previous/next
  on desktop, with the mobile header Back action serving the same purpose. Hide
  the expanded message until its first cross-folder lookup and native load
  settle so newly found folded cards do not shift visible content.
- Since 1.7.22, take the conversation heading from the earliest chronological
  message and keep the native open-message subject at sender-line size. Hide
  the heading during initial lookup to avoid showing a transient later subject.
- Since 1.7.23, folded cards show a one-line plain-text body excerpt instead of
  the repeated subject. Fetch missing excerpts only for visible cards with the
  native read-only Message endpoint, at most two requests at once, and clear
  the short preview cache when accounts change. Desktop-only CSS refines the
  header, actions, calendar import, file tiles and conversation count; the
  native resizers retain variable widths and the mobile layout stays intact.
- Since 1.7.24, the desktop reader sender line sits directly below its preceding
  header content with no extra top margin; the mobile breakpoint is unchanged.
- Since 1.7.25, a sole iCalendar attachment keeps SnappyMail's semantic calendar
  glyph in desktop message rows. The custom paperclip is limited to generic/mixed
  and text-file indicators; recognized image, archive and other file types also
  retain their native glyphs. Desktop reader attachments have more space before
  their lower divider. A single file relies on its already-downloadable tile;
  with multiple files, native selection and ZIP download controls are visible
  without the ambiguous settings cog. Mobile keeps SnappyMail's compact control.
- Since 1.7.32, the reader places the opened message at the top of its scroller
  when folded history is drawn above it, 24 px below the previous card, so a long
  conversation no longer opens on its oldest card. It happens once per opened
  message, where the expanded reader is revealed, so a manual scroll, a revealed
  summary and the periodic refresh keep the position they find; the earliest
  message of a thread keeps its heading and latest-message action in view
  instead. A failed walk now drops the folder state it was answered with,
  otherwise the unchanged shortcut answered the retry and the collapsed stack
  never returned.
- Since 1.7.33, the desktop calendar action keeps 6 px between the metadata rule and
  its own hover surface, so the tinted background never touches a divider.
- Since 1.7.34, every address in the reader header is a link on the address text only,
  keeping the native `"Name" <address>` line. A click composes through the native mailto
  handler with the display name; Ctrl/Cmd+click and Ctrl+Enter copy the bare address and
  are captured before that handler. The confirmation is a page-level live region, because
  the recipient rows are clipped and scrollable. See READER_ADDRESSES.md.
- Only unread subjects are bold. Sender and subject have separate visual hierarchy.
- Mobile keeps the active account domain visible; use the full address where space permits.
- Reply/Reply all/Mark unread share the reader toolbar with existing actions. Menus keep labels.
- Since 1.7.18 the reader's native label dropdown is icon-only beside message info and the star. Its bound menu node is moved with a restoration marker; the separate label row is hidden only while the move succeeds. Rebuilt native rows discard stale controls, and theme exit restores the original placement. Since 1.7.19 the relocated menu explicitly keeps the 15 px regular menu typography; otherwise it inherits the 22 px bold message title.
- Contacts navigates to Nextcloud Contacts. The redundant Calendar shortcut was removed;
  calendar invitation import uses the native integration.
- Swipes and plain Delete act on the intended list messages through native Trash commands.
  All filtered pages use a confirmed, account/folder/filter-scoped UID snapshot.
- The Undo Send window floats after closing compose, while mailbox use continues.
  It delays browser submission; there is no recall after delivery.
  Since 1.7.53 the window is three seconds, held in one place as
  `PiedWebUx.sendDelaySeconds`, and a quiet send glyph beside Undo skips the rest of the
  countdown. It skips only the wait: the send still waits for the draft save, Undo stays
  available until the request leaves, and the glyph is hidden once the countdown is over.
  Closing the window during the countdown still sends nothing, and the draft is in Drafts.
- Since 1.8.0 a message can be given a time instead of a countdown. The scheduled message is
  stored, finished and prepared as a send, in a `Scheduled` folder beside the account's own
  Drafts folder, carrying `X-Pied-Web-Send-At`; the companion Nextcloud app
  `piedwebmailscheduler` hands it to the account's own SMTP server when due. The mailbox is
  the queue: the message stays readable, searchable and movable, and cancelling it is a move
  back to Drafts. Sending is at most once — a message is claimed with `$pwsending` before its
  SMTP transaction and the claim is never released — so an interrupted pass reports instead
  of repeating. The composer refuses to schedule when no sender has left a heartbeat in the
  last thirty minutes. See `SCHEDULED_SEND.md`.
- Markdown and source complement the native visual editor. Send/save remains native HTML.
- Reader Copy as Markdown uses the displayed message body, expands quoted text in the copy,
  and flattens image-heavy contact signatures to short linked text. It leaves the message
  and its native actions unchanged. A brief checkmark or cross confirms the result on the
  button, with an accessible status announcement. See `COPY_MARKDOWN.md`.
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

## Calendar workspace

The separate add-on in `integrations/calendar` removes Calendar’s frame and puts the native
app grid beside its event filter. Calendar’s mobile focus trap requires the original menu
inside its drawer, unlike Mail/Office’s fixed launchers. Preserve its Vue instance and
restoration placeholder. A fixed launcher outside the trap breaks mobile pointer/keyboard
access. Collapsed navigation reveals the grid through its native drawer button. No event
data/settings are changed. See `deployments/calendar-1.0.1.md`.

## Deployment runtime contract

The live URL is nc.robin-d.fr. On n0c, web LiteSpeed OPcache can retain old plugin PHP
with `opcache.validate_timestamps=0`, even after successful CLI/hash checks. Version
1.7.2 only became visible after targeted web invalidation of the old 1.6.4 index.
Follow MAINTENANCE.md for deployment **and rollback**; require authenticated web evidence.

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
| 1.7.4 | Copy the open reader body as Markdown from the action bar, including collapsed quotes. |
| 1.7.5 | Flatten common table-based signatures in copied Markdown without changing compose HTML. |
| 1.7.6 | Show a brief visible success or failure state on the reader copy button. |
| 1.4.0–1.4.1 | Swipe/Delete, labeled reader menu, unsubscribe placement, checkbox geometry, account stacking and compact rail alignment. |
| 1.5.1–1.5.2 | Markdown editor/paste and native flag ancestor/pressed-state repair. |
| 1.6.0–1.6.2 | Background Undo Send, direct native flag action, Lucide settings icon and functional Nextcloud Contacts link. |
| 1.6.3–1.6.4 | Interleaved quote readability and native compose toolbar redesign. |
| 1.6.5 | Inline resize/alt/remove, compression on clipboard/local attachments; first standalone GitHub release of all accumulated changes. |
| 1.7.2 | Theme-owned metadata styling, late initialization and amber followed rows. |
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
