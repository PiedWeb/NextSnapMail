# Nextcloud 34.0.4 update and customization verification

Completed 2026-09-12 on nc.robin-d.fr. Nextcloud 34.0.3 → 34.0.4 (34.0.4.1).
`occ status`: installed, maintenance false, needsDbUpgrade false. Core integrity check
passed. The requested RewriteOptions/HSTS block is present, and HTTP responses include
`Strict-Transport-Security: max-age=15552000; includeSubDomains`.

## Update and recovery

Executed the user-authorized updater with `--no-backup`, then native `occ upgrade`
and maintenance off. Restored the requested .htaccess directives without duplicating
the same block. Restarted only `robindfr`'s lsphp processes using the explicitly
authorized command, then warmed the site.
A second identical restart activated the restored account-counter PHP after repair.

Before updating, 1,915 files covering NextSnapMail code, our Mail plugin/configuration,
theme and both workspace add-ons were backed up separately, outside the web root:

`/home/robindfr/nextcloud-customizations-before-34.0.4-20260912T212614Z/`

Archive: `customizations.tar.gz`, SHA-256
`73265b08a66a23a146bd4e89af4b086a6a864ec75dca4cb74a639e2642dfd95f`.
This is a customization backup, not a database or complete Nextcloud rollback.
It contains private configuration and must remain on the server, not on GitHub.

The native upgrade also updated apps from the App Store, including NextSnapMail
0.1.10 → 0.1.11, Contacts 8.8.1, Forms 5.3.6, Polls 9.2.1 and Registration 3.1.0.
The bundled PDF viewer was migrated to 7.0.0. Calendar remains 6.5.4 and the Euro Office
connector remains 11.0.4.

## Repaired update overwrite

The five embedded SnappyMail files for linked-account unread counts were overwritten.
PR oe79/NextSnapMail#41 is still open/unmerged. Inspected official v0.1.11 release notes
and created an isolated pristine tag checkout at commit `aef1e4e`. Its targeted source
files are unchanged from the patch base; all five installed file SHA-256 hashes matched
the official tag before modification. The patch applied cleanly; eight JS tests and
the PHP main/additional-account routing test passed. All five resulting hashes exactly
match the original reviewed patch payload in release.json.

Saved the new pristine files as `nextsnapmail-0.1.11-before-unread-restore.tar.gz` in the
backup directory. Restored only the five reviewed files. Kept all other 0.1.11 changes,
including OAuth and plugin-management additions. No old app bundle was copied wholesale.
Actual web-served app JS now contains `unreadLastChecked` and `unreadRequestPending`.

Nextcloud core integrity is clean. NextSnapMail app integrity reports the expected
INVALID_HASH entries for exactly these five locally patched files. Integrity checking
was not disabled or bypassed; upstream acceptance of the patch remains the durable fix.

## File and runtime checks

| Component | Result |
| --- | --- |
| Mail 1.7.3 | 39 installation checks passed, including 34 payload files, activation and unread patch |
| Calendar workspace 1.0.1 | All six installed files match their manifest |
| Office workspace 1.0.3 | All six installed files match their manifest |
| Mail web runtime | Theme marker 1.7.3, bundle `f7ecb25b5bb47779cec5b9b7850e5cb7` |
| Calendar web runtime | 1.0.1, verified after fresh navigation on Nextcloud 34.0.4 |
| Office web runtime | 1.0.3, verified in nested/direct editors and Office overview |

The compatibility matrix in release.json now records 34.0.4 / 0.1.11 / SnappyMail 2.38.2.
Runtime customization versions and payload fingerprints are unchanged. Published Mail
v1.7.3 and Calendar calendar-v1.0.1 tags/archives are retained without replacement.

## Actual browser verification

- Mail desktop and 390 px mobile: no surrounding Nextcloud frame, centered checkboxes,
  visible stars, mobile identity, Conversations control, library settings icon and Contacts link.
- Contacts clicked from Mail opened the actual Nextcloud Contacts app.
- Compose opened with no entered recipients or text. Markdown and Source switched correctly;
  the original editor toolbar and inline image controls initialized. The background-send
  wrapper initialized its native draft queue when the composer was created.
- Image button opened the native Nextcloud Files popup and loaded its tree. Cancelled
  without importing a file. The empty test composition was closed through native UI.
- Read-only unread-draft endpoint returned success and zero unread drafts. A missing draft
  feed in this account is therefore expected for the observed state.
- Calendar: all 14 desktop/390/320 px checks passed again after the update, including native
  app menu Enter/Escape, focus restoration, responsive month grid and opaque mobile drawer.
- Euro Office: all ten nested editor checks passed, including full viewport desktop/mobile,
  hidden Nextcloud launcher and native Close file restoring normal Files chrome.
- Direct Euro Office: 1.0.3, editor x=0/y=0 fills 1832×996, header hidden, native document UI visible.
  This direct connector exposes its native “Open file location” control; the close-button label
  used by the nested-editor test does not apply to that view.
- Office overview: all four collapsed-navigation/mobile/dark checks passed.

Office tests used only a disposable blank document, ID 844140. It was removed afterward
with an exact file-ID check and If-Match guard (HTTP 204). No user document was edited.
Private mail/event screenshots stay in local `.cache/`; JSON evidence is in the adjacent
`nextcloud-34.0.4/` directory. Native transition timing and lazy editor creation were
accounted for before asserting states.

## Simulated behavior checks

161 browser fixture checks passed: shell/selection 18, inline images 22, image edge cases
11, editor toolbar 23, Markdown 25, Nextcloud images 17, unread drafts 25, list metadata
15 and theme-only metadata fallback 5. Native SnappyMail 2.38.2 models/editor and fictional
content were used. Network/send/upload are mocked where relevant.

54 PHP checks passed for filtered multi-page selection (25), attachment image access (10)
and actual-unread draft selection (19), with mocked IMAP and temporary image storage.
Five installation-diagnostic unit tests also passed. Payload syntax and reproducible
theme build passed for all 34 Mail runtime files.

No actual SMTP send, newsletter unsubscribe, or deletion of user mail was used as a test.
The floating undo UI, destructive actions and image transformations are covered by preserved
source/runtime checks and the available simulated tests, not a live delivery/deletion trial.
No physical phone was tested. This verifies the documented surfaces and cases, rather than
claiming exhaustive coverage of every possible app workflow or provider configuration.

## Recovery sources

Mail source: this repository, v1.7.3 runtime. Calendar: integrations/calendar, calendar-v1.0.1.
Office canonical source: `~/localhost/Nextcloud/eurooffice-pied-web`, v1.0.3; its installable archive
is also attached to this verification release for centralized recovery.
Office archive SHA-256: `22bcc63cdb5176a609bdd395a9509210a824991b1eb3ec8d0d66a02111026111`.
An Office source snapshot (source, docs and tests, excluding screenshots) is also attached:
`eurooffice-pied-web-source-1.0.3-verified-34.0.4.tar.gz`, SHA-256
`6c20cd8b238a0262eee8ee3e9f56066b0eee403f69a00d0e2770c18d3d490097`.

Disable a workspace independently with `occ app:disable piedwebcalendar` or
`occ app:disable piedweboffice`. Do not roll back the entire Nextcloud tree/database
from the customization archive. A future NextSnapMail update must recheck PR #41 and
the new upstream hashes before restoring or adapting the embedded account-count patch.
