<?php

final class PiedWebUnreadOrder
{
    public const SETTING = 'PiedWebUnreadOldestFirst';
    public const BEHAVIOR_SETTING = 'PiedWebUnreadOrderReadBehavior';

    /**
     * Add every unread Inbox row to the native first-page response.
     *
     * This hook runs after the ordinary MessageList call, so MailClient reuses the
     * authenticated IMAP connection and (when enabled) its UID/thread caches. The
     * browser merges these native message objects before SnappyMail revives them.
     */
    public static function augmentMessageList($actions, array &$response): void
    {
        $result = $response['Result'] ?? null;
        $folder = \is_array($result) ? ($result['folder'] ?? null) : null;
        if (!\is_array($result) || !\is_array($folder)
            || \strcasecmp((string) ($folder['name'] ?? ''), 'INBOX') !== 0
            || (string) $actions->GetActionParam('PiedWebFeed', '') !== '1'
            || (int) ($result['offset'] ?? -1) !== 0
            || \trim((string) ($result['search'] ?? '')) !== ''
            || (int) ($result['threadUid'] ?? 0) !== 0
        ) {
            return;
        }

        $account = $actions->getAccountFromToken();
        if (!$account) {
            return;
        }
        $settings = $actions->SettingsProvider(true)->Load($account);
        if (!$settings || !(bool) $settings->GetConf(self::SETTING, true)) {
            return;
        }

        $unread = \max(0, (int) ($folder['unreadEmails'] ?? 0));
        if (!$unread || self::unreadCoverage($result['@Collection'] ?? []) >= $unread) {
            return;
        }

        $params = new \MailSo\Mail\MessageListParams;
        $params->sFolderName = (string) $folder['name'];
        $params->sSearch = 'is:unseen';
        // The browser applies the requested oldest-first order. Reusing the native
        // sort here lets MailClient reuse the UID cache populated moments earlier.
        $params->sSort = (string) ($result['sort'] ?? 'REVERSE DATE');
        $params->bHideDeleted = (bool) $settings->GetConf('HideDeleted', 1);
        $params->bUseThreads = null !== ($result['totalThreads'] ?? null);
        $params->sThreadAlgorithm = (string) $actions->GetActionParam(
            'threadAlgorithm', (string) $settings->GetConf('threadAlgorithm', '')
        );
        $params->iOffset = 0;
        $params->iLimit = \min(999, \max(10, $unread));

        if (\method_exists($actions, 'Cacher')
            && $actions->Config()->Get('cache', 'enable', true)
            && $actions->Config()->Get('cache', 'server_uids', false)
        ) {
            $params->oCacher = $actions->Cacher($account);
        }

        $mail = $actions->MailClient();
        $collection = $mail->MessageList($params);
        $total = \max(0, (int) ($collection->totalEmails ?? 0));

        // MailClient accepts at most 999 rows per call. Very large unread sets stay
        // complete, but each additional page still reuses this request's IMAP login.
        for ($offset = $params->iLimit; $offset < $total; $offset += $params->iLimit) {
            $params->iOffset = $offset;
            $page = $mail->MessageList($params);
            foreach ($page as $message) {
                $collection->append($message);
            }
        }
        $collection->Offset = 0;
        $collection->Limit = \count($collection);
        $response['PiedWebUnreadOrder'] = $collection;
    }

    private static function unreadCoverage($messages): int
    {
        if (!\is_array($messages)) {
            return 0;
        }
        $uids = [];
        foreach ($messages as $message) {
            if (!\is_array($message)) {
                continue;
            }
            $uid = (int) ($message['uid'] ?? 0);
            $flags = \array_map('strtolower', \is_array($message['flags'] ?? null) ? $message['flags'] : []);
            if ($uid > 0 && !\in_array('\\seen', $flags, true)) {
                $uids[$uid] = true;
            }
            foreach (\is_array($message['threadUnseen'] ?? null) ? $message['threadUnseen'] : [] as $threadUid) {
                if ((int) $threadUid > 0) {
                    $uids[(int) $threadUid] = true;
                }
            }
        }
        return \count($uids);
    }

    public static function handle($actions): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            throw new \RuntimeException('POST required');
        }
        $account = $actions->getAccountFromToken();
        if (!$account) {
            throw new \RuntimeException('Login required');
        }
        $settings = $actions->SettingsProvider(true)->Load($account);
        if (!$settings) {
            throw new \RuntimeException('settings');
        }

        $hasEnabled = $actions->HasActionParam('enabled');
        $hasBehavior = $actions->HasActionParam('behavior');
        $enabled = $hasEnabled ? $actions->GetActionParam('enabled', '') : null;
        $behavior = $hasBehavior ? $actions->GetActionParam('behavior', '') : null;
        if ($hasEnabled && !\in_array($enabled, [0, 1, '0', '1', false, true], true)) {
            throw new \RuntimeException('enabled');
        }
        if ($hasBehavior && !\in_array($behavior, [1, 2, '1', '2'], true)) {
            throw new \RuntimeException('behavior');
        }
        if ($hasEnabled || $hasBehavior) {
            if ($hasEnabled) {
                $settings->SetConf(self::SETTING, (bool) $enabled);
            }
            if ($hasBehavior) {
                $settings->SetConf(self::BEHAVIOR_SETTING, (int) $behavior);
            }
            if (!$settings->save()) {
                throw new \RuntimeException('settings');
            }
        }

        $behavior = (int) $settings->GetConf(self::BEHAVIOR_SETTING, 1);
        return [
            'enabled' => (bool) $settings->GetConf(self::SETTING, true),
            'behavior' => \in_array($behavior, [1, 2], true) ? $behavior : 1,
        ];
    }
}
