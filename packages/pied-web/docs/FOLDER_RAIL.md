# Compact folder rail

The 72 px desktop rail mirrors native SnappyMail folder links instead of moving their Knockout-owned nodes. System mailboxes keep their semantic icons. Custom folders add a two-character monogram over the folder outline, with the complete path, unread count and reorder hint shown on hover or keyboard focus.

## Reordering

- A normal click still dispatches the untouched native folder link.
- Hold the primary pointer for 450 ms, then drag vertically. Releasing saves the complete visible order.
- `Alt+ArrowUp` and `Alt+ArrowDown` provide the equivalent keyboard path. `Escape` cancels an active pointer move.
- The compact rail may mix Feed entries, system mailboxes and custom folders. Expanding the sidebar restores the native hierarchy and its native order.

The order is stored as stable Feed or IMAP-folder identifiers in the active account's local settings under `PiedWebFolderOrderV1`. A browser-local copy keyed by account hash supplies the first compact paint and remains as a fallback if the settings request fails. Missing folders are ignored, newly discovered folders are appended, and no message content is stored.

## Compatibility and rollback

The feature is scoped to the Pied Web theme, desktop widths of at least 800 px and the native `MailFolderList` DOM of SnappyMail 2.38.2. Removing `folder-rail.js`, its JSON hook and `theme-src/folder-rail.css` restores the previous compact list; the unused preference is harmless. The browser fixture uses fictional folders and mocked settings transport.
