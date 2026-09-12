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
```

IMAP transport is mocked. The tests use the actual native IMAP parsing/classes and the plugin endpoint; they do not connect to a mailbox or delete mail.

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
```

The edge-case script continues on the image-check page created by the first script. Clipboard/file inputs are populated with generated image Files; OS dialogs and real mail transport are not tested. Cases cover compression, alpha/animation safeguards, resizing, undo, Markdown, serialization, upload replacement/failure/retry/removal and stale callbacks after changing draft.

This curated harness accompanies the baseline's image/editor validation. It does not claim to cover every legacy customization or substitute for testing the upgraded application in an authenticated test mailbox.
