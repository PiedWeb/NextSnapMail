# Inline replies

Since 1.8.7, **Reply** and **Reply all** opened from an active Inbox conversation use
the bottom of `.pw-conversation-active`. New messages, forwards, Draft resumes and replies
outside that reader remain full native popups.

There is still only one SnappyMail composer. `inline-reply.js` lets its existing `<dialog>`
leave the modal top layer with `show()`, moves that bound node into a conversation slot and
keeps `modalVisible()` true. Native recipients, editor, attachments, autosave, encryption,
background send and scheduled send therefore keep the same view model and commands. A closed
dialog must not be displayed with CSS as an inline substitute: browsers keep its descendants
inert even when they look visible.

**Expand** closes the non-modal state and calls `showModal()` on the same node. Input selection
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
dev-browser-agent --timeout 75 < tests/browser/test-send-now.js
dev-browser-agent --timeout 60 < tests/browser/test-virtual-conversation.js
```

The first check covers Reply/Reply all docking, full-popup Forward, accessible expansion,
content/caret preservation, duplicate-action locking, the 390 px layout and theme exit.
The priority check covers multi-recipient and direct messages, native command dispatch,
icons, visual hierarchy and 390 px touch targets.
