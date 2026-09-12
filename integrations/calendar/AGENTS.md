# Calendar workspace

This directory is a separate Nextcloud add-on, `piedwebcalendar`. Its version and payload manifest are independent of the mail plugin's release.json. Do not rebuild or redeploy Mail for Calendar-only changes.

Read the root PRODUCT.md, DESIGN.md and this directory's README.md. Load only on authenticated Calendar templates. Do not patch core or Calendar, or change events/settings. Preserve the Calendar-specific relocation of the original menu into the drawer focus trap and restore its placeholder on exit. Do not clone the app list. Keep the native app menu next to the filter. Collapsed navigation exposes it through the native drawer button, without another toolbar.

Verify the real web runtime, desktop/mobile drawer states, native app-menu keyboard access, full-window geometry and an ordinary Files page. Keep private event screenshots out of Git. Bump app version for asset updates, record payload hashes and deployment/rollback, and publish an independent calendar-v* tag/archive to the existing private repository.
