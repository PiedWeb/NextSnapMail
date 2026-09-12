# Calendar workspace 1.0.1, 2026-09-12

Deployed and verified in authenticated Chrome at nc.robin-d.fr on Nextcloud 34.0.3,
Calendar 6.5.4. New independent add-on: `piedwebcalendar`, version 1.0.1.
Source and six payload hashes: `integrations/calendar/`, `integrations/calendar/release.json`.
Installed path: `/home/robindfr/nextcloud/apps/piedwebcalendar`.
Recovery archive outside web root: `/home/robindfr/piedwebcalendar-1.0.1.tar.gz`.
SHA-256: `c67e4f53840e89b33ff340d0011abd77989f23667975edc464c8840c64f6f55d`.
Independent GitHub tag: `calendar-v1.0.1`. Mail's runtime and v1.7.3 tag are unchanged.

The initial 1.0.0 installation did not replace existing files. Its six installed file
contents matched the original archive before 1.0.1 installation. The initial archive
remains at `/home/robindfr/piedwebcalendar-1.0.0.tar.gz`. A tar metadata comparison first
stopped on local/server owner differences; byte comparison then passed before upgrade.
Only the native `piedwebcalendar` app upgrade ran. PHP was new at first installation
and unchanged for 1.0.1; no shared OPcache reset was needed for this deployment.

## Verified result

Authenticated web runtime reported `PiedWebCalendarWorkspace.version === '1.0.1'`.
The desktop content is x=0, y=0, 1440×900, with zero-height surrounding header.
The original app grid is x=8, y=8, 44×44 px; the filter starts at x=58 and shares
its vertical center. Native menu retains its 14 links in this Calendar session.

All 14 automated live checks passed in `integrations/calendar/tests/browser-checks-1.0.1.json`:
served version, desktop/390/320 px full viewport, responsive grid width, collapsed
navigation, opaque mobile drawer, native menu Enter/Escape and restored focus.
Additional actual browser checks passed:

- Pointer click on the app grid, then Files: navigation succeeded, Files restored its
  50 px header and loaded no Calendar workspace script or stylesheet.
- Browser Back: Calendar returned with exactly one app menu inside the filter row.
- Dark media: native foreground and launcher both rgb(235,235,235), opaque drawer
  rgb(23,23,23). Light preference restored after the check.
- Final desktop/mobile screenshots reviewed; private event screenshots remain local
  in `.cache/calendar-screenshots/`. Only an empty filter/grid crop is versioned.

The 1.0.0 trial used fixed positioning, which put the launcher outside Calendar's
mobile focus trap. The final version places the existing app-menu instance inside
the drawer and restores its original header placeholder on exit. Tests wait for
native transitions before measuring. No event was opened, edited, created or deleted,
and no account preferences were changed. No physical phone was tested.

## Rollback

From `/home/robindfr/nextcloud`: `php occ app:disable piedwebcalendar`, then reload
Calendar. Re-enable with `php occ app:enable piedwebcalendar`. No other app/data changes
are required. Restore missing files from the recovery archive after compatibility and
current-hash checks. Future upstream DOM/focus contracts require revalidation; changed
PHP requires actual web activation as described in MAINTENANCE.md.
