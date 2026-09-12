# Linked-account unread counts

This fix is already proposed upstream: [oe79/NextSnapMail#41](https://github.com/oe79/NextSnapMail/pull/41), draft and unmerged when this repository was prepared on 2026-09-12.

`account-unread-counts-2.38.2.patch` preserves the complete reviewed diff, including PHP/JS sources, generated gzip/Brotli variants and the tests. Its exact upstream base and patched commits are in `release.json`.

Use it only in a matching **source checkout** and inspect first:

```sh
git apply --check /path/to/account-unread-counts-2.38.2.patch
git apply /path/to/account-unread-counts-2.38.2.patch
node tests/account-unread-counts.mjs
php tests/account-unread-counts.php
```

Changing the five application files can trigger Nextcloud's application integrity check. An app update replaces them. Do not disable integrity checks or apply old minified bundles over a newer version. Check the upstream PR before porting or deploying this optional fix.
