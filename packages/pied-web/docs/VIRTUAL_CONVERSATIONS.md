# Native reader, folded history and explicit full exchange

## Current interaction contract

Since 1.10.41, opening an Inbox message automatically discovers its conversation
and displays the newest received or sent message, with earlier messages folded
around the native reader. This works when the native list's useThreads setting
is false: list grouping and conversation reading are separate choices. No
full-exchange click or preference migration is required. Direct readers in
other folders retain individual messages and the explicit full-exchange action.

There is exactly one native actionable message. Its header says **Active message**;
reply, move, delete, attachments and remote-image permissions remain owned by the
native reader. Clicking a folded card opens that message through the native selector.
An independent preview control expands a bounded plain-text continuation without changing
the active message, flags or native commands. It appears only when the one-line excerpt is
actually truncated; short messages no longer repeat the same text under a redundant action.
The triggered card keeps its viewport position while the continuation opens. Other history stays folded.
The immediate predecessor shows its sender, timestamp and excerpt when the conversation
opens, rather than an anonymous 24px strip. Only that predecessor is prefetched; other
missing excerpts load on hover, keyboard focus or explicit preview, at most two at once.
The read-only native `Message` response is converted inside an inert HTML template and
inserted only with `textContent`: preview HTML never executes or loads remote assets.

Cards are keyed by folder/UID within the current account. Refresh keeps their actual DOM,
focus and explicit expansion state. A per-message viewport anchor preserves the active
header or visible history/body element through preview and image layout changes. A manual
scroll replaces the anchor, including same-turn scrolls before a native observable update.
Only a newly selected message receives an initial position; background refresh never hides
and rebuilds the active native body. Native observable updates are coalesced for one task,
without the former extra 160ms delay after loading.

**View full exchange** is available explicitly from an individual message, including a
filed message, without changing the Inbox thread preference or enabling threads in other
folder lists. It keeps the opened filed message active. The `PiedWebConversation` hook
accepts `scope=account` and searches selectable folders in that authenticated account by
exact Message-ID, References and In-Reply-To headers. Configured Drafts, Trash and Junk,
plus Scheduled and Reminders, are excluded unless one is the opened source folder. The
scope is stated beside the results. **Return to single message** restores the individual
reader; **Refresh exchange** is explicit, avoiding periodic account-wide scans.

Account lookups use one IMAP connection, with ceilings of 50 folders, 160 native list
pages, 200 returned rows and a 12-second budget checked between header queries. An IMAP
command already in progress still uses the native transport timeout. Truncation and
inaccessible folders produce visible partial-result status, not a false completeness claim.
Missing Message-ID headers produce an explicit empty explanation, never a speculative
subject search. Malformed chains whose replies omit the common root from References can
remain incomplete; this is not an archive/migration or an all-mail indexing service.

Since 1.10.40, discovery first reads the source's headers through a UID-scoped
native BODY.PEEK fetch and tests a Message-ID search against that verified UID. Some IMAP
servers answer this valid search with OK and no hits even while FETCH returns
the header. If the probe fails or is rejected, discovery reads unfiltered native
header pages on the same connection and builds an exact-ID graph from Message-ID,
References and In-Reply-To. It follows that graph independently of page order;
subject and participant similarity never join messages. No bodies are loaded
and no flags are changed. There is no new message store or persistent index.

The fallback retains the Inbox source/thread plus configured Sent scope, or the
explicit account's selectable folders and existing exclusions. Account fallback
visits Sent first. An unset Sent setting resolves through the server's native
SPECIAL-USE Sent role, like the native UI; explicit disabled-Sent settings stay
disabled. Drafts/Junk settings use the current native names, and their special-use
roles (plus Trash) also enforce account exclusions. The source/probe plus fallback consume at most 160 search/fetch
operations, with at most 50 headers per fetch and a 12-second budget checked between commands; at most 200
connected messages are returned. Exhausted folders produce complete results;
inaccessible folders and page/time/row ceilings produce the existing partial
exchange status. A complete Inbox fallback retains STATUS/etag refreshes; a
partial one cannot be cached as an unchanged complete exchange.

Verification: `tests/conversation.php` covers authenticated read-only discovery, exclusions,
exact matching, failures and budgets. `tests/browser/test-virtual-conversation.js` uses
fictional native models to cover single action ownership, previews, focus, scroll, native
thread scoping, mobile fit, error/retry and stale account responses.

The 2026-09-19 foreground stress fixture (`tests/browser/test-conversation-performance.js`)
uses 200 fictional messages and a fixed 20ms mocked lookup. Six alternating runs measured
median readiness at 211.6ms with the previous additional 160ms scheduling delay, versus
58.8ms with one-task coalescing. Readiness is timestamped by a page-local MutationObserver,
not by the automation round trip; every sampled page was visible. All runs used one lookup,
no extra body fetch and kept the 199 existing card nodes unchanged on a later refresh.
This measures the reader scheduling change, not production IMAP latency or a whole-app speedup.

## Existing Inbox discovery

SnappyMail 2.38.2 groups IMAP threads within one folder. A reply kept in Sent is
therefore absent from the Inbox thread even if its `References` or
`In-Reply-To` header points to a received message. The 1.7.10 extension put a
read-only Sent list in the message **list** and required the native thread to
be selected. It did not appear when a normal Inbox row was opened. Version
1.7.20 attaches to `MailMessageView`, including when that view's DOM is built
before the plugin script runs.

With Pied Web, opening an Inbox message gathers
all messages in its native folder thread and searches the account's configured
Sent folder for replies. The folder thread uses SnappyMail's native read-only
`MessageList` query. Sent discovery searches `References` and `In-Reply-To`
headers, checks exact Message-ID tokens, follows reply chains, deduplicates
folder/UID pairs, and sorts the combined set by date. Each search is limited to
200 results, and following a Sent chain stops after 20 IDs.

Since 1.8.4, native list grouping is an Inbox-only preference. Its control is shown in
`INBOX`; every list and reader request for Trash, Sent, Drafts, Archive and custom
folders is forced back to individual messages, even when the saved Inbox
preference is enabled. This prevents automatic cross-folder discovery outside the Inbox.
The explicit account lookup above is a reader action, not an exception to list scoping.

The newest message, received or sent, opens in SnappyMail's **native reader**.
Earlier messages appear as folded cards above it; clicking one opens that
message natively and places the remaining cards around it. A button returns
to the newest message. Native body, attachment, image, reply, flag and other
message actions therefore belong to whichever message is open. The current
folder's message list is not copied or altered. Searches are retried after a
failure, and a 60-second refresh can pick up a new reply while the reader stays
open. Account changes discard stale searches.

Version 1.7.21 holds the native expanded message out of view while a newly
opened conversation is being assembled. The reader and folded cards appear
together after native loading, avoiding a visible jump when Sent results arrive.
The native Close control is beside the previous/next arrows on desktop; mobile
uses its existing header Back control. Folded cards have one border.
Version 1.7.22 uses the earliest message's subject as the conversation heading.
The open message still shows its own subject at the size of its sender line.
Since 1.7.23, folded cards show the beginning of their body as plain text,
truncated to one visual line. The excerpt uses the already loaded plain part
when available; otherwise, requested cards fetch the native `Message` response
through `BODY.PEEK`, at most two at a time. HTML is parsed inertly and inserted
only with `textContent`. The short excerpt cache is cleared on account changes.
An unavailable preview is explained without hiding the sender, recipient or date.

No mailbox write, migration, copy or separate message store is involved.
The lookup needs a configured Sent folder and matching Message-ID headers.
Automatic Inbox discovery searches the configured Sent folder only, not additional Sent
folders per identity or other received folders; use the explicit account lookup for those.
The native conversation count remains folder-scoped.
Existing duplicate copies made by 1.7.8–1.7.9 remain untouched.
