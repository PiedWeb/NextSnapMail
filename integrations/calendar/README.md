# Pied Web Calendar workspace

Independent Nextcloud app `piedwebcalendar`, version 1.0.1. Removes the surrounding
Nextcloud frame and places its native app grid immediately before Calendar's event
filter. With navigation collapsed, open the native drawer to access both controls.
The desktop and mobile calendar keep the full viewport without another toolbar.

Source lives here in the same recovery repository as Mail. No core/Calendar files,
calendar contents, preferences, or Mail/Office payloads are changed. The listener
loads assets only for authenticated Calendar templates. Public calendars and other
apps retain their normal shell. The original Vue app-menu instance is mounted inside the filter row so the mobile
focus trap includes it. A placeholder restores it on exit; no handlers or app lists are cloned. If expected markup is missing, the
standard Nextcloud header stays available.

Compatibility target: Nextcloud 34.0.4 and Calendar 6.5.4. Recheck selectors, keyboard
navigation and mobile after upstream updates; this is not a promise of compatibility
with future versions.

## Install / restore

Archive contains `piedwebcalendar/`. Extract it into Nextcloud's `apps/` directory,
then run `php occ app:enable piedwebcalendar` from the Nextcloud root. No migrations
or configuration are required. Disable only this add-on for rollback:

```sh
php occ app:disable piedwebcalendar
```

Reload Calendar after installation or rollback. For later updates, compare deployed
hashes first, back up the add-on outside the web root, bump info.xml and the JS runtime
version, and use Nextcloud's native single-app upgrade to refresh asset URLs. Changed
PHP on the n0c host requires actual web OPcache activation, see ../../docs/MAINTENANCE.md.
Never treat a CLI checksum as proof of a loaded web version.

Release fingerprint and deployment evidence are recorded alongside this README.
Private event screenshots are excluded from versioned artifacts.

## Verification

Fourteen live browser checks passed on desktop and 390/320 px, including native app-menu
Enter/Escape and restored focus. Run `dev-browser --connect < integrations/calendar/tests/browser-validation.js`
from the repository root. Read-only deployed hash audit: `python3 integrations/calendar/tools/audit.py`.
See [deployment and rollback](../../docs/deployments/calendar-1.0.1.md).
