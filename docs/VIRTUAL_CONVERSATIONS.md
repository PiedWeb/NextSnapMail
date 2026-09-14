# Sent replies in conversations

SnappyMail 2.38.2 asks IMAP to build a thread in one selected folder. A reply
stored in Sent is therefore absent from an Inbox thread even though its
`References` or `In-Reply-To` header points to an Inbox message. Pied Web 1.7.10
adds a read-only Sent section below the native messages of an opened thread.
The section searches the current account's configured Sent folder for the root
message ID, retrieves up to 200 matches per header query, checks exact ID
tokens, removes duplicate UIDs and hides any message ID already present in the
native thread. Results are sorted by date. There is no background mailbox
scan, migration or second stored copy.

Selecting a virtual row constructs the native SnappyMail MessageModel with its
actual Sent folder and UID, then calls the reader's native selection callback.
The reader fetches the body and uses its regular reply, flag, move and delete
commands. Virtual rows themselves have no checkbox, drag action or bulk
selection; native list operations stay scoped to the current folder. Queries
are discarded when the account or thread changes, and failures show Retry.
French and English labels, focus styling, dark colors and narrow layouts are
provided by the theme. The section disappears when leaving Pied Web.

The lookup needs a configured Sent folder and a Message-ID on the visible
thread root. It also depends on replies carrying a matching `References` or
`In-Reply-To` header. Custom per-identity Sent folders are not searched unless
they are the configured account Sent folder. A thread with more than 200 matches
per header query is truncated. SnappyMail's native conversation badge still
counts only the original folder; the virtual section does not alter IMAP counts.

Versions 1.7.8 and 1.7.9 appended a second copy of new replies to the original
folder. Version 1.7.10 removes that send hook. Existing copies are not deleted;
the virtual section filters them by Message-ID to avoid displaying the same
reply twice in the open conversation.
