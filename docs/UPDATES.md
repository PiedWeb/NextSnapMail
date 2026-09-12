# Do the improvements survive updates?

Mostly as files, but compatibility is not guaranteed.

| Change | Normal NextSnapMail update | What to verify |
| --- | --- | --- |
| Companion plugin | Stored under `appdata_nextsnapmail`, outside the app package. The inspected 0.1.10 migration refreshes the bundled `nextcloud` plugin, not `pied-web-ux`. | Still enabled; editor events, delegated DOM selectors and PHP APIs still compatible. |
| Pied Web theme | Stored under Nextcloud's custom `themes`, outside the NextSnapMail app. | Theme still selected; responsive layout and Nextcloud variables still correct. |
| Domain/Sieve and user preferences | Stored in NextSnapMail data, not in the replaced application code. | Migration has retained settings; provider connectivity still works. |
| Calendar option | Stored in the Nextcloud plugin configuration. | Option retained and new integration remains compatible. |
| Linked-account unread patch | Five files inside the app are replaced by an app update. | Check whether upstream PR #41 is included. Port/retest if needed. |

Nextcloud's [built-in updater documentation](https://docs.nextcloud.com/server/stable/admin_manual/maintenance/update.html) explicitly preserves data, configuration, nonshipped apps and custom themes. For a [manual upgrade](https://docs.nextcloud.com/server/stable/admin_manual/maintenance/manual_upgrade.html), carry the custom theme into the new installation along with the relevant retained directories.

This assessment is based on NextSnapMail 0.1.10, especially [InstallStep.php](https://github.com/oe79/NextSnapMail/blob/master/lib/Migration/InstallStep.php). It cannot predict future migration behavior. The plugin uses internal APIs and DOM structure; its `REQUIRED` metadata is a minimum version, not an upper compatibility guarantee.

The administrative **Reset NextSnapMail data** action is different from updating. It deletes `appdata_nextsnapmail` and recreates the native defaults. It removes the custom plugin and its activation along with settings. Do not use reset as an upgrade step.

## Upgrade workflow

1. Keep the repository/release and current plugin/theme backup outside the Nextcloud installation. Back up data/configuration separately; Nextcloud's updater does not back up the data directory or database.
2. Finish/cancel pending outgoing messages, then perform the supported Nextcloud/NextSnapMail update.
3. Run `tools/check-install.py`. An untested version must be reviewed, even if all custom files remain present.
4. Verify web PHP activation, not only CLI hashes. On this n0c host, timestamp validation
   in OPcache is disabled. Follow [MAINTENANCE.md](MAINTENANCE.md) for targeted authenticated
   invalidation after changing PHP, including rollback.
5. Check the list, account menu, responsive folders, compose toolbar, Markdown round trip, image paste/resize, attachments and Undo Send. Use a test mailbox for delivery tests.
6. Review the optional core patch separately. Do not blindly overwrite a new application's bundled JS with the old version. Keep integrity verification enabled.

## GitHub's role

The repository preserves the source, exact release hashes, licenses, tests, screenshots and restoration instructions. It makes it possible to rebuild and adapt the enhancements. It does not automatically guarantee compatibility or install updates on a production server. No unattended patch reapplication is configured.
