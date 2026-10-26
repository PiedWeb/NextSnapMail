<?php

/**
 * Server side of the reader conversation stack.
 *
 * The browser used to drive this scan itself: one HTTP request per IMAP search,
 * each one paying a full Nextcloud bootstrap and a fresh IMAP connect/login
 * (RainLoop\Actions::initMailClientConnection reconnects on every request
 * because PHP keeps no state between them). A long thread reached 31 round
 * trips. The same walk runs here on a single authenticated connection, where
 * each extra search is one IMAP command instead of one HTTP request.
 *
 * Read-only: SEARCH and FETCH of headers through the native message list. No
 * flag change, no move, no delete.
 */
final class PiedWebConversation
{
    /** Message-ids followed through the Sent folder. Was 20 client-side. */
    private const MAX_SENT_SCANS = 20;

    /** Page size and ceiling of the native message list, unchanged. */
    private const PAGE = 50;
    private const MAX_OFFSET = 200;

    /** Rows returned to the reader, guards a runaway thread. */
    private const MAX_ROWS = 200;

    /** Explicit account-wide lookup only, never used by the Inbox refresh. */
    private const MAX_FOLDERS = 50;
    private const MAX_FULL_SEARCHES = 160;

    public static function scan($actions): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            throw new \RuntimeException('POST required');
        }
        $account = $actions->getAccountFromToken();
        if (!$account) {
            throw new \RuntimeException('Login required');
        }

        $folder = (string) $actions->GetActionParam('folder', '');
        $uid = filter_var($actions->GetActionParam('uid', 0), FILTER_VALIDATE_INT);
        $threadUid = filter_var($actions->GetActionParam('threadUid', 0), FILTER_VALIDATE_INT);
        $algorithm = (string) $actions->GetActionParam('threadAlgorithm', '');
        $etag = (string) $actions->GetActionParam('etag', '');
        if ($folder === '' || \strlen($folder) > 1024 || !$uid || $uid < 1) {
            throw new \RuntimeException('scope');
        }
        if ($threadUid === false || $threadUid < 0) {
            throw new \RuntimeException('thread');
        }
        if (\strlen($algorithm) > 64 || \strlen($etag) > 512) {
            throw new \RuntimeException('scope');
        }

        $anchors = [];
        foreach (['messageId', 'inReplyTo', 'references'] as $name) {
            $value = (string) $actions->GetActionParam($name, '');
            if (\strlen($value) > 8192) {
                throw new \RuntimeException('scope');
            }
            foreach (self::ids($value) as $id) {
                $anchors[self::normalize($id)] = $id;
            }
        }

        $account->ImapConnectAndLogin($actions->Plugins(), $actions->ImapClient(), $actions->Config());
        $mail = $actions->MailClient();

        $settings = $actions->SettingsProvider(true)->Load($account);
        $sent = (string) $settings->GetConf('SentFolder', '');
        if ($sent === '__UNUSE__') {
            $sent = '';
        } elseif ($sent === '') {
            // The native UI also recognizes SPECIAL-USE folders before their
            // names have been saved in account-local settings.
            foreach ($mail->Folders('', '*', false) ?? [] as $candidate) {
                if ($candidate->Selectable() && $candidate->Role() === 'sent') {
                    $sent = (string) $candidate->FullName;
                    break;
                }
            }
        }
        $hideDeleted = !empty($settings->GetConf('HideDeleted', 1));

        // Cheap freshness probe: one STATUS per folder. The reader sends back the
        // previous value, so an unchanged mailbox costs no SEARCH and no FETCH.
        $full = $actions->GetActionParam('scope', '') === 'account';
        $current = $full ? '' : self::etag($mail, $folder, $sent);
        if (!$full && $etag !== '' && $etag === $current) {
            return ['etag' => $current, 'unchanged' => true, 'messages' => []];
        }

        $started = \microtime(true);
        $source = $anchors ? self::source($mail, $folder, $uid, $hideDeleted) : null;
        $fallback = $source && self::needsHeaderScan($mail, $source, $hideDeleted);
        if ($full) {
            return self::accountScan($actions, $mail, $settings, $folder, $anchors, $hideDeleted,
                $fallback, $source, $started, $sent);
        }

        $rows = [];

        if ($threadUid > 0) {
            foreach (self::search($mail, $folder, '', $hideDeleted, $threadUid, $algorithm) as $message) {
                if ($message->sFolder === $folder) {
                    $rows[self::key($message)] = $message;
                }
            }
        }

        if ($fallback) {
            $rows[self::key($source)] = $source;
            foreach ($rows as $message) {
                foreach (self::ids($message->sMessageId) as $id) $anchors[self::normalize($id)] = $id;
            }
            $result = self::scanHeaders($mail, $sent !== '' && $sent !== $folder ? [$sent] : [],
                $anchors, $hideDeleted, $rows, $started);
            return ['etag' => $result['partial'] ? '' : $current, 'unchanged' => false] + $result;
        }

        if ($sent !== '' && $sent !== $folder) {
            foreach ($rows as $message) {
                foreach (self::ids($message->sMessageId) as $id) {
                    $anchors[self::normalize($id)] = $id;
                }
            }

            $root = self::root($actions);
            if ($root !== '') {
                $query = \http_build_query(['header' => 'References ' . $root]);
                foreach (self::search($mail, $sent, $query, $hideDeleted) as $message) {
                    if ($message->sFolder !== $sent) {
                        continue;
                    }
                    if (!self::matches($message->References, $root)) {
                        continue;
                    }
                    $rows[self::key($message)] = $message;
                    foreach (self::ids($message->sMessageId) as $id) {
                        $anchors[self::normalize($id)] = $id;
                    }
                }
            }

            $queue = \array_values($anchors);
            $scanned = [];
            while ($queue && \count($scanned) < self::MAX_SENT_SCANS && \count($rows) < self::MAX_ROWS) {
                $id = \array_shift($queue);
                $normalized = self::normalize($id);
                if (isset($scanned[$normalized])) {
                    continue;
                }
                $scanned[$normalized] = true;
                $query = \http_build_query(['header' => 'In-Reply-To ' . $id]);
                foreach (self::search($mail, $sent, $query, $hideDeleted) as $message) {
                    if ($message->sFolder !== $sent) {
                        continue;
                    }
                    if (!self::matches($message->InReplyTo, $id)) {
                        continue;
                    }
                    $key = self::key($message);
                    if (isset($rows[$key])) {
                        continue;
                    }
                    $rows[$key] = $message;
                    foreach (self::ids($message->sMessageId) as $value) {
                        $queue[] = $value;
                    }
                }
            }
        }

        return [
            'etag' => $current,
            'unchanged' => false,
            'messages' => \array_values(\array_slice($rows, 0, self::MAX_ROWS, true)),
        ];
    }

    /**
     * Explicit reader lookup, independent of the native list's thread setting.
     * Only headers are read. Folders with drafts, scheduled mail, reminders,
     * junk or deleted mail are excluded unless they are the opened origin.
     * Limits and inaccessible folders are reported, never silently called complete.
     */
    private static function accountScan($actions, $mail, $settings, string $origin,
        array $anchors, bool $hideDeleted, bool $fallback, $source, float $started, string $sent): array
    {
        $excluded = ['Scheduled', 'Reminders'];
        foreach (['DraftsFolder', 'JunkFolder', 'TrashFolder'] as $setting) {
            $excluded[] = (string) $settings->GetConf($setting, '');
        }
        $folders = [$origin => true];
        $partial = false;
        foreach ($mail->Folders('', '*', false) ?? [] as $folder) {
            $name = (string) $folder->FullName;
            if ($name === '' || !$folder->Selectable() || \in_array($name, $excluded, true)
                || \in_array($folder->Role(), ['drafts', 'junk', 'trash'], true)) continue;
            if (\count($folders) >= self::MAX_FOLDERS && !isset($folders[$name])) { $partial = true; continue; }
            $folders[$name] = true;
        }
        if ($fallback) {
            // Search Sent first so a large source folder cannot exhaust the
            // account budget before the owner's replies have been examined.
            if (isset($folders[$sent])) $folders = [$sent => true] + $folders;
            $result = self::scanHeaders($mail, \array_keys($folders), $anchors, $hideDeleted,
                [self::key($source) => $source], $started);
            $result['partial'] = $result['partial'] || $partial;
            return ['etag' => '', 'unchanged' => false, 'scope' => 'account',
                'searchedFolders' => \count($folders), 'missingMessageId' => false] + $result;
        }
        $rows = [];
        $failed = [];
        $queries = [];
        $remaining = self::MAX_FULL_SEARCHES - 2;
        $root = self::root($actions);
        $query = static function(string $folder, string $header, string $id) use (
            $mail, $hideDeleted, &$rows, &$failed, &$queries, &$remaining, &$partial, $started
        ): void {
            $key = $folder . "\0" . $header . "\0" . self::normalize($id);
            if (isset($queries[$key]) || isset($failed[$folder])) return;
            if ($remaining <= 0 || \count($rows) >= self::MAX_ROWS
                || \microtime(true) - $started > 12) { $partial = true; return; }
            $queries[$key] = true;
            try {
                $hits = self::search($mail, $folder, \http_build_query(['header' => $header . ' ' . $id]),
                    $hideDeleted, 0, '', $remaining, $partial);
                if (\count($hits) >= self::MAX_ROWS) $partial = true;
                foreach ($hits as $message) {
                    $value = $header === 'Message-ID' ? $message->sMessageId
                        : ($header === 'References' ? $message->References : $message->InReplyTo);
                    if ($message->sFolder === $folder && self::matches($value, $id)) {
                        if (\count($rows) >= self::MAX_ROWS) { $partial = true; break; }
                        $rows[self::key($message)] = $message;
                    }
                }
            } catch (\Throwable $exception) {
                $failed[$folder] = true;
                $partial = true;
            }
        };
        if ($root !== '') {
            // Most standards-compliant conversations need only these three
            // header searches per folder, irrespective of conversation length.
            foreach ($folders as $folder => $_) {
                $query($folder, 'References', $root);
                $query($folder, 'Message-ID', $root);
                $query($folder, 'In-Reply-To', $root);
            }
            // Recover parent messages referenced by the origin even if they do
            // not themselves carry References. Do not scan every discovered ID:
            // that used to turn a long thread into dozens of redundant requests.
            $knownIds = [];
            foreach ($rows as $message) {
                foreach (self::ids($message->sMessageId) as $id) $knownIds[self::normalize($id)] = true;
            }
            $missingAnchors = \array_filter($anchors, static fn($id) => !isset($knownIds[self::normalize($id)]));
            if (\count($missingAnchors) > self::MAX_SENT_SCANS) $partial = true;
            foreach (\array_slice($missingAnchors, 0, self::MAX_SENT_SCANS, true) as $id) {
                foreach ($folders as $folder => $_) $query($folder, 'Message-ID', $id);
            }
        }
        return ['etag' => '', 'unchanged' => false, 'messages' => \array_values($rows),
            'scope' => 'account', 'partial' => $partial, 'searchedFolders' => \count($folders),
            'failedFolders' => \count($failed), 'missingMessageId' => $root === ''];
    }

    /** Fetch only display/linking headers for exact UIDs through native BODY.PEEK. */
    private static function headers($imap, string $folder, array $uids): array
    {
        $rows = [];
        foreach ($imap->Fetch(['FLAGS', 'INTERNALDATE',
            'BODY.PEEK[HEADER.FIELDS (MESSAGE-ID REFERENCES IN-REPLY-TO SUBJECT DATE FROM TO)]'],
            \implode(',', $uids), true) as $response) {
            $message = \MailSo\Mail\Message::fromFetchResponse($folder, $response);
            if (\in_array($message->Uid, $uids, true)) $rows[self::key($message)] = $message;
        }
        return $rows;
    }

    private static function source($mail, string $folder, int $uid, bool $hideDeleted)
    {
        $imap = $mail->ImapClient();
        $imap->FolderExamine($folder);
        foreach (self::headers($imap, $folder, [$uid]) as $message) {
            if (!$hideDeleted || !\in_array('\\deleted', $message->aFlagsLowerCase, true)) return $message;
        }
        return null;
    }

    /** Some servers return a successful empty HEADER search for an existing ID. */
    private static function needsHeaderScan($mail, $source, bool $hideDeleted): bool
    {
        $ids = self::ids($source->sMessageId);
        if (!$ids) return false;
        $imap = $mail->ImapClient();
        $criteria = 'UID ' . $source->Uid . ' HEADER Message-ID '
            . \MailSo\Imap\SearchCriterias::escapeSearchString($imap, $ids[0])
            . ($hideDeleted ? ' UNDELETED' : '');
        try {
            return !\in_array($source->Uid, $imap->MessageSearch($criteria, true), true);
        } catch (\Throwable $error) {
            return true;
        }
    }

    /**
     * Bounded fallback for broken HEADER search. Snapshot existing UIDs once per
     * folder, then fetch header-only pages. Exact IDs join chains independently
     * of arrival order, without subject/participant guesses or message bodies.
     */
    private static function scanHeaders($mail, array $folders, array $anchors, bool $hideDeleted,
        array $candidates, float $started): array
    {
        $partial = false;
        $failed = 0;
        $remaining = self::MAX_FULL_SEARCHES - 2;
        $imap = $mail->ImapClient();
        foreach ($folders as $folder) {
            if ($remaining <= 0 || \microtime(true) - $started > 12) { $partial = true; break; }
            --$remaining;
            try {
                $imap->FolderExamine($folder);
                $criteria = \MailSo\Imap\SearchCriterias::fromString($imap, $folder, '', $hideDeleted);
                $uids = $imap->MessageSearch((string) $criteria, true);
                \rsort($uids, SORT_NUMERIC);
                foreach (\array_chunk($uids, self::PAGE) as $page) {
                    if ($remaining <= 0 || \microtime(true) - $started > 12) { $partial = true; break 2; }
                    --$remaining;
                    $candidates += self::headers($imap, $folder, $page);
                }
            } catch (\Throwable $error) {
                ++$failed; $partial = true;
            }
        }
        $byId = [];
        $messageIds = [];
        foreach ($candidates as $key => $message) {
            $ids = self::ids($message->sMessageId . ' ' . $message->References . ' ' . $message->InReplyTo);
            $messageIds[$key] = \array_unique(\array_map([self::class, 'normalize'], $ids));
            foreach ($messageIds[$key] as $id) $byId[$id][$key] = true;
        }
        $queue = \array_values($anchors);
        $seen = $rows = [];
        for ($index = 0; $index < \count($queue); ++$index) {
            $id = self::normalize($queue[$index]);
            if (isset($seen[$id])) continue;
            $seen[$id] = true;
            foreach ($byId[$id] ?? [] as $key => $_) {
                if (isset($rows[$key])) continue;
                if (\count($rows) >= self::MAX_ROWS) { $partial = true; break 2; }
                $rows[$key] = $candidates[$key];
                foreach ($messageIds[$key] as $next) if (!isset($seen[$next])) $queue[] = $next;
            }
        }
        return ['messages' => \array_values($rows), 'partial' => $partial, 'failedFolders' => $failed];
    }

    /**
     * The reader passes the origin headers; the thread root is the first
     * reference, then the first In-Reply-To, then the message's own id.
     */
    private static function root($actions): string
    {
        foreach (['references', 'inReplyTo', 'messageId'] as $name) {
            $found = self::ids((string) $actions->GetActionParam($name, ''));
            if ($found) {
                return $found[0];
            }
        }
        return '';
    }

    private static function etag($mail, string $folder, string $sent): string
    {
        $parts = [$mail->FolderHash($folder)];
        if ($sent !== '' && $sent !== $folder) {
            $parts[] = $mail->FolderHash($sent);
        }
        return \implode('/', $parts);
    }

    /**
     * Native paginated message list, same ceiling as the previous client loop.
     *
     * @return \MailSo\Mail\Message[]
     */
    private static function search($mail, string $folder, string $query, bool $hideDeleted,
        int $threadUid = 0, string $algorithm = '', ?int &$remaining = null, ?bool &$truncated = null): array
    {
        $found = [];
        for ($offset = 0; $offset < self::MAX_OFFSET; $offset += self::PAGE) {
            if ($remaining !== null) {
                if ($remaining <= 0) { $truncated = true; break; }
                --$remaining;
            }
            $params = new \MailSo\Mail\MessageListParams;
            $params->sFolderName = $folder;
            $params->sSearch = $query;
            $params->sSort = 'REVERSE DATE';
            $params->bUseSort = true;
            $params->bHideDeleted = $hideDeleted;
            $params->bUseThreads = $threadUid > 0;
            if ($threadUid > 0) {
                $params->iThreadUid = $threadUid;
                $params->sThreadAlgorithm = $algorithm;
            }
            $params->iOffset = $offset;
            $params->iLimit = self::PAGE;

            $collection = $mail->MessageList($params);
            $page = \iterator_to_array($collection);
            foreach ($page as $message) {
                $found[] = $message;
            }
            if (\count($page) < self::PAGE || $offset + self::PAGE >= (int) $collection->totalEmails) {
                break;
            }
        }
        return $found;
    }

    private static function key($message): string
    {
        return $message->sFolder . "\0" . $message->Uid;
    }

    /** @return string[] */
    private static function ids(string $value): array
    {
        \preg_match_all('/<[^<>\s]{1,255}>/', $value, $matches);
        return $matches[0];
    }

    private static function normalize(string $value): string
    {
        return \mb_strtolower($value);
    }

    private static function matches(?string $haystack, string $needle): bool
    {
        $target = self::normalize($needle);
        foreach (self::ids((string) $haystack) as $id) {
            if (self::normalize($id) === $target) {
                return true;
            }
        }
        return false;
    }
}
