# Conversation counts and stars

Pied Web 1.7.1 replaces the dense native `13/4 ›` badge with a quiet total and an explicit
French/English unread label: **13 · 4 non lus**. The accessible label and tooltip explain
both values. SnappyMail still owns the underlying text and `data-unseen` binding, so counts
update with native read/unread actions and disappear in expanded conversations as before.

Stars remain visible at rest. An outlined star means the message is not followed; a filled
accent star means it is followed, or the conversation contains a followed message (native
behavior). The tooltip distinguishes the latter case. Split-view/mobile stars align on the
right, with a 44 px target on phones. Up to 360 px, metadata moves below the subject to leave
the sender readable. The reader star uses the same higher-contrast color and a 20 px glyph.

Controls keep their existing DOM nodes and the native delegated click commands. The plugin
adds button roles, labels and Enter/Space activation through `.click()`, preserving native
selected-message behavior. Existing attributes are restored when leaving the theme. No IMAP
endpoint, flag mutation logic, thread calculation or message selection algorithm is replaced.

The browser harness extracts the actual list click dispatcher from the tested SnappyMail
source, with mocked flag updates and conversation navigation. It exercises pointer/keyboard,
selection, count updates, hidden state, French/English, leaving the theme and responsive
geometry. It does not use an authenticated mailbox or send a real flag update.
