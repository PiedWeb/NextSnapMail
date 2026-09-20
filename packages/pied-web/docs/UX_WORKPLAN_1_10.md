# Mail workflow improvements, 1.10

Implementation authorized on 2026-09-19. Reusable responses are explicitly excluded.
Work started 21:24 UTC (23:24 Paris). If still optimizing after seven hours,
start the final iteration at 04:24 UTC and stop no later than 05:00 UTC (07:00 Paris).

## Acceptance checklist

- [x] Account menu includes All accounts; list identifies scope.
- [x] Real server search spans authorized accounts and folders with pagination and partial errors.
- [x] Last view persists durably without overriding explicit links or another tab.
- [x] Global Feed matches native row semantics and restores reader return context.
- [x] Global Feed keyboard navigation and immediate visual focus.
- [x] Context-aware shortcuts preserve editing/menu behavior.
- [x] Header-only accessible tri-state Select all with visible selection count.
- [x] Explicit page/results/accounts/folders/message scope for selection.
- [x] Multi-page selection extends existing snapshots, without unsafe retry.
- [x] Quick Trash and Remind actions target the actual account/message.
- [x] Undo Trash restores correct folder/UID mapping/read state.
- [x] Persisted compact mode, desktop target 50–54 px, touch/zoom preserved.
- [x] Subtle fast modal motion, safe reduced-motion lifecycle.
- [x] Identifiable previous-message preview, explicit expansion, older cards folded.
- [x] Stable conversation scroll/focus through asynchronous updates.
- [x] Explicit complete exchange from filed messages without changing list threading.
- [x] Consistent French/English terminology; private machine flags excluded from labels.

## Verification and release

- [x] Native/PHP and browser regression tests, transport boundaries recorded.
- [x] Baseline and final performance measurements, optimization iterations recorded.
- [x] Production hashes checked, scoped external backup, assets before version files.
- [x] Targeted Web OPcache invalidation and authenticated browser verification.
- [x] Source/release fingerprints/docs committed and recoverable release published.

Synthetic fixtures contain fictional data only. Live benchmarks return timings and
counts, never addresses, subjects, message content, authentication or opaque account IDs.
Production mutation tests must target a clearly identified synthetic test mailbox/folder;
ordinary user messages are not moved, sent, deleted or flagged for testing.

## Performance record

- Live production baseline, read-only global Feed, five loads: 822–842 ms, median 837 ms,
  83 rows and 822 DOM nodes. No address, subject, body or account identifier was recorded.
- Fictional 200-message conversation with 20 ms simulated server latency: median first render
  improved from 211.9 ms to 67.7 ms, one conversation request, zero eager body reads and 199
  keyed folded cards. A separate run measured 212.9 ms to 64.6 ms.
- Mocked 40,000-message/two-account server workload: initial index median 118.36 ms, cached
  page median 22.95 ms and 52.5 MiB peak memory.
- Compact desktop rows measured 54/52/52 px for representative native rows and 52 px for global
  rows, down from 83/93/83 px and 62 px without truncating their text.
- Final production Feed requests measured 847–863 ms median across two five-load read-only
  series (84 rows, no failed account), versus 837 ms for 83 rows at baseline. The final desktop
  action-group iteration reduced list DOM from 1,469 to 975 nodes (−34%); touch layouts retain
  their always-visible quick actions.
