<?php

class PiedWebUxPlugin extends \RainLoop\Plugins\AbstractPlugin
{
    const NAME = 'Pied Web UX',
        AUTHOR = 'Pied Web',
        VERSION = '1.6.5',
        RELEASE = '2026-09-12',
        REQUIRED = '2.38.2',
        LICENSE = 'AGPL v3',
        DESCRIPTION = 'Accessible message actions for the Pied Web theme, using native mail commands.';

    public function Init(): void
    {
        $this->addCss('ux.css');
        $this->addJs('send-delay.js');
        $this->addJs('background-send.js');
        $this->addJs('filtered-selection.js');
        $this->addJs('ux.js');
        $this->addJs('studio.js');
        $this->addJs('message-flag.js');
        $this->addJs('quote-readability.js');
        $this->addJs('list-interactions.js');
        $this->addJs('markdown-vendors.js');
        $this->addJs('markdown.js');
        $this->addJs('composer-icons.js');
        $this->addJs('composer-toolbar.js');
        $this->addJs('image-vendor.js');
        $this->addJs('image-tools.js');
        $this->addJs('composer-images.js');
        $this->addJs('attachment-images.js');
        $this->addJsonHook('PiedWebFilteredSelection', 'FilteredSelection');
    }

    public function FilteredSelection(): array
    {
        $actions = \RainLoop\Api::Actions();
        // The normal JSON dispatcher verifies CSRF. Explicitly require POST and login too.
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new \RuntimeException('POST required');
        $account = $actions->getAccountFromToken();
        try {
            $folder = (string) $actions->GetActionParam('folder', '');
            $search = (string) $actions->GetActionParam('search', '');
            if (!$folder || !trim($search) || strlen($search) > 8192 || strlen($folder) > 1024) {
                throw new \RuntimeException('scope');
            }
            $imap = $actions->ImapClient();
            $account->ImapConnectAndLogin($actions->Plugins(), $imap, $actions->Config());
            $settings = $actions->SettingsProvider(true)->Load($account);
            $trash = (string) $settings->GetConf('TrashFolder', '');
            require_once __DIR__ . '/FilteredSelection.php';
            $store = new PiedWebFilteredSelection(APP_PRIVATE_DATA . 'pied-web-ux/selections', $account->Hash());
            $operation = (string) $actions->GetActionParam('operation', '');
            if ($operation === 'prepare') {
                if (!$trash || $trash === '__UNUSE__') throw new \RuntimeException('trash');
                if (!$imap->hasCapability($folder === $trash ? 'UIDPLUS' : 'MOVE')) throw new \RuntimeException('capability');
                $cache = false;
                $criteria = (string) \MailSo\Imap\SearchCriterias::fromString(
                    $imap, $folder, $search, (bool) $settings->GetConf('HideDeleted', 1), $cache
                );
                // A snapshot always describes a single folder, never MULTISEARCH results.
                if (str_starts_with($criteria, 'IN (')) throw new \RuntimeException('scope');
                $info = $imap->FolderExamine($folder, true);
                $uids = $imap->MessageSearch($criteria, true);
                $result = $store->prepare($folder, $search, (int) $info->UIDVALIDITY, $uids, $trash);
            } elseif ($operation === 'delete' && (string) $actions->GetActionParam('confirmed', '') === '1') {
                $result = $store->batch((string) $actions->GetActionParam('token', ''),
                    (int) $actions->GetActionParam('cursor', -1), $folder, $search, $trash, $imap);
            } else {
                throw new \RuntimeException('scope');
            }
        } catch (\Throwable $error) {
            $known = ['scope', 'trash', 'capability', 'expired', 'changed', 'uncertain', 'storage', 'limit'];
            $result = ['error' => in_array($error->getMessage(), $known, true) ? $error->getMessage() : 'mail'];
        }
        return $this->Manager()->JsonResponseHelper('PiedWebFilteredSelection', $result);
    }
}
