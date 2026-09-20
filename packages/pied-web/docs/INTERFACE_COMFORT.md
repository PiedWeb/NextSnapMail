# Interface comfort

The shared `compact` Feed setting controls `html.pw-compact`. Its CSS is opt-in
at 800 CSS px and above with a fine pointer. The 52 px minimum is not a fixed
height: enlarged text may grow, while narrow/coarse-pointer layouts retain the
comfortable native geometry and touch targets. Compact subjects use one line,
with native full-subject titles and the reader retaining the complete subject.
No text size, mail content, selection state or IMAP data changes.

Native modal dialogs use opacity plus a six-pixel transform for 150 ms, without
animating layout coordinates. Reduced motion disables both. This requires the
native lifecycle completion fallback in `Knoin/Knoin.js` / bundled `app.js`:
`transitionend` is not guaranteed when animation duration is zero, a dialog is
hidden, or a transition is interrupted. Completion must be once per visibility
generation, with pending animation frames and fallback timers cancelled when
visibility changes. Inline reply keeps its existing separate layout.

`interface-comfort.js` registers two presentation-only `rl.mailUi` hooks before
native boot constructs the models:

- `isInternalKeyword(value)`: the native user-visible keyword predicate hides
  only `$pwsending` and well-formed `$pwremind-<base36>` scheduler flags. Real
  user labels and the actual message/permanent flags remain unchanged.
- `folderLabel(folder, nativeName, draftsFolder)`: localizes the exact reminder
  and scheduled queue siblings of configured Drafts, using the folder's native
  delimiter. Unrelated folders keep their names. The native `localName`
  computed depends on the translation trigger even for these non-system folders.

The bundled Nextcloud plugin has a complete French translation file, matched
to its English key set and retained in the legacy source tree. No text-node
replacement or mutation observer is needed to translate menu commands.

The native `AppUser.mailboxFolders()` contract returns the current account's
resolved Inbox, Trash, Spam, Drafts and Archive names from `FolderUserStore`.
Consumers must call it when acting, not cache a previous account's result.
The native New tag prompt also tolerates cancellation without touching flags.

Verification: `python3 -m unittest discover -s tests -p test_interface_comfort.py`
checks non-mutating hook behavior, false positives, namespaces and
translation parity. Serve fictional fixtures on port 8879 and run
`dev-browser-agent < tests/browser/test-interface-comfort.js` to measure native
and global row geometry, dark/mobile/enlarged text, visible focus, keywords and
actual native popup lifecycle under normal/reduced/rapidly interrupted motion.
The fixture reads the current bundled lifecycle instead of copying it.

On the fictional fixture, comfortable native rows measured 83/93/83 px and
global rows 62 px; compact rows measured 54/52/52 px and 52 px respectively.
The 21 browser assertions cover reduced motion and missing `transitionend`,
not just CSS declarations. Five Python tests also protect source/runtime
lifecycle parity and the current-account folder role contract. These are
fixture measurements, not authenticated production performance claims.
