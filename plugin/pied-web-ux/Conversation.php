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
        }
        $hideDeleted = !empty($settings->GetConf('HideDeleted', 1));

        // Cheap freshness probe: one STATUS per folder. The reader sends back the
        // previous value, so an unchanged mailbox costs no SEARCH and no FETCH.
        $current = self::etag($mail, $folder, $sent);
        if ($etag !== '' && $etag === $current) {
            return ['etag' => $current, 'unchanged' => true, 'messages' => []];
        }

        $rows = [];

        if ($threadUid > 0) {
            foreach (self::search($mail, $folder, '', $hideDeleted, $threadUid, $algorithm) as $message) {
                if ($message->sFolder === $folder) {
                    $rows[self::key($message)] = $message;
                }
            }
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
        int $threadUid = 0, string $algorithm = ''): array
    {
        $found = [];
        for ($offset = 0; $offset < self::MAX_OFFSET; $offset += self::PAGE) {
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
