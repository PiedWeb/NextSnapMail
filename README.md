# NextSnapMail

NextSnapMail is a SnappyMail fork focused on integration with Nextcloud.

It provides a lightweight webmail interface inside Nextcloud, using the
embedded SnappyMail application for IMAP/SMTP mail access.

This project is now maintained as a dedicated Nextcloud app. The repository root
is the installable app directory that belongs in a Nextcloud `apps/` folder as
`nextsnapmail`.

## About this project

I maintain NextSnapMail primarily for my own private use, because I wanted to
continue using SnappyMail inside Nextcloud after upstream development slowed
down.

Everyone is welcome to use it, but please do so at your own risk. I am happy to
receive bug reports, hints, and practical feedback, and I will try to help where
I can. However, there is no guarantee of support, fixes, compatibility, or
continued maintenance.

## Current development status

Newest changes first:

- Integrated Gmail / Google OAuth2 login directly into the Nextcloud app, so
  Gmail accounts can be connected from the personal settings and as additional
  accounts without requiring a separate plugin.
- Added Nextcloud admin settings for Gmail / Google OAuth2 client configuration,
  including the redirect URI that has to be entered in the Google Cloud Console.
- Added support for a separate NextSnapMail plugin repository and admin-side
  upload of custom plugins, so optional plugins do not have to be bundled with
  every app release.
- Added tools in the NextSnapMail admin settings to import existing SnappyMail
  accounts and app data into NextSnapMail.
- Added controls to remove imported NextSnapMail account entries and old
  SnappyMail data where needed.
- Fixed Squire list handling so numbered lists such as `1. ` do not disappear
  while composing messages.
- Added a confirmed S/MIME signing fix to the shipped SnappyMail frontend files.
- Introduced NextSnapMail as a standalone Nextcloud app id.
- Restored compatibility with newer Nextcloud versions.
- Bundled SnappyMail plugins so installations do not depend on the external
  SnappyMail package server.
- Improved Nextcloud file handling for saving to and uploading from Nextcloud.
- Preserved stored personal login credentials when a mail server is temporarily
  unreachable.

## Installation

Install NextSnapMail from the Nextcloud App Store, or place this app directory
as `nextsnapmail` in your Nextcloud `apps/` directory.

After installation, enable the app in Nextcloud.

## Configuration

NextSnapMail can be configured in two places:

- Nextcloud administration settings: instance-wide NextSnapMail settings
- Nextcloud personal settings: user-specific login credentials for automatic
  login

The embedded NextSnapMail webmail admin panel can be opened from the
NextSnapMail administration settings in Nextcloud.

If you previously used the original SnappyMail Nextcloud app, you can use the
NextSnapMail admin settings to import existing SnappyMail accounts and app data.
The import is intended to copy data into NextSnapMail. It does not automatically
overwrite the old SnappyMail installation.

## Relationship to SnappyMail

NextSnapMail is based on SnappyMail and keeps the focus on Nextcloud
integration. General SnappyMail functionality, concepts, and upstream history
belong to the original SnappyMail project and its contributors.

The previous SnappyMail-oriented repository structure has been moved to
`legacy-upstream/` for reference. It is not part of the active Nextcloud App
Store release workflow.

## Development

The repository root is the installable Nextcloud app. The old upstream-oriented
repository layout is kept in `legacy-upstream/` for reference only.

Nextcloud App Store releases must be built from the repository root app
structure only. Do not build release packages from `legacy-upstream/`.

## License

NextSnapMail is licensed under the GNU Affero General Public License v3.0 only
(`AGPL-3.0-only`).

See [LICENSE](LICENSE).

## Credits

NextSnapMail is based on SnappyMail.

Thanks to:

- SnappyMail contributors
- RainLoop Team
- Pierre-Alain Bandinelli
- Tab Fitts
- Nextgen Networks
- Nathan Kinkade
- everyone who contributed to the previous Nextcloud integration work

NextSnapMail-specific maintenance and Nextcloud-focused development by
Erhard Scharf.
