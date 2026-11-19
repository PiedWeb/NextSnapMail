<?php

final class PiedWebTrashFolder
{
    public static function resolve(\MailSo\Imap\ImapClient $imap, string $configured): string
    {
        if ($configured === '__UNUSE__') throw new \RuntimeException('trash');
        if ($configured !== '') return $configured;

        $namespaces = $imap->GetNamespaces();
        // ACL can expose shared mailboxes that the folder list alone cannot distinguish.
        if ($namespaces === null && $imap->hasCapability('ACL')) throw new \RuntimeException('trash');
        $personal = $namespaces ? \array_column($namespaces->aPersonal, 'prefix') : [''];
        $external = $namespaces ? \array_column(\array_merge($namespaces->aOtherUsers, $namespaces->aShared), 'prefix') : [];
        $trash = null;
        foreach ($imap->FolderList('', '*') as $folder) {
            if (!$folder->Selectable() || $folder->IsInbox() || $folder->Role() !== 'trash') continue;
            $name = $folder->FullName;
            $matches = static fn(string $prefix): bool => \str_starts_with($name, $prefix);
            if (!\array_filter($personal, $matches) || \array_filter($external, $matches)) continue;
            if ($trash !== null && $trash !== $name) throw new \RuntimeException('trash');
            $trash = $name;
        }
        return $trash ?? throw new \RuntimeException('trash');
    }
}
