# Validation

Run payload, syntax, reproducible-build and diagnostic tests:

```sh
python3 tools/verify.py
python3 -m unittest discover -s tests -p 'test_*.py'
```

The diagnostic tests simulate a preserved install, changed files, a new version, a disabled plugin and an app update overwriting just the core patch. They verify that inspection leaves files unchanged.

## Native filtered-selection checks

Use a separate source checkout of the NextSnapMail revision recorded in `release.json`, with PHP 8.1+:

```sh
NEXTSNAPMAIL_SOURCE=/path/to/NextSnapMail php tests/filtered-selection.php
NEXTSNAPMAIL_SOURCE=/path/to/NextSnapMail php tests/attachment-image.php
NEXTSNAPMAIL_SOURCE=/path/to/NextSnapMail php tests/unread-drafts.php
NEXTSNAPMAIL_SOURCE=/path/to/NextSnapMail php tests/virtual-conversation-search.php
NEXTSNAPMAIL_SOURCE=/path/to/NextSnapMail php tests/conversation.php
```

IMAP transport is mocked. The tests use the actual native IMAP parsing/classes and the plugin endpoint; they do not connect to a mailbox or delete mail.
The image endpoint checks use the native account-scoped file storage with temporary, fictional images.
They verify login/POST requirements, account isolation, format/size/path rejection and unchanged originals.

## Browser fixtures

```sh
python3 tools/serve-fixtures.py --upstream /path/to/NextSnapMail
```

Open `http://127.0.0.1:8876/.local-work/images-native-preview.html`. The server binds only localhost and exposes curated fixture/plugin/theme paths and the upstream `app/` static files. Never point it at a production installation containing private data.

Fixtures run native Squire, HtmlEditor, ComposeAttachmentModel, Jua callbacks and message serialization. Their extracted methods are from SnappyMail 2.38.2. Transport and addresses are fictitious. If the upstream version changes, regenerate/review the extracted native code and test the new application too; serving newer static libraries alone is not sufficient.

Browser scripts use the dev-browser CLI's persistent `browser` API. Run these in order, using a standalone browser or an established browser connection:

```sh
dev-browser --timeout 60 < tests/browser/test-composer-images.js
dev-browser --timeout 40 < tests/browser/test-image-edge-cases.js
dev-browser --timeout 35 < tests/browser/image-toolbar-regression.js
dev-browser --timeout 35 < tests/browser/image-markdown-regression.js
dev-browser --timeout 30 < tests/browser/test-reader-copy-md.js
dev-browser --timeout 60 < tests/browser/test-virtual-conversation.js
dev-browser --timeout 30 < tests/browser/test-reader-signature-cleanup.js
dev-browser --timeout 60 < tests/browser/test-nextcloud-images.js
dev-browser --timeout 60 < tests/browser/test-unread-drafts.js
dev-browser --timeout 40 < tests/browser/test-list-metadata.js
dev-browser --timeout 25 < tests/browser/test-list-metadata-fallback.js
dev-browser --timeout 45 < tests/browser/test-desktop-scan.js
dev-browser --timeout 45 < tests/browser/test-mail-polish.js
dev-browser --timeout 45 < tests/browser/test-selection-mode.js
dev-browser --timeout 35 < tests/browser/test-conversation-toggle.js
```

The edge-case script continues on the image-check page created by the first script. Clipboard/file inputs are populated with generated image Files; OS dialogs and real mail transport are not tested. Cases cover compression, alpha/animation safeguards, resizing, undo, Markdown, serialization, upload replacement/failure/retry/removal and stale callbacks after changing draft.

The Nextcloud script uses `?nextcloud=1`, which loads the actual bundled WebDAV picker and
attachment command. Popup lifecycle and network are mocked. It verifies authenticated URL
construction, native selection/cancellation, inline compression, Nextcloud/restored attachments,
failure/retry, draft changes, HTML-only image paste and mixed-format selection feedback.

This curated harness accompanies the baseline's image/editor validation. It does not claim to cover every legacy customization or substitute for testing the upgraded application in an authenticated test mailbox.

The unread-draft fixture uses `?drafts=1&mode=list&side=1`, extracting the actual native
MessageCollectionModel, MessageModel, EmailModel and attachment models from the reference
engine. IMAP/network, popup opening and the HTML rendering helper are simulated. Cases cover
actual UNSEEN filtering, folder/UID collisions, native draft metadata, account races,
pagination, search exclusion, empty Inbox, retry, text escaping and mobile geometry.

The metadata script uses the actual native list click dispatcher with mocked flag updates
and conversation navigation. It checks pointer/keyboard actions, existing multi-selection
semantics, unread updates, language/theme restoration and responsive geometry.

The metadata fallback fixture loads the theme with no plugin or pw-theme class, then loads
the metadata script after the DOM exists without a view-model event. It checks base CSS,
followed rows, late binding, live counts and native stylesheet replacement.

`test-conversation-toggle.js` checks the actual bootstrap key, pressed styling and
opposite setting request in desktop/mobile and light/dark fictional list fixtures.

`test-virtual-conversation.js` opens the native reader fixture with fictional
received and Sent messages. It verifies late mounting, the newest message from
either folder opening natively, one-click access to earlier messages, read-only
searches, retry, account isolation, theme exit, narrow layout, one card border,
native Close placement, the earliest-subject heading, open-subject typography,
and conceal/reveal during delayed searches. It does not
use an authenticated mailbox.
