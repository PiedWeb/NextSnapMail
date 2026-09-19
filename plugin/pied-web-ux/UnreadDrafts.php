<?php

final class PiedWebUnreadDrafts
{
    public static function list($actions): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new \RuntimeException('POST required');
        $account = $actions->getAccountFromToken();
        if (!$account) throw new \RuntimeException('Login required');
        $settings = $actions->SettingsProvider(true)->Load($account);
        $folder = (string) $settings->GetConf('DraftsFolder', '');
        if (!$folder || $folder === '__UNUSE__' || strcasecmp($folder, 'INBOX') === 0) {
            return ['folder' => '', 'messages' => null];
        }
        $offset = filter_var($actions->GetActionParam('offset', 0), FILTER_VALIDATE_INT);
        if ($offset === false || $offset < 0 || $offset > 1000000 || $offset % 10 !== 0) {
            throw new \RuntimeException('offset');
        }
        $etag = (string) $actions->GetActionParam('etag', '');
        if (\strlen($etag) > 512) {
            throw new \RuntimeException('scope');
        }
        $account->ImapConnectAndLogin($actions->Plugins(), $actions->ImapClient(), $actions->Config());

        // The reminder is refreshed after every Inbox refresh and every minute.
        // One STATUS tells us whether the Drafts folder moved at all, which
        // skips the search and the header fetch when it did not.
        $current = $actions->MailClient()->FolderHash($folder);
        if ($etag !== '' && $etag === $current && $offset === 0) {
            return ['folder' => $folder, 'etag' => $current, 'unchanged' => true, 'messages' => null];
        }
        $params = new \MailSo\Mail\MessageListParams;
        $params->sFolderName = $folder;
        $params->sSearch = 'is:unseen';
        $params->sSort = (bool) $settings->GetConf('PiedWebUnreadOldestFirst', true)
            ? 'DATE' : 'REVERSE DATE';
        $params->bHideDeleted = true;
        $params->bUseThreads = false;
        $params->iOffset = $offset;
        $params->iLimit = 10;
        // Separate read-only request: native Inbox pagination, caches and selection stay folder-scoped.
        return ['folder' => $folder, 'etag' => $current, 'unchanged' => false,
            'messages' => $actions->MailClient()->MessageList($params)];
    }
}
