# Legacy upstream structure

This directory contains the former SnappyMail-oriented repository structure,
including upstream packaging, Docker, build tooling, development sources, and
non-Nextcloud integrations.

NextSnapMail is now maintained as a dedicated Nextcloud app. The active
Nextcloud app source lives in the repository root:

- `appinfo/`
- `app/`
- `css/`
- `img/`
- `js/`
- `l10n/`
- `lib/`
- `templates/`

Files in `legacy-upstream/` are kept for reference and provenance. They are not
part of the active Nextcloud App Store release workflow unless explicitly
copied or ported into the root app structure.

Do not build NextSnapMail App Store releases from this directory.
