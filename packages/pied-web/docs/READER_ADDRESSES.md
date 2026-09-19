# Addresses in the message header

Every address shown in the header of an open message is a link: the sender line, the
**À**/**Cc** recipients under the date, and the From, To, Cc, Bcc and Reply-To rows of
the expanded details. The line reads exactly as before — `"Name" <address>` — and only
the address itself is linked, as SnappyMail already does for the sender.

- **Click** writes a new message to that address. The display name travels with it, so
  the composer shows `"Name" <address>` as the recipient rather than a bare address.
- **Ctrl+click** (**Cmd+click** on macOS) copies the bare address instead, without
  opening the composer. Keyboard: **Ctrl+Enter** on the focused address.
- **Enter** on the focused address writes a new message, like a click.

A short confirmation naming the copied address appears beside it for 2.4 seconds and is
announced to screen readers. It is drawn over the page, so the recipient rows never grow
or scroll under it. If the browser refuses the Clipboard API, a temporary selection and
the legacy copy command are tried; when both fail, the confirmation says so in the error
colour. The link keeps its `mailto:` address either way, so a browser or assistive
technology that opens links itself still reaches a new message.

The new message is opened by SnappyMail itself: the address is a real `mailto:` link, and
the native reader turns a left click on one into its compose popup. Nothing else is sent,
no address book is queried, and no mail state changes. On a phone, a tap writes a new
message and a long press offers the browser's own “copy address” item, since Ctrl+click
has no touch equivalent.

These links belong to the Pied Web theme. Without it, SnappyMail's own address text is
shown unchanged.
