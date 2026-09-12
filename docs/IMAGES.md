# Images in the composer

- **Image in the formatting toolbar:** opens the native Nextcloud file picker. Select images
  and choose **Attach/Joindre**. They are compressed in the browser and inserted into the
  message body, initially displayed at up to 600 px. Nextcloud originals are unchanged.
- **Ctrl/Cmd+V:** clipboard image files and single embedded data-URL images are compressed
  before insertion. Rich HTML containing text keeps the native paste behavior. External image
  URLs in copied HTML are not fetched by the compressor.
- **Drag/drop or Add attachment:** keeps the original as a normal attachment. On JPEG, PNG
  and WebP cards, **Compresser/Compress** reduces the file in one click and shows the gain.
  This also works for Nextcloud imports and restored image attachments whose temporary file
  is still available. A failed read/compression/upload leaves the original intact and allows retry.
- **Click an inline image:** Small, Medium, Original size, alternative text, Remove and the
  resize handle. These controls affect display geometry, separately from compression.

Compression uses the same library/settings as Pushword's multi-upload flow, bundled locally:
`browser-image-compression` 2.0.2, target 1.8 MB, maximum dimension 1980 px, initial quality
0.85. No runtime CDN/worker download. Keep the original if compression fails or produces no
smaller file. Keep GIF and animated PNG/WebP unchanged instead of flattening them.

Nextcloud downloads and reloaded attachment reads are limited to 20 MiB. Incompatible files
show feedback; oversized reloaded attachments have a disabled Compress button with an
explanation. The Nextcloud chooser is shared with native attachment import: use its Attach
action to select actual files. Internal/public share links are not inline image sources.

Authentication uses the existing Nextcloud session/WebDAV request token and SnappyMail's
CSRF-checked JSON dispatcher. Temporary attachment keys are scoped by the native file provider
to the active mail account. SVG, documents, arbitrary filesystem paths and remote URL fetching
are not accepted by the image-read endpoint.

No editing controls are serialized into a draft or sent message. Send/save waits for in-flight
image work; an operation from an earlier draft is discarded. Tests use native editor/picker
code with fictional files and mocked network, plus native account-scoped file storage checks.
