<?php

final class PiedWebUnreadDrafts
{
    public static function list($actions): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new \RuntimeException('POST required');
        $account = $actions->getAccountFromToken();
        if (!$account) throw new \RuntimeException('Login required');
        $folder = (string) $actions->SettingsProvider(true)->Load($account)->GetConf('DraftsFolder', '');
        if (!$folder || $folder === '__UNUSE__' || strcasecmp($folder, 'INBOX') === 0) {
            return ['folder' => '', 'messages' => null];
        }
        $offset = filter_var($actions->GetActionParam('offset', 0), FILTER_VALIDATE_INT);
        if ($offset === false || $offset < 0 || $offset > 1000000 || $offset % 10 !== 0) {
            throw new \RuntimeException('offset');
        }
        $account->ImapConnectAndLogin($actions->Plugins(), $actions->ImapClient(), $actions->Config());
        $params = new \MailSo\Mail\MessageListParams;
        $params->sFolderName = $folder;
        $params->sSearch = 'is:unseen';
        $params->sSort = 'REVERSE DATE';
        $params->bHideDeleted = true;
        $params->bUseThreads = false;
        $params->iOffset = $offset;
        $params->iLimit = 10;
        // Separate read-only request: native Inbox pagination, caches and selection stay folder-scoped.
        return ['folder' => $folder, 'messages' => $actions->MailClient()->MessageList($params)];
    }
}
