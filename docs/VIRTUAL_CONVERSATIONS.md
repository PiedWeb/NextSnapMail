# One reader stack across Inbox and Sent

SnappyMail 2.38.2 groups IMAP threads within one folder. A reply kept in Sent is
therefore absent from the Inbox thread even if its `References` or
`In-Reply-To` header points to a received message. The 1.7.10 extension put a
read-only Sent list in the message **list** and required the native thread to
be selected. It did not appear when a normal Inbox row was opened. Version
1.7.20 attaches to `MailMessageView`, including when that view's DOM is built
before the plugin script runs.

With Pied Web and Conversations mode active, opening a received message gathers
all messages in its native folder thread and searches the account's configured
Sent folder for replies. The folder thread uses SnappyMail's native read-only
`MessageList` query. Sent discovery searches `References` and `In-Reply-To`
headers, checks exact Message-ID tokens, follows reply chains, deduplicates
folder/UID pairs, and sorts the combined set by date. Each search is limited to
200 results, and following a Sent chain stops after 20 IDs.

The newest message, received or sent, opens in SnappyMail's **native reader**.
Earlier messages appear as folded cards above it; clicking one opens that
message natively and places the remaining cards around it. A button returns
to the newest message. Native body, attachment, image, reply, flag and other
message actions therefore belong to whichever message is open. The current
folder's message list is not copied or altered. Searches are retried after a
failure, and a 60-second refresh can pick up a new reply while the reader stays
open. Account changes discard stale searches.

No mailbox write, migration, copy or separate message store is involved.
The lookup needs a configured Sent folder and matching Message-ID headers.
Additional Sent folders configured per identity are not searched unless they
are the account's configured Sent folder. Messages in other received folders
are not included. The native conversation count remains folder-scoped.
Existing duplicate copies made by 1.7.8–1.7.9 remain untouched.
