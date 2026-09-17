<?php

/* A scheduled message is an ordinary message in its own IMAP folder, stamped with the due
 * time. Nothing is stored outside the mailbox: no copy of the message, no recipient and no
 * credential. The browser writes it, the server-side sender reads it, and both find it the
 * same way, from the account's own Drafts folder setting. */
final class PiedWebScheduledSend
{
    public const HEADER = 'X-Pied-Web-Send-At';
    public const DSN = 'X-Pied-Web-Send-Dsn';
    public const LEAF = 'Scheduled';
    // The sender claims a message before its SMTP transaction and never releases the claim:
    // an interrupted send is reported, never repeated.
    public const SENDING = '$pwsending';
    // Accepted by SMTP but not yet filed: the send happened, so nothing may repeat it.
    public const SENT = '$pwsent';
    public const FAILED = '$pwsendfailed';
    // A date beyond this is a typing mistake; a few minutes in the past is a slow confirmation.
    private const AHEAD = 400 * 86400, BEHIND = 300, PAGE = 200;

    public static function handle($actions): array
    {
        // The native JSON dispatcher checks CSRF. Require POST and a login here too.
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new \RuntimeException('POST required');
        $account = $actions->getAccountFromToken();
        if (!$account) throw new \RuntimeException('Login required');
        $operation = (string) $actions->GetActionParam('operation', '');
        $account->ImapConnectAndLogin($actions->Plugins(), $actions->ImapClient(), $actions->Config());
        if ($operation === 'folder') return ['folder' => self::ensure($actions, $account), 'sender' => self::sender()];
        if ($operation === 'list') return self::pending($actions, $account);
        if ($operation === 'cancel') return self::cancel($actions, $account);
        throw new \RuntimeException('scope');
    }

    /* filter.save-message, the only place a due time is written. A message that cannot be
     * stamped must not be saved: unstamped, it would sit in the folder and never leave. */
    public static function stamp($actions, \MailSo\Mime\Message $message): void
    {
        $raw = (string) $actions->GetActionParam('pwSendAt', '');
        if ($raw === '') return;
        $account = $actions->getAccountFromToken();
        if (!$account) throw new \RuntimeException('Login required');
        // Only the scheduled folder carries scheduled messages. Refusing every other folder
        // keeps the header out of Drafts, Sent and any folder named by the client.
        if ((string) $actions->GetActionParam('saveFolder', '') !== self::folder($actions, $account)) {
            throw new \RuntimeException('folder');
        }
        $when = self::parse($raw);
        $message->SetCustomHeader(self::HEADER, \gmdate('Y-m-d\TH:i:s\Z', $when));
        if (!empty($actions->GetActionParam('dsn', 0))) $message->SetCustomHeader(self::DSN, '1');
        self::hint($account->Email(), $when);
    }

    /* The sender polls the mailbox on its own interval. This note tells it that something is
     * due sooner, so a message scheduled a few minutes ahead does not wait for the next poll.
     * It holds one timestamp under a hashed address: losing it delays a send, never drops it. */
    public static function hint(string $email, int $when, string $base = ''): void
    {
        $base = $base ?: (\defined('APP_PRIVATE_DATA') ? APP_PRIVATE_DATA . 'pied-web-ux/scheduled' : '');
        if (!$base) return;
        if (!\is_dir($base) && !@\mkdir($base, 0700, true) && !\is_dir($base)) return;
        $file = $base . '/' . \hash('sha256', \strtolower(\trim($email))) . '.json';
        $handle = @\fopen($file, 'c+');
        if (!$handle) return;
        try {
            if (!\flock($handle, LOCK_EX)) return;
            $known = \json_decode((string) \stream_get_contents($handle), true);
            $due = isset($known['due']) ? (int) $known['due'] : 0;
            if ($due > 0 && $due <= $when) return;
            \rewind($handle);
            \ftruncate($handle, 0);
            \fwrite($handle, (string) \json_encode(['due' => $when]));
        } finally {
            \flock($handle, LOCK_UN);
            \fclose($handle);
        }
    }

    /* The sender leaves its own heartbeat beside the notes. Without it, nothing on this
     * server would take a scheduled message out of the folder, so the composer refuses to
     * put one there rather than letting a message wait for a sender that does not exist. */
    public static function sender(string $base = ''): int
    {
        $base = $base ?: (\defined('APP_PRIVATE_DATA') ? APP_PRIVATE_DATA . 'pied-web-ux/scheduled' : '');
        if (!$base || !\is_file($base . '/sender.json')) return 0;
        $known = \json_decode((string) @\file_get_contents($base . '/sender.json'), true);
        return isset($known['at']) ? (int) $known['at'] : 0;
    }

    public static function parse(string $raw): int
    {
        if (!\preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/D', $raw)) {
            throw new \RuntimeException('time');
        }
        try { $when = new \DateTimeImmutable($raw); } catch (\Throwable $error) { throw new \RuntimeException('time'); }
        $epoch = $when->getTimestamp();
        if ($epoch < \time() - self::BEHIND || $epoch > \time() + self::AHEAD) throw new \RuntimeException('time');
        return $epoch;
    }

    /* The scheduled folder is a sibling of Drafts, so it lives in the namespace the server
     * already gave the account's own folders instead of a guessed root. */
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
        // A scheduled folder that is also a system folder would let the sender read Sent or
        // Trash as a queue. Refuse instead of sending something the user only stored.
        if (\strcasecmp($name, 'INBOX') === 0) throw new \RuntimeException('folder');
        foreach (['DraftsFolder', 'SentFolder', 'TrashFolder', 'SpamFolder', 'ArchiveFolder'] as $conf) {
            if (\strcasecmp($name, (string) $settings->GetConf($conf, '')) === 0) throw new \RuntimeException('folder');
        }
        return [$parent, $delimiter, $name];
    }

    /* Due times for the folder the native list is already showing. The list itself stays
     * native: this only answers what the message list cannot know. */
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
        $items = [\MailSo\Imap\Enumerations\FetchType::UID, \MailSo\Imap\Enumerations\FetchType::FLAGS,
            \MailSo\Imap\Enumerations\FetchType::BuildBodyCustomHeaderRequest([self::HEADER])];
        foreach ($imap->Fetch($items, \implode(',', $uids), true) as $response) {
            $uid = (int) $response->GetFetchValue(\MailSo\Imap\Enumerations\FetchType::UID);
            if (!$uid) continue;
            $flags = \array_map('\strtolower', (array) $response->GetFetchValue(\MailSo\Imap\Enumerations\FetchType::FLAGS));
            $headers = new \MailSo\Mime\HeaderCollection($response->GetHeaderFieldsValue());
            $due = \trim($headers->ValueByName(self::HEADER));
            $entries[] = ['uid' => $uid, 'sendAt' => $due,
                'state' => \in_array(self::SENT, $flags, true) ? 'sent'
                    : (\in_array(self::SENDING, $flags, true) ? 'sending'
                        : (\in_array(self::FAILED, $flags, true) ? 'failed'
                            : ($due === '' ? 'unscheduled' : 'pending')))];
        }
        return ['folder' => $name, 'entries' => $entries];
    }

    /* Cancelling gives the message back to the author: `resume` when the composer takes the
     * content over again, `draft` when it should wait in Drafts. */
    private static function cancel($actions, $account): array
    {
        $uid = \filter_var($actions->GetActionParam('uid', 0), FILTER_VALIDATE_INT);
        $mode = (string) $actions->GetActionParam('mode', 'draft');
        if (!$uid || $uid < 1 || !\in_array($mode, ['draft', 'resume'], true)) throw new \RuntimeException('scope');
        $name = self::folder($actions, $account);
        $imap = $actions->ImapClient();
        $information = $imap->FolderSelect($name);
        $fetched = $imap->Fetch([\MailSo\Imap\Enumerations\FetchType::UID,
            \MailSo\Imap\Enumerations\FetchType::FLAGS], (string) $uid, true);
        if (!$fetched) throw new \RuntimeException('missing');
        $flags = \array_map('\strtolower', (array) $fetched[0]->GetFetchValue(\MailSo\Imap\Enumerations\FetchType::FLAGS));
        // Once the sender has claimed a message, only the sender may decide what happened to it.
        if (\array_intersect([self::SENDING, self::SENT], $flags)) throw new \RuntimeException('sending');
        $range = new \MailSo\Imap\SequenceSet([$uid]);
        if (\in_array(self::FAILED, $flags, true) && $information->IsFlagSupported(self::FAILED)) {
            $actions->MailClient()->MessageSetFlag($name, $range, self::FAILED, false, true);
        }
        if ($mode === 'resume') {
            $imap->MessageDelete($name, $range);
            return ['folder' => $name, 'uid' => $uid, 'mode' => $mode];
        }
        $drafts = (string) $actions->SettingsProvider(true)->Load($account)->GetConf('DraftsFolder', '');
        if (!$drafts || $drafts === '__UNUSE__') throw new \RuntimeException('drafts');
        $imap->MessageMove($name, $drafts, $range);
        return ['folder' => $drafts, 'uid' => $uid, 'mode' => $mode];
    }
}
