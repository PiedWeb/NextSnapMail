# Unread drafts in the account Feed

Since 1.7.0, Pied Web displays **Unread drafts / Brouillons non lus** at the top of the
first working-mail page, inside the same scrolling feed. Since 1.9.0 this is the dedicated
account Feed; the restored native Inbox does not show Draft reminders. It uses the current account's configured
Drafts folder and the actual IMAP `UNSEEN` state, excluding deleted messages. A `\Draft`
flag is not required. Read drafts stay in the ordinary Drafts folder.

The first three reminders show recipients, subject, date and a Draft badge. **Show more**
reveals the fetched page, then loads further pages of ten. The section disappears when no
unread drafts remain. It is hidden while searching, viewing another folder, opening a
conversation or browsing later Inbox pages. Search and Inbox pagination retain their scope.

Since 1.8.5, the optional mixed-order preference also changes this query to ascending date
order. Since 1.9.0 the preference defaults on, so the first page contains the genuinely oldest
unread drafts unless the account disables it. Draft reminders stay
in their separate section rather than entering native Inbox selection.

Clicking a reminder resumes native Draft composition with the original folder/UID,
recipients, attachments, HTML/plain content and reply references. Listing/opening here does
not mark the draft read. Native saving normally writes the draft with the Seen flag; it
then leaves this section. Encrypted drafts should be opened from the ordinary Drafts folder,
where the native decryption lifecycle runs; this shortcut refuses undecoded encrypted content.

The list refreshes after Inbox changes, closing compose, returning to the tab, and once a
minute while visible. Refreshing reloads the first ten matching drafts. Switching accounts
discards stale responses. Network failures expose a Retry action. Subjects and recipients
are always inserted as text, never interpreted as interface HTML.

## If the section is missing

First check the authenticated web bundle includes `pwUnreadDrafts` and the module is
mounted. The 2026-09-12 [OPcache incident](deployments/1.7.2-web-runtime-repair.md) hid
this entire feature despite correct files. Then compare the current account’s real
UNSEEN Drafts search with the normal folder count: saved drafts are normally Seen,
so having drafts does not imply having unread reminders. Never mark all drafts unread
as an implicit repair.

## Why a distinct section

SnappyMail 2.38.2's checkbox, move and delete commands assume that selected UIDs belong to
one folder. Inbox and Drafts can contain identical UIDs. Inserting draft models directly in
the received-message collection could act on the wrong mail. These reminders therefore have
their own native-draft opening buttons, without Inbox checkboxes. Received-mail counts,
selection, search, filtered deletion and thread grouping keep their established behavior.
This is not a combined native folder. The global Feed renders separate account-safe overview
rows and opens a Draft only after switching to its source account.

## Native contracts and tests

`PiedWebUnreadDrafts` is an authenticated POST endpoint. It obtains the folder from server-side
account settings, not the browser, and uses native `MessageListParams` and the native search
parser (`is:unseen`, hidden deleted messages). Pagination is bounded to ten items per request.
No mail mutation is performed. The normal dispatcher provides CSRF protection.

The client obtains the native `MessageCollectionModel` even from an empty Inbox. A full
native `Message` response is revived before `showMessageComposer([5, draft])`; mode 5 is
`ComposeType.Draft` in the tested engine. Explicitly restore `isHtml`, whose default is false
on a newly revived model. Keep this contract under review during upstream upgrades.

`tests/unread-drafts.php`: 19 checks using the actual native search parser and collection,
with mocked IMAP. `tests/browser/test-unread-drafts.js`: 25 cases using actual native message,
email and attachment models with fictional mail. Transport, popup opening and the HTML
rendering helper are simulated; native HTML sanitization and the full live compose lifecycle
are not exercised by this fixture. The independent image/editor regression uses native
Squire and serialization. No real mail was sent, deleted or marked read for these checks.
