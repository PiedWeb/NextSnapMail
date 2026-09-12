# Design

## Visual system

Pied Web uses quiet neutral surfaces, teal primary actions and selection, and readable native/system typography. Mail-specific tokens and components remain in theme-src/. Nextcloud integrations inherit the instance's native foreground, background, hover and focus tokens rather than imposing a second palette.

## Scene and theme

Robin moves between mail and planning during ordinary desktop work and phone use; preserve the user's current Nextcloud light/dark setting so each app feels like the same workspace.

## Calendar shell

Remove the outer Nextcloud header, margin and rounded frame. Keep Calendar's month grid, event controls, filter and navigation unchanged. Reserve a 44 px native app-grid target immediately before the event filter. On a collapsed sidebar, the native navigation button opens the drawer containing both the grid and filter; no extra global toolbar is necessary.

## Interaction

Use the existing Nextcloud app-menu button, icon and popover by mounting the original app-menu node inside the filter row, within Calendar’s mobile focus trap. Restore it to its header placeholder on exit. Preserve native translations, permissions, focus and keyboard behavior. Keep a visible focus ring and native hover state. Do not add decorative animation.
