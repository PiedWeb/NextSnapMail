# Keeping every customization recoverable

The canonical working copy is now
`~/localhost/Nextcloud/PiedWeb-NextSnapMail/packages/pied-web`, published from
the `PiedWeb/NextSnapMail` monorepo. The former
`RobinDev/nextsnapmail-pied-web` repository remains a historical remote release
source and an optional reviewed subtree export; its redundant local clone was
removed after the monorepo migration. It was created private and made public
after a repository and release-asset audit. Source, documentation, checks and
releases live together; private runtime configuration lives only on the server.

For every change:

1. Work from the monorepo, inspect the installed release before overwriting anything.
2. Update source and relevant regression coverage. Keep short reasons and limitations in
   the changelog/feature docs, plus durable native contracts in `CONTEXT.md` when needed.
3. Bump the plugin version, update `release.json` version and payload SHA-256 fingerprints.
   Run syntax/reproducible-build checks and behavior checks appropriate to the change.
4. For an authorized deployment, compare all previous payload hashes, back up the plugin
   and theme outside the web root, install assets before the version-bearing `index.php`,
   then compile JS/CSS with the real Nextcloud/SnappyMail runtime. Restore on failure.
5. Record the actual installed version, compatibility matrix, plugin cache hash, backup/
   rollback location and test boundaries under `docs/deployments/`. Keep credentials out.
6. Commit and push the source; tag the release; build a payload archive with `tools/package.py`
   and attach it and its SHA-256 checksum to the GitHub release. Never replace a published tag
   silently. `tools/check-install.py` compares the install against the selected release.

The release archive contains runtime files, source, licenses, instructions and tests. Keep a copy
outside the Nextcloud installation. This makes restoration possible even if an app update
overwrites files or the local development folder is lost. It does not back up mail or account data.

## After an upstream update

Follow `UPDATES.md`. If only custom files disappeared, restore the appropriate release after
checking API compatibility. If internal APIs changed, port the source and retest, then publish
a new release. The optional account unread patch must be checked separately against the new
upstream source; do not apply old generated JS blindly.

The bundled `nextcloud` plugin was compared with the upstream source on 2026-09-12:
there were no content changes apart from line endings. It needs no separate custom patch.
Its native configuration is deliberately excluded from this repository.

## Web PHP validation is mandatory on this host

On 2026-09-12, LiteSpeed OPcache had `validate_timestamps=0` and still executed the
1.6.4 plugin index after the 1.7.2 files were installed. A CLI checksum or compilation
cannot certify web activation. Verify through an authenticated **nc.robin-d.fr** session.
If the web version is stale, use the targeted authenticated maintenance workflow in
[`tools/web-runtime-maintenance/README.md`](../tools/web-runtime-maintenance/README.md).
Invalidate changed PHP for both deployment and rollback, remove the temporary helper,
and confirm fresh AppData/bundle markers and the actual DOM after reload. Never report
“deployed and visible” from SSH-only checks. See the [incident record](deployments/1.7.2-web-runtime-repair.md).
