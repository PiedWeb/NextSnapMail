# Third-party components

| Component | Version/source | License and source record |
| --- | --- | --- |
| NextSnapMail / SnappyMail theme and editor integration | NextSnapMail 0.1.10 / SnappyMail 2.38.2 | AGPL-3.0-only, repository LICENSE; upstream https://github.com/oe79/NextSnapMail |
| Lucide icons | Individual SVGs vendored with source URLs and SHA-256 | ISC and included Feather notices, `plugin/pied-web-ux/lucide-license.txt`, `composer-icons.json`, `lucide-source.json` |
| Adwaita Sans / Inter-derived font subset | Renamed Pied Web UI, Latin and Latin-Extended subsets served from `theme/PiedWeb/snappymail/pied-web-ui-*.woff2`, declared in `theme-src/font-face.css` | SIL OFL 1.1, `theme-src/font-license.txt` and CSS notices; source https://gitlab.gnome.org/GNOME/adwaita-fonts |
| marked | 18.0.12 | MIT, `markdown-licenses.txt` and `markdown-dependencies.json` in the plugin |
| DOMPurify | 3.4.15 | Apache-2.0 or MPL-2.0, both notices included in `markdown-licenses.txt` |
| turndown-plugin-gfm | 1.0.2 | MIT, `markdown-licenses.txt` and `markdown-dependencies.json` |
| browser-image-compression | 2.0.2 | MIT, `image-compression-license.txt` and `image-compression-source.json` |

The runtime uses the native TurndownService provided by SnappyMail. Third-party bundles are committed locally and contain no runtime CDN requirement. Their source records include upstream locations, versions and hashes. Retain the notices when redistributing. The compression settings were adapted from Pushword's admin uploader; no installation-specific Pushword data is included.

The theme builder combines the preserved NextcloudV25+ base stylesheet, font CSS, overrides, studio CSS and folder icons. It reconstructs the deployed theme byte for byte. Edit those source pieces, then rebuild. Font subsetting is not required to build the included theme; changing the font requires a separately prepared licensed font asset.
