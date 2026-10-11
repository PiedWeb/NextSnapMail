# Inline replies

Since 1.10.26, the top reader toolbar's **Reply** and **Reply all** are links.
The browser's context menu, middle-click and Ctrl/Cmd+click can open a separate
tab. That tab opens the full native composer; an ordinary click, Enter or Space
continues to use the existing reply command and the inline rules below.

`reply-links.js` binds the destination to the active message and account.
The folder's `fullNameHash` comes from `rl.app.folderList`, including nested
folders and a conversation's Sent source. No message body, subject, recipients
or credential is placed in the link. The suffix `/pw-reply` or `/pw-reply-all`
is stripped before native routing, including the outer iframe `target` URL.
Only the matching account, folder and UID with a loaded body can consume the
intent. Navigation cancels it; reload cannot create another composer. Disabled
commands lose their href and keyboard tab stop. Inline reader locking remains
in place through the original command names in the binding.

Since 1.10.30, the bottom Reply/Reply all/Forward actions and their More-menu
entries share these links. Forward uses `/pw-forward` and the same exact-source
guard. New message, including the mobile header, uses `/pw-compose` on the
account's Inbox route: it opens a blank native composer without reading a source
message. Native controls keep their existing KO click/command bindings and
compose-in-edit state. A capturing handler bypasses those bindings only for
modified clicks, since the native KO handler otherwise cancels navigation.
Space activates once; Enter retains the anchor's normal activation.

Every startup composition also waits for SystemDropDown's native `accounts`
observable to be populated. SnappyMail 2.38.2 starts its screens before
`loadAccountsAndIdentities()`: constructing Compose on the view-ready event
alone can fail because `IdentityUserStore()[0]` is still absent. That response
populates accounts and then identities synchronously; the queued native command
runs after the callback completes. No extra account request or identity copy is
needed. Native KO takes disposal options as its second computed argument.

Since 1.8.7, **Reply** and **Reply all** opened from an active Inbox conversation use
the bottom of `.pw-conversation-active`. New messages, forwards, Draft resumes and replies
outside that reader remain full native popups.

Since 1.10.8, integration also requires a reading pane at least **800 px** wide
and a viewport at least **720 px** high. Otherwise Reply and Reply all keep the
full native popup, including on phones. A roomier reply fills the pane instead
of the former 640 px card and gives the editable message at least **320 px**
below its actual toolbar. Recipient chips, including wrapped Cc, sit above that
writing space. Expanding the formatting tools grows the card as needed.

Resizing the window or dragging the native reader divider below that threshold
promotes the same draft to the popup. A host ResizeObserver and viewport resize
listener share the existing expansion path; neither re-creates the editor nor
issues a mail request.

There is still only one SnappyMail composer. `inline-reply.js` lets its existing `<dialog>`
leave the modal top layer with `show()`, moves that bound node into a conversation slot and
keeps `modalVisible()` true. Native recipients, editor, attachments, autosave, encryption,
background send and scheduled send therefore keep the same view model and commands. A closed
dialog must not be displayed with CSS as an inline substitute: browsers keep its descendants
inert even when they look visible.

The **Expand** control mounts on the ready event: SnappyMail's creation event
precedes its template. It closes the non-modal state and calls `showModal()` on
the same node. Input selection
or the contenteditable range is captured as node/offset pairs before the move and restored
after it; a live `Range` cannot be retained because moving its ancestor can retarget it. While
the composer is inline, duplicate reader Reply/Forward controls are inert. Leaving the theme
or the active conversation promotes the draft to the popup instead of hiding it.

On send, `background-send.js` ignores the open non-modal inline dialog when choosing a host for
the floating Undo notice. Its existing successful-reply event then refreshes the conversation,
opens the new Sent copy and scrolls it into view.

Since 1.8.8, the reader derives its preferred reply from the recipients SnappyMail would use.
When Reply all would address more than one correspondent, its native command moves first and
receives a quiet tint in the top toolbar. The filled action below the message becomes **Reply
all**; for a direct exchange it remains **Reply**. Both forms carry their matching icon and
**Forward** stays secondary. The active account is excluded, so ordinary From/To headers do
not turn every direct message into a group reply.

Validation is fictional and transport-free:

```sh
dev-browser-agent --timeout 45 < tests/browser/test-inline-reply.js
dev-browser-agent --timeout 30 < tests/browser/test-reply-priority.js
dev-browser-agent --timeout 45 < tests/browser/test-reply-links.js
dev-browser-agent --timeout 45 < tests/browser/test-compose-links.js
dev-browser-agent --timeout 75 < tests/browser/test-send-now.js
dev-browser-agent --timeout 60 < tests/browser/test-virtual-conversation.js
```

The first check uses the real native editor, full toolbar and recipient chips.
It covers roomy Reply/Reply all docking, writing height with wrapped Cc and
expanded tools, full-popup Forward, narrow and short viewports, dark mode,
accessible expansion, content/caret preservation, duplicate-action locking,
resize promotion and theme exit.
The priority check covers multi-recipient and direct messages, native command dispatch,
icons, visual hierarchy and 390 px touch targets.
