<?php

final class PiedWebFeed
{
    public const DEFAULT_VIEW_SETTING = 'PiedWebFeedDefaultView';
    public const SHOW_DRAFTS_SETTING = 'PiedWebFeedShowDrafts';
    public const SHOW_READ_SETTING = 'PiedWebFeedShowRead';
    public const INCLUDE_GLOBAL_SETTING = 'PiedWebFeedIncludeGlobal';

    private const ALLOWED_DEFAULT_VIEWS = ['auto', 'feed', 'global', 'inbox'];
    private const PAGE_SIZE = 999;
    private const READ_LIMIT = 20;

    public static function handle($actions): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            throw new \RuntimeException('POST required');
        }
        $account = $actions->getAccountFromToken();
        $main = $actions->getMainAccountFromToken();
        if (!$account || !$main) {
            throw new \RuntimeException('Login required');
        }

        $operation = (string) $actions->GetActionParam('operation', 'settings');
        if ($operation === 'settings') {
            return self::settings($actions, $account, $main);
        }
        if ($operation === 'global') {
            return self::globalFeed($actions, $main);
        }
        throw new \RuntimeException('scope');
    }

    private static function settings($actions, $account, $main): array
    {
        $local = $actions->SettingsProvider(true)->Load($account);
        $shared = $actions->SettingsProvider(false)->Load($main);
        if (!$local || !$shared) {
            throw new \RuntimeException('settings');
        }

        $updates = [];
        if ($actions->HasActionParam('defaultView')) {
            $value = (string) $actions->GetActionParam('defaultView', '');
            if (!\in_array($value, self::ALLOWED_DEFAULT_VIEWS, true)) {
                throw new \RuntimeException('defaultView');
            }
            $shared->SetConf(self::DEFAULT_VIEW_SETTING, $value);
            $updates['shared'] = true;
        }
        foreach ([
            'showDrafts' => self::SHOW_DRAFTS_SETTING,
            'showRead' => self::SHOW_READ_SETTING,
            'includeGlobal' => self::INCLUDE_GLOBAL_SETTING,
        ] as $parameter => $setting) {
            if (!$actions->HasActionParam($parameter)) {
                continue;
            }
            $value = $actions->GetActionParam($parameter, '');
            if (!\in_array($value, [0, 1, '0', '1', false, true], true)) {
                throw new \RuntimeException($parameter);
            }
            $local->SetConf($setting, (bool) $value);
            $updates['local'] = true;
        }
        if (($updates['shared'] ?? false) && !$shared->save()) {
            throw new \RuntimeException('settings');
        }
        if (($updates['local'] ?? false) && !$local->save()) {
            throw new \RuntimeException('settings');
        }

        return self::settingsState($actions, $account, $main, $local, $shared);
    }

    private static function settingsState($actions, $account, $main, $local = null, $shared = null): array
    {
        $local = $local ?: $actions->SettingsProvider(true)->Load($account);
        $shared = $shared ?: $actions->SettingsProvider(false)->Load($main);
        $defaultView = (string) $shared->GetConf(self::DEFAULT_VIEW_SETTING, 'auto');
        if (!\in_array($defaultView, self::ALLOWED_DEFAULT_VIEWS, true)) {
            $defaultView = 'auto';
        }
        return [
            'defaultView' => $defaultView,
            'showDrafts' => (bool) $local->GetConf(self::SHOW_DRAFTS_SETTING, true),
            'showRead' => (bool) $local->GetConf(self::SHOW_READ_SETTING, true),
            'includeGlobal' => (bool) $local->GetConf(self::INCLUDE_GLOBAL_SETTING, true),
            'accountCount' => \count(self::accounts($actions, $main)),
        ];
    }

    private static function globalFeed($actions, $main): array
    {
        $items = [];
        $accounts = [];
        foreach (self::accounts($actions, $main) as $entry) {
            $account = $entry['account'];
            $settings = $actions->SettingsProvider(true)->Load($account);
            if (!$settings || !(bool) $settings->GetConf(self::INCLUDE_GLOBAL_SETTING, true)) {
                continue;
            }
            $public = [
                'email' => $entry['email'],
                'name' => $entry['name'],
                'hash' => $account->Hash(),
                'error' => '',
            ];
            try {
                $mail = self::mailClient($actions, $account);
                $items = \array_merge($items, self::accountItems($actions, $account, $settings, $mail, $public));
            } catch (\Throwable $error) {
                // One unavailable mailbox must not hide the other accounts.
                $public['error'] = 'mail';
            }
            $accounts[] = $public;
        }
        return ['accounts' => $accounts, 'items' => $items, 'generatedAt' => \time()];
    }

    private static function accounts($actions, $main): array
    {
        $result = [[
            'account' => $main,
            'email' => (string) $main->Email(),
            'name' => '',
        ]];
        foreach ($actions->GetAccounts($main) as $email => $token) {
            try {
                $account = \RainLoop\Model\AdditionalAccount::NewInstanceFromTokenArray($actions, $token, true);
                if (!$account) {
                    continue;
                }
                $result[] = [
                    'account' => $account,
                    'email' => (string) $account->Email(),
                    'name' => \trim((string) ($token['name'] ?? '')),
                ];
            } catch (\Throwable $error) {
                // Invalid saved credentials remain the native account manager's concern.
            }
        }
        return $result;
    }

    private static function mailClient($actions, $account)
    {
        // Tests provide the same contract without opening a network connection.
        if (\method_exists($actions, 'PiedWebFeedMailClient')) {
            return $actions->PiedWebFeedMailClient($account);
        }
        $mail = new \MailSo\Mail\MailClient();
        $account->ImapConnectAndLogin($actions->Plugins(), $mail->ImapClient(), $actions->Config());
        return $mail;
    }

    private static function accountItems($actions, $account, $settings, $mail, array $public): array
    {
        $inbox = self::params($actions, $account, $settings, 'INBOX', '', 'REVERSE DATE', self::READ_LIMIT);
        $native = $mail->MessageList($inbox);
        $items = self::rows($native, $public, 'message');

        $unread = self::params($actions, $account, $settings, 'INBOX', 'is:unseen', 'DATE', self::PAGE_SIZE);
        foreach (self::allPages($mail, $unread) as $message) {
            $items[] = self::row($message, $public, 'message');
        }

        if ((bool) $settings->GetConf(self::SHOW_DRAFTS_SETTING, true)) {
            $draftsFolder = (string) $settings->GetConf('DraftsFolder', '');
            if ($draftsFolder && $draftsFolder !== '__UNUSE__' && \strcasecmp($draftsFolder, 'INBOX') !== 0) {
                $drafts = self::params($actions, $account, $settings, $draftsFolder, 'is:unseen', 'DATE', self::PAGE_SIZE, false);
                foreach (self::allPages($mail, $drafts) as $message) {
                    $items[] = self::row($message, $public, 'draft');
                }
            }
        }

        $deduplicated = [];
        foreach ($items as $item) {
            if (!(bool) $settings->GetConf(self::SHOW_READ_SETTING, true)
                && $item['_pwKind'] === 'message' && !self::unreadRow($item)) {
                continue;
            }
            $key = $item['_pwAccountEmail'] . "\0" . ($item['folder'] ?? '') . "\0" . ($item['uid'] ?? '');
            $deduplicated[$key] = $item;
        }
        return \array_values($deduplicated);
    }

    private static function params($actions, $account, $settings, string $folder, string $search,
        string $sort, int $limit, ?bool $threads = null): \MailSo\Mail\MessageListParams
    {
        $params = new \MailSo\Mail\MessageListParams;
        $params->sFolderName = $folder;
        $params->sSearch = $search;
        $params->sSort = $sort;
        $params->bHideDeleted = (bool) $settings->GetConf('HideDeleted', 1);
        $params->bUseThreads = $threads ?? (bool) $settings->GetConf('UseThreads', false);
        $params->sThreadAlgorithm = (string) $settings->GetConf('threadAlgorithm', '');
        $params->iOffset = 0;
        $params->iLimit = $limit;
        if (\method_exists($actions, 'Cacher')
            && $actions->Config()->Get('cache', 'enable', true)
            && $actions->Config()->Get('cache', 'server_uids', false)
        ) {
            $params->oCacher = $actions->Cacher($account);
        }
        return $params;
    }

    private static function allPages($mail, \MailSo\Mail\MessageListParams $params): array
    {
        $messages = [];
        $collection = $mail->MessageList($params);
        foreach ($collection as $message) {
            $messages[] = $message;
        }
        $total = \max(0, (int) ($collection->totalEmails ?? 0));
        for ($offset = $params->iLimit; $offset < $total; $offset += $params->iLimit) {
            $params->iOffset = $offset;
            foreach ($mail->MessageList($params) as $message) {
                $messages[] = $message;
            }
        }
        return $messages;
    }

    private static function rows($collection, array $public, string $kind): array
    {
        $rows = [];
        foreach ($collection as $message) {
            $rows[] = self::row($message, $public, $kind);
        }
        return $rows;
    }

    private static function row($message, array $public, string $kind): array
    {
        $row = $message instanceof \JsonSerializable ? $message->jsonSerialize() : (array) $message;
        $row['_pwAccountEmail'] = $public['email'];
        $row['_pwAccountName'] = $public['name'];
        $row['_pwAccountHash'] = $public['hash'];
        $row['_pwKind'] = $kind;
        return $row;
    }

    private static function unreadRow(array $row): bool
    {
        $flags = \array_map('strtolower', \is_array($row['flags'] ?? null) ? $row['flags'] : []);
        return !\in_array('\\seen', $flags, true)
            || !empty($row['threadUnseen'] ?? []);
    }
}
