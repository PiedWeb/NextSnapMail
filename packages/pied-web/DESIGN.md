# Design

## Visual system

Pied Web uses quiet neutral surfaces, teal primary actions and selection, and readable native/system typography. Mail-specific tokens and components remain in theme-src/. Nextcloud integrations inherit the instance's native foreground, background, hover and focus tokens rather than imposing a second palette.

## Mail desktop comfort

From 800 px, center the reading column's subject, metadata, body, attachments,
reply actions and conversation history with equal inline margins. Keep the
existing measure and gutters, with left-aligned text.

At widths of 1200 px and above, give folder labels 248 px of navigation space and 40 px rows; the collapsed folder rail must return to 72 px. In that compact rail, system mailboxes retain semantic icons, custom folders use short monograms with full hover/focus labels, and a deliberate pointer hold or `Alt` plus an arrow reorders entries without altering the expanded native hierarchy. The message list uses 36vw, bounded by 420 and 540 px, with approximately 68 px row targets, faint row dividers, 14 px sender text, and row checkboxes aligned with Select all. Reading uses a 36 px gutter and a 640 px maximum body box. These rules live in `theme-src/comfort-desktop.css` and load after the established theme; phone and medium-width layouts keep their existing geometry. Keep native selection, unread, followed and keyboard states distinct.

## Scene and theme

Robin moves between mail and planning during ordinary desktop work and phone use; preserve the user's current Nextcloud light/dark setting so each app feels like the same workspace.

## Calendar shell

Remove the outer Nextcloud header, margin and rounded frame. Keep Calendar's month grid, event controls, filter and navigation unchanged. Reserve a 44 px native app-grid target immediately before the event filter. On a collapsed sidebar, the native navigation button opens the drawer containing both the grid and filter; no extra global toolbar is necessary.

## Interaction

Mail borders, selection edges and keyboard focus use at most 1 px. Focus uses
a solid primary/foreground blend for contrast, with no second ring around the
composer editor. Sender text uses the muted neutral in both native and global
lists, including selected and checked rows; unread emphasis belongs to the subject.

Desktop Mail quick actions float over a faded trailing edge only on hover or
keyboard approach. At rest, sender, subject and metadata use that width. Keep
the text and following rows stationary when controls appear. Mobile and touch
layouts retain visible controls.

Use the existing Nextcloud app-menu button, icon and popover by mounting the original app-menu node inside the filter row, within Calendar’s mobile focus trap. Restore it to its header placeholder on exit. Preserve native translations, permissions, focus and keyboard behavior. Keep a visible focus ring and native hover state. Do not add decorative animation.

## Shared native components

Settings and native popups share 14 px fields on desktop, 16 px on narrow screens,
18 px section legends and 20 px task titles; buttons use weight 500. Field/control
radius is 6 px, small actions 4 px, modal surfaces 8 px. Compact/standard/touch
control roles are 32/36/44 px; close targets stay 44 px. A floating surface has
one tokenized elevation and no added border/filter. Search labels stack above
full-width controls below 800 px. Native account tables wrap within their panel.
Accent ink is distinct from primary fill; danger/success/warning/info have
separate ink and tint roles. Keep all visible component borders and focus at 1 px.
