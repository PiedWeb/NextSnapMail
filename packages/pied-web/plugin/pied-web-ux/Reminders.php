<?php

/* A reminder is an ordinary Inbox message moved to a dedicated IMAP folder. Its due
 * time is an IMAP keyword, so the mailbox remains the only store: no subject, address,
 * message body or account identifier is copied into Nextcloud data. */
final class PiedWebReminders
{
    public const LEAF = 'Reminders';
    public const PREFIX = '$pwremind-';
    private const AHEAD = 400 * 86400, BEHIND = 300, PAGE = 500, LIMIT = 200;

    public static function handle($actions): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new \RuntimeException('POST required');
        $account = $actions->getAccountFromToken();
        if (!$account) throw new \RuntimeException('Login required');
        $operation = (string) $actions->GetActionParam('operation', '');
        $account->ImapConnectAndLogin($actions->Plugins(), $actions->ImapClient(), $actions->Config());
        if ($operation === 'folder') return ['folder' => self::ensure($actions, $account), 'sender' => self::sender()];
        if ($operation === 'list') return self::pending($actions, $account);
        if ($operation === 'set') return self::schedule($actions, $account, false);
        if ($operation === 'reschedule') return self::schedule($actions, $account, true);
        if ($operation === 'wake') return self::wake($actions, $account);
        throw new \RuntimeException('scope');
    }

    public static function keyword(int $when): string
    {
        return self::PREFIX . \strtolower(\base_convert((string) $when, 10, 36));
    }

    /** Cross-account callers must first resolve account membership from the login.
     * Supply an already authenticated mail client; never switch session account state. */
    public static function validateScoped($actions, $account, $mail, string $remindAt): void
    {
        $when = self::parse($remindAt);
        $sender = self::sender();
        if ($sender < 1 || \time() - $sender > 1800) throw new \RuntimeException('sender');
        if (!$mail->ImapClient()->hasCapability('MOVE')) throw new \RuntimeException('capability');
        self::resolve(self::scopedActions($actions, $mail, []), $account);
        if (!$mail->ImapClient()->FolderSelect('INBOX', true)->IsFlagSupported(self::keyword($when))) {
            throw new \RuntimeException('keyword');
        }
    }

    public static function applyScoped($actions, $account, $mail, array $uids, string $remindAt): array
    {
        self::validateScoped($actions, $account, $mail, $remindAt);
        $scoped = self::scopedActions($actions, $mail, ['uids' => \implode(',', $uids), 'remindAt' => $remindAt]);
        return self::schedule($scoped, $account, false);
    }

    private static function scopedActions($actions, $mail, array $params)
    {
        return new class($actions, $mail, $params) {
            public function __construct(private $actions, private $mail, private array $params) {}
            public function ImapClient() { return $this->mail->ImapClient(); }
            public function MailClient() { return $this->mail; }
            public function GetActionParam($name, $default = '') { return $this->params[$name] ?? $default; }
            public function SettingsProvider($local) { return $this->actions->SettingsProvider($local); }
        };
    }

    public static function timeFromFlags(array $flags): ?int
    {
        $times = [];
        foreach ($flags as $flag) {
            if (!\preg_match('/^\\$pwremind-([0-9a-z]+)$/Di', (string) $flag, $match)) continue;
            $when = (int) \base_convert(\strtolower($match[1]), 36, 10);
            if ($when > 0) $times[] = $when;
        }
        // A duplicate residue should wake conservatively rather than make a reminder late.
        return $times ? \min($times) : null;
    }

    public static function reminderFlags(array $flags): array
    {
        return \array_values(\array_filter($flags,
            static fn($flag) => \str_starts_with(\strtolower((string) $flag), self::PREFIX)));
    }

    public static function parse(string $raw): int
    {
        if (!\preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/D', $raw)) {
            throw new \RuntimeException('time');
        }
        try { $when = new \DateTimeImmutable($raw); } catch (\Throwable $error) { throw new \RuntimeException('time'); }
        $epoch = $when->getTimestamp();
        if ($epoch < \time() - self::BEHIND || $epoch > \time() + self::AHEAD) throw new \RuntimeException('time');
        return $epoch;
    }

    public static function folder($actions, $account): string
    {
        return self::resolve($actions, $account)[2];
    }

    public static function ensure($actions, $account): string
    {
        [$parent, , $name] = self::resolve($actions, $account);
        $imap = $actions->ImapClient();
        if (!isset($imap->FolderStatusList($name, '')[$name])) {
            $actions->MailClient()->FolderCreate(self::LEAF, $parent, true);
        }
        return $name;
    }

    private static function resolve($actions, $account): array
    {
        $settings = $actions->SettingsProvider(true)->Load($account);
        $drafts = (string) $settings->GetConf('DraftsFolder', '');
        if (!$drafts || $drafts === '__UNUSE__' || \strcasecmp($drafts, 'INBOX') === 0) throw new \RuntimeException('drafts');
        $delimiter = (string) ($actions->ImapClient()->FolderHierarchyDelimiter($drafts) ?? '');
        $cut = $delimiter === '' ? false : \strrpos($drafts, $delimiter);
        $parent = $cut === false ? '' : \substr($drafts, 0, $cut);
        $name = $parent === '' ? self::LEAF : $parent . $delimiter . self::LEAF;
        if (\strcasecmp($name, 'INBOX') === 0) throw new \RuntimeException('folder');
        foreach (['DraftsFolder', 'SentFolder', 'TrashFolder', 'SpamFolder', 'ArchiveFolder'] as $conf) {
            if (\strcasecmp($name, (string) $settings->GetConf($conf, '')) === 0) throw new \RuntimeException('folder');
        }
        return [$parent, $delimiter, $name];
    }

    private static function sender(): int
    {
        require_once __DIR__ . '/ScheduledSend.php';
        return PiedWebScheduledSend::sender();
    }

    private static function uids($actions): array
    {
        $raw = (string) $actions->GetActionParam('uids', '');
        if ($raw === '' || \strlen($raw) > 4096) throw new \RuntimeException('scope');
        $uids = [];
        foreach (\explode(',', $raw) as $value) {
            $value = \trim($value);
            if (!\preg_match('/^[1-9]\d*$/D', $value)) throw new \RuntimeException('scope');
            $uids[(int) $value] = (int) $value;
        }
        if (!$uids || \count($uids) > self::LIMIT) throw new \RuntimeException('scope');
        return \array_values($uids);
    }

    private static function fetch($imap, string $folder, array $uids): array
    {
        $imap->FolderExamine($folder, true);
        $found = [];
        $items = [\MailSo\Imap\Enumerations\FetchType::UID, \MailSo\Imap\Enumerations\FetchType::FLAGS];
        foreach ($imap->Fetch($items, \implode(',', $uids), true) as $response) {
            $uid = (int) $response->GetFetchValue(\MailSo\Imap\Enumerations\FetchType::UID);
            if ($uid > 0) $found[$uid] = (array) $response->GetFetchValue(\MailSo\Imap\Enumerations\FetchType::FLAGS);
        }
        if (\count($found) !== \count($uids)) throw new \RuntimeException('missing');
        return $found;
    }

    private static function schedule($actions, $account, bool $reschedule): array
    {
        $when = self::parse((string) $actions->GetActionParam('remindAt', ''));
        $sender = self::sender();
        if ($sender < 1 || \time() - $sender > 1800) throw new \RuntimeException('sender');
        $uids = self::uids($actions);
        $imap = $actions->ImapClient();
        $target = self::ensure($actions, $account);
        $source = $reschedule ? $target : 'INBOX';
        $messages = self::fetch($imap, $source, $uids);
        $range = new \MailSo\Imap\SequenceSet($uids);
        $keyword = self::keyword($when);
        $client = $actions->MailClient();
        try {
            $client->MessageSetFlag($source, $range, $keyword, true, false);
        } catch (\Throwable $error) {
            throw new \RuntimeException('keyword');
        }
        foreach ($messages as $uid => $flags) {
            foreach (self::reminderFlags($flags) as $old) {
                if (\strcasecmp($old, $keyword) === 0) continue;
                try { $client->MessageSetFlag($source, new \MailSo\Imap\SequenceSet([$uid]), $old, false, true); }
                catch (\Throwable $ignored) {}
            }
        }
        if (!$reschedule) {
            try {
                $client->MessageSetFlag($source, $range, \MailSo\Imap\Enumerations\MessageFlag::SEEN, true, false);
                $imap->MessageMove($source, $target, $range);
            } catch (\Throwable $error) {
                try { $client->MessageSetFlag($source, $range, $keyword, false, true); } catch (\Throwable $ignored) {}
                foreach ($messages as $uid => $flags) {
                    $wasSeen = (bool) \array_filter($flags,
                        static fn($flag) => 0 === \strcasecmp((string) $flag, \MailSo\Imap\Enumerations\MessageFlag::SEEN));
                    if ($wasSeen) continue;
                    try {
                        $client->MessageSetFlag($source, new \MailSo\Imap\SequenceSet([$uid]),
                            \MailSo\Imap\Enumerations\MessageFlag::SEEN, false, true);
                    } catch (\Throwable $ignored) {}
                }
                throw new \RuntimeException('move');
            }
        }
        require_once __DIR__ . '/ScheduledSend.php';
        PiedWebScheduledSend::hint($account->Email(), $when);
        return ['folder' => $target, 'count' => \count($uids), 'remindAt' => \gmdate('Y-m-d\TH:i:s\Z', $when)];
    }

    private static function pending($actions, $account): array
    {
        $name = self::folder($actions, $account);
        $imap = $actions->ImapClient();
        if (!isset($imap->FolderStatusList($name, '')[$name])) return ['folder' => $name, 'entries' => []];
        $imap->FolderExamine($name);
        $uids = $imap->MessageSearch('UNDELETED', true);
        \sort($uids);
        $uids = \array_slice($uids, -self::PAGE);
        if (!$uids) return ['folder' => $name, 'entries' => []];
        $entries = [];
        $items = [\MailSo\Imap\Enumerations\FetchType::UID, \MailSo\Imap\Enumerations\FetchType::FLAGS];
        foreach ($imap->Fetch($items, \implode(',', $uids), true) as $response) {
            $uid = (int) $response->GetFetchValue(\MailSo\Imap\Enumerations\FetchType::UID);
            if (!$uid) continue;
            $flags = (array) $response->GetFetchValue(\MailSo\Imap\Enumerations\FetchType::FLAGS);
            $when = self::timeFromFlags($flags);
            $entries[] = ['uid' => $uid, 'remindAt' => $when ? \gmdate('Y-m-d\TH:i:s\Z', $when) : '',
                'state' => !$when ? 'unscheduled' : ($when <= \time() ? 'due' : 'pending')];
        }
        return ['folder' => $name, 'entries' => $entries];
    }

    private static function wake($actions, $account): array
    {
        $uids = self::uids($actions);
        $folder = self::folder($actions, $account);
        $imap = $actions->ImapClient();
        $messages = self::fetch($imap, $folder, $uids);
        $client = $actions->MailClient();
        $range = new \MailSo\Imap\SequenceSet($uids);
        try {
            $client->MessageSetFlag($folder, $range, \MailSo\Imap\Enumerations\MessageFlag::SEEN, false, false);
            foreach ($messages as $uid => $flags) {
                foreach (self::reminderFlags($flags) as $flag) {
                    $client->MessageSetFlag($folder, new \MailSo\Imap\SequenceSet([$uid]), $flag, false, true);
                }
            }
            $imap->MessageMove($folder, 'INBOX', $range);
        } catch (\Throwable $error) {
            try { $client->MessageSetFlag($folder, $range, \MailSo\Imap\Enumerations\MessageFlag::SEEN, true, true); }
            catch (\Throwable $ignored) {}
            foreach ($messages as $uid => $flags) {
                foreach (self::reminderFlags($flags) as $flag) {
                    try { $client->MessageSetFlag($folder, new \MailSo\Imap\SequenceSet([$uid]), $flag, true, true); }
                    catch (\Throwable $ignored) {}
                }
            }
            throw new \RuntimeException('move');
        }
        return ['folder' => 'INBOX', 'count' => \count($uids)];
    }
}
