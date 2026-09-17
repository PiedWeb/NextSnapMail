# Squire 2.4 trial

Since 1.8.6, **Settings → General** shows two visual editors when the Pied Web UX plugin
is active:

- **Squire** — the SnappyMail 2.38.2 fork, still the default;
- **Squire 2.4 (test)** — upstream `squire-rte` 2.4.9.

The native `editorWysiwyg` setting stores the choice per account. A change applies to the
next composer opened. There is deliberately no composer shortcut or live migration: moving
the current HTML, selection and undo stack between engines would make the test less reliable.

## Integration boundary

`squire-next-capture.js` saves the native constructor, the exact vendored upstream bundle
loads, then `squire-next.js` captures the new constructor and restores `window.Squire`.
Registration uses SnappyMail's public `rl.registerWYSIWYG` API. Only while `SquireUI` creates
the selected test editor is the upstream constructor exposed as `window.Squire`; a `finally`
block restores the native constructor immediately.

The adapter supplies the three methods SnappyMail's current UI adds to its fork:
selection ancestry, indentation dispatch and its generic style command. Style requests map
to upstream's public font, size, text-color, highlight and clear-formatting methods. Sending,
draft saving, source mode, Markdown, signatures, images and sanitisation continue through the
existing SnappyMail/Pied Web layers.

The vendor source, package hash and built-file hash are recorded in
`plugin/pied-web-ux/squire-source.json`; its MIT notice is retained in
`plugin/pied-web-ux/squire-license.txt`. There is no runtime CDN request.

## Validation and rollback

With the fixture server running, execute:

```sh
dev-browser-agent --timeout 90 < tests/browser/test-squire-next.js
```

The script proves that loading the bundle leaves native Squire as the default, then selects
2.4 through the same stored-name contract as production. It checks `Ctrl+I`, partial and
multi-paragraph blockquotes, style compatibility and a representative HTML round trip with
nested quotes, a table, a signature, a link and a CID image. Fixtures contain fictional data
and do not connect to a mailbox.

User rollback is immediate: select **Squire** in General settings and open a new composer.
Package rollback removes the three `squire-next*.js` registrations and the vendor/source/
license files together, then restores the previous plugin manifest and version.
