# Working on Pied Web for NextSnapMail

This repository is the source of truth for the customizations. The owner explicitly
asks that every change remain recoverable after an upstream update.

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

Try `dev-browser --connect` once. If it fails, try standalone `dev-browser` once.
If both fail, say so and stop browser work; do not keep diagnosing connection errors.

## Local layout

Canonical source: `~/localhost/nextsnapmail-pied-web`.
Upstream source for native fixtures: `~/localhost/NextSnapMail`.
Historical design report: `~/localhost/nextsnapmail/report.html`.
The former `.local-work` directory contains historical private artifacts, not the current source.
