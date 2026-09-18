# Installation

Target: an existing NextSnapMail installation using embedded SnappyMail 2.38.2. Obtain this repository or its payload archive outside the Nextcloud web root. Use the filesystem owner of the Nextcloud installation for file operations.

## Locations

| Repository | Installation |
| --- | --- |
| `plugin/pied-web-ux/` | `DATA/appdata_nextsnapmail/_data_/_default_/plugins/pied-web-ux/` |
| `theme/PiedWeb/snappymail/` | `NEXTCLOUD/themes/PiedWeb/snappymail/` |

`DATA` means the configured Nextcloud data directory; it may be outside `NEXTCLOUD/data`. For nondefault SnappyMail configuration domains, adapt `_default_` to the selected instance. This release's check tool supports the default instance.

1. Back up any existing `pied-web-ux` plugin and `PiedWeb` theme, plus the relevant configuration, outside the web root. Keep normal Nextcloud backups separately.
2. Copy the two directories shown above, preserving permissions compatible with the web server. Do not put this repository, test fixtures or deployment archives inside the Nextcloud application directory.
3. In SnappyMail's plugin settings, enable `pied-web-ux` alongside `nextcloud`. If configuring via `configs/application.ini`, set `[plugins] enable = On` and append `pied-web-ux` to the existing comma-separated `enabled_list`; preserve all existing plugin names and other settings.
4. Select **Pied Web** (`PiedWeb@nextcloud`) in each user's appearance settings. Existing per-account overrides may also need selecting the theme.
5. Reload the webmail with Ctrl+F5, then check the message list and composer on desktop and mobile.
6. Confirm the interface font is served: `NEXTCLOUD/themes/PiedWeb/snappymail/pied-web-ui-latin.woff2`
   must answer 200 over the web. The stylesheet asks for it at that path because the engine rewrites a
   theme's relative `url()` to the Nextcloud web root. If the file is blocked or missing the interface
   still works and falls back to the system font stack, with no other effect.

The plugin and theme are intended to be installed together. Some composition extensions, such as the Markdown view and pending-operation guards, initialize independently of the theme. To disable every enhancement, disable the plugin as well as switching themes. Finish or cancel pending outgoing messages first.

## Scheduled send and mail reminders

Scheduled send and timed mail reminders use the companion Nextcloud app
`piedwebmailscheduler`. It sends outgoing scheduled messages and returns due reminders to Inbox
unread. Without a recent heartbeat from it, both controls refuse to hide work and say so; every
other feature is unaffected.

```sh
# from integrations/scheduler/, extract piedwebmailscheduler/ into NEXTCLOUD/apps/
php -d apc.enable_cli=1 occ app:enable piedwebmailscheduler
php -d apc.enable_cli=1 occ piedweb:mail:send-scheduled --dry-run --force
```

It serves the mailboxes whose owner has already stored a NextSnapMail password in the app's
personal settings, and only those. Nextcloud's own cron then carries one pass every five
minutes; for minute precision, give the command its own crontab line. Installation, the
interval setting and rollback are in [the app's README](../integrations/scheduler/README.md),
and the behaviour contracts are in [scheduled send](SCHEDULED_SEND.md) and
[mail reminders](REMINDERS.md).

## Verify without modifying the installation

```sh
python3 tools/check-install.py --nextcloud /path/to/nextcloud
```

For external data or a custom apps directory:

```sh
python3 tools/check-install.py \
  --nextcloud /path/to/nextcloud \
  --data-dir /path/to/data \
  --app-dir /path/to/custom_apps/nextsnapmail
```

The check reads versions, payload fingerprints and plugin activation, never account credentials or message content. Exit 0 means every reference check matches; exit 2 flags a changed version/file, disabled plugin or absent optional unread patch. A missing optional patch does not prevent using the rest of the plugin. Review the JSON details. File checks do not replace functional browser validation.

## Existing integrations

- Contacts navigation uses the installed Nextcloud Contacts app.
- Invitation import uses the existing Nextcloud integration's calendar option; enable it in that plugin's settings if needed. This package contains no personal calendar settings.
- Sieve host, port, encryption and authentication are configured for each mail domain using the mail provider's actual settings. This package neither enables a responder nor modifies Sieve scripts.
- The Image toolbar uses the native Nextcloud file picker for compressed inline insertion. JPEG, PNG and WebP attachment cards expose Compress, including Nextcloud imports and restored attachments. See [image usage and limits](IMAGES.md).

## Remove or restore

Disable `piedwebmailscheduler` first if it was installed (`occ app:disable piedwebmailscheduler`);
already scheduled messages and reminders then stay in their visible folders until it runs again
or the author returns them from the Mail interface. Then disable `pied-web-ux` while preserving
the rest of the enabled plugin list, and select a native theme. The plugin/theme directories can
be archived or removed afterwards. Restore a prior version by replacing these two directories
from its backup and reloading; leave current account and domain settings intact.

The core unread-count patch has its own restoration process. This plugin does not apply or revert it automatically.
