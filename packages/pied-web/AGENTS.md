# Working on Pied Web for NextSnapMail

This directory is the product package inside the canonical
`PiedWeb/NextSnapMail` monorepo. The owner explicitly asks that every change
remain recoverable after an upstream update. The former standalone repository
is historical and may receive reviewed subtree exports, but it is no longer the
working source of truth. Its redundant local clone was removed after the
monorepo migration.

- Read `docs/CONTEXT.md`, `docs/MAINTENANCE.md` and the current `release.json` before changing behavior.
- Edit `plugin/pied-web-ux/` and `theme-src/` here. Rebuild the theme with `tools/build-theme.py`.
  Do not continue development in the historical `../NextSnapMail/.local-work/` copies.
- Keep changes, rationale, compatibility limits and verification in this repository:
  update `CHANGELOG.md`, feature documentation and the release fingerprint manifest.
  Record each actual deployment and rollback location under `docs/deployments/`.
- Commit the source and publish the authorized release/tag to the existing GitHub remote.
  A release is a recoverable snapshot, not a guarantee of compatibility with later upstream versions.
- Keep credentials, mail content, account settings, original user photos and private browser
  screenshots out of Git and release archives. Browser fixtures must use fictional content.
- Review the native contracts for the tested SnappyMail version. Keep native mail commands,
  authentication, attachment serialization and integrity checks. Do not blindly reapply
  an old bundle to a new engine. The unread patch in `patches/` is separate from the plugin.
- Use the existing verification tools and run behavior checks appropriate to the change.
  Report mocked transport and unauthenticated browser limits accurately. No real email
  send, mailbox deletion or unsubscribe operation is needed for fixture testing.
- For a deployment, compare current installed hashes with the prior release, make an
  external backup, install assets before `index.php`, compile through the actual server
  runtime, and preserve account/Sieve/calendar configuration. Document any mismatch.
- On this n0c host, web OPcache has timestamp validation disabled. CLI compilation does not
  prove web activation. Follow docs/MAINTENANCE.md for targeted authenticated invalidation
  after changed PHP (including rollback), then verify the actual web bundle and DOM.
- Retain French/English labels, keyboard support, visible focus, mobile and dark-mode behavior.

## Dev-browser startup

Use `dev-browser-agent` for browser work so the persistent Chrome profile and
authenticated Nextcloud session are reused. Do not use bare `dev-browser --connect`,
the old `chrome-live` browser name or `dev-browser stop` for routine work. Use
`dev-browser --browser agent-dedicated` only for a test that explicitly requires
an isolated browser. If `dev-browser-agent` fails, try the isolated browser once
only when the task does not need the authenticated profile; otherwise report the
blocker without repeated connection attempts.

## Local layout

Canonical source: `~/localhost/Nextcloud/PiedWeb-NextSnapMail/packages/pied-web`.
Upstream source for native fixtures: `../../apps/nextsnapmail`.
Historical standalone source: remote repository `RobinDev/nextsnapmail-pied-web`;
there is no longer a local working clone.
Historical design report: `~/localhost/Nextcloud/nextsnapmail/report.html`.
The former `.local-work` directory contains historical private artifacts, not the current source.
