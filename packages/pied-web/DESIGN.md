# Design

## Visual system

Pied Web uses quiet neutral surfaces, teal primary actions and selection, and readable native/system typography. Mail-specific tokens and components remain in theme-src/. Nextcloud integrations inherit the instance's native foreground, background, hover and focus tokens rather than imposing a second palette.

## Mail desktop comfort

At widths of 1200 px and above, give folder labels 248 px of navigation space and 40 px rows; the collapsed folder rail must return to 72 px. In that compact rail, system mailboxes retain semantic icons, custom folders use short monograms with full hover/focus labels, and a deliberate pointer hold or `Alt` plus an arrow reorders entries without altering the expanded native hierarchy. The message list uses 36vw, bounded by 420 and 540 px, with approximately 68 px row targets, faint row dividers, 14 px sender text, and row checkboxes aligned with Select all. Reading uses a 36 px gutter and a 640 px maximum body box. These rules live in `theme-src/comfort-desktop.css` and load after the established theme; phone and medium-width layouts keep their existing geometry. Keep native selection, unread, followed and keyboard states distinct.

## Scene and theme

Robin moves between mail and planning during ordinary desktop work and phone use; preserve the user's current Nextcloud light/dark setting so each app feels like the same workspace.

## Calendar shell

Remove the outer Nextcloud header, margin and rounded frame. Keep Calendar's month grid, event controls, filter and navigation unchanged. Reserve a 44 px native app-grid target immediately before the event filter. On a collapsed sidebar, the native navigation button opens the drawer containing both the grid and filter; no extra global toolbar is necessary.

## Interaction

Use the existing Nextcloud app-menu button, icon and popover by mounting the original app-menu node inside the filter row, within Calendar’s mobile focus trap. Restore it to its header placeholder on exit. Preserve native translations, permissions, focus and keyboard behavior. Keep a visible focus ring and native hover state. Do not add decorative animation.
