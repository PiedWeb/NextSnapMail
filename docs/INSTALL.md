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

The plugin and theme are intended to be installed together. Some composition extensions, such as the Markdown view and pending-operation guards, initialize independently of the theme. To disable every enhancement, disable the plugin as well as switching themes. Finish or cancel pending outgoing messages first.

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

Disable `pied-web-ux` while preserving the rest of the enabled plugin list, then select a native theme. The plugin/theme directories can be archived or removed afterwards. Restore a prior version by replacing these two directories from its backup and reloading; leave current account and domain settings intact.

The core unread-count patch has its own restoration process. This plugin does not apply or revert it automatically.
