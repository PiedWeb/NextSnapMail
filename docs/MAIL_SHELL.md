# Mail without the extra Nextcloud wrapper

Since 1.7.3, the Pied Web theme makes the mail surface fill the window. Nextcloud's
logo bar, global search and header utilities are hidden while this theme is active
inside NextSnapMail. The **original native app launcher** remains at the top left,
next to the mail identity, as a 44 px grid button. Its app permissions, links, popover,
keyboard controls and accessibility labels remain owned by Nextcloud. No app list is
copied, and no Vue component is detached from its native DOM parent.

CSS reduces the header's surrounding box and positions the original launcher over a
reserved slot in the mail identity row. This works in the current direct embedding
and a same-origin iframe. Standalone/cross-origin mail and a missing native launcher
leave the surrounding navigation intact. Switching theme, leaving the app or unloading
the frame restores the host styling. No Nextcloud core file is modified.

On phones, one header contains the launcher, folder/account identity, search icon and
compose action. Search expands below the header through the existing search toggle;
it remains the native mail search field, with its bindings and keyboard scope. The
compact desktop sidebar reserves space above Compose. Settings reserve the launcher
slot alongside their back controls.

Message checkboxes are vertically centered in the same full-height row as the star.
Checked rows use a stronger teal surface and a full thin outline; the current opened
message has a lighter surface. Unread weight remains limited to the subject. Native
selection, star and folder-scoped actions are unchanged; no selected class is fabricated
in real mail data. Tests use fictional checked/current rows, while live preview only
checked and unchecked existing boxes without a mail mutation.

## Validation

`tests/browser/test-app-shell.js` covers 18 cases: full viewport, original launcher,
checkbox/star centers, distinct selected states, mobile search, 320 px, dark mode,
theme restoration/reactivation, compact rail, browser-history restoration, missing-launcher fallback and iframe
host restoration. The fixture uses synthetic Nextcloud chrome; native Vue app-menu
opening and its actual 15 links were also verified in the authenticated desktop session.

The 15 existing metadata/native-dispatch cases pass. These simulate transport and
navigation; they do not flag, send or delete real mail. Previews under `previews/1.7.3`
contain fictional mail. Private live before/after images stay outside Git.

Authenticated desktop and 390 px mobile verification was completed on 2026-09-12 after
targeted web OPcache invalidation activated the installed 1.7.3 release. The surrounding
header now has a zero-sized box, the mail fills the viewport, and the original 15-link
app menu opens. See the [deployment record](deployments/1.7.3.md) for measured evidence.
The web OPcache procedure in MAINTENANCE.md still applies to future PHP changes.
