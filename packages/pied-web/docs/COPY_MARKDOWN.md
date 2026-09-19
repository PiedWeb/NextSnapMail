# Copy a message as Markdown

In the message reader, the copy icon between Delete and More is labelled **Copier en MD**
in French and **Copy as Markdown** in English. It copies only the body of the open message,
not the subject, headers or attachments. Bold text, headings, lists, links, tables and
quotations become Markdown. A collapsed quotation is included in full without its
“Show quote” control text. On success, the button briefly turns into a contrasting
checkmark; on failure, it shows a distinct cross. Both states announce the result to
screen readers and return to the copy icon after 2.4 seconds. Motion is suppressed
when the system requests reduced motion. The button is disabled when no message is open.

Common image-heavy signature tables are flattened to a short contact block: name,
role, organization, phone, email, website and address remain as text or links, while
logos, tiny icons, empty spacing cells and layout markup are omitted. This also applies
inside quoted messages. The detection is deliberately conservative: it looks for a
compact table with contact details and decorative images, and leaves tables with data
headers alone. Unusual signatures may still need manual cleanup.

Conversion runs in the browser from SnappyMail's rendered message body. It uses the
same pinned Turndown/GFM dependencies as the compose Markdown view, with a separate
converter so presentation styles are not copied as raw HTML. The compose converter
still preserves styled signatures and layout when editing a draft. Copying does not
fetch remote images, attachments, or raw message source, and does not change mail state.

The browser Clipboard API is used when available. If it rejects or is unavailable,
the action tries a temporary text selection and the legacy copy command. If both
fail, the button reports that the copy could not be completed.
