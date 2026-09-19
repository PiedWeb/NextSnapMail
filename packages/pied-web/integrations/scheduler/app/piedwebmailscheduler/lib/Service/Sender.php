<?php
declare(strict_types=1);

namespace OCA\PiedWebMailScheduler\Service;

use MailSo\Imap\Enumerations\FetchType;
use MailSo\Imap\Enumerations\MessageFlag;
use MailSo\Imap\SequenceSet;
use MailSo\Mime\HeaderCollection;
use Psr\Log\LoggerInterface;
use SnappyMail\SensitiveString;

/* Sends scheduled messages and wakes mail reminders from the account's own IMAP queues.
 *
 * The mailbox is the queue. A message is claimed with an IMAP keyword before its SMTP
 * transaction and the claim is never taken back, so a run interrupted anywhere leaves a
 * message that is reported, not sent a second time. Nothing is copied out of the mailbox:
 * this reads the stored message, rewrites the headers a send rewrites, and streams it. */
/* Not final: the behaviour checks replace the two seams below to run it without a mail server. */
class Sender {
    public const HEADER = 'X-Pied-Web-Send-At';
    public const DSN = 'X-Pied-Web-Send-Dsn';
    public const LEAF = 'Scheduled';
    public const SENDING = '$pwsending';
    public const SENT = '$pwsent';
    public const FAILED = '$pwsendfailed';
    public const REMINDER_LEAF = 'Reminders';
    public const REMINDER_PREFIX = '$pwremind-';
    /* A message the server still refuses a day after its time will not leave on its own. */
    private const GIVE_UP = 86400;
    /* Headers a stored message carries that a sent message must not. */
    private const PRIVATE_HEADERS = ['x-draft-info', 'x-pied-web-send-at', 'x-pied-web-send-dsn'];

    public function __construct(private LoggerInterface $logger) {}

    /** @return array{sent:int,failed:int,held:int,pending:int,reminded:int,reminderPending:int,next:?int,notes:string[]} */
    public function mailbox(string $email, SensitiveString $password, int $now, bool $dryRun = false): array
    {
        $report = ['sent' => 0, 'failed' => 0, 'held' => 0, 'pending' => 0,
            'reminded' => 0, 'reminderPending' => 0, 'next' => null, 'notes' => []];
        $actions = \RainLoop\Api::Actions();
        $account = $this->account($actions, $email, $password);
        $imap = $actions->ImapClient();
        $account->ImapConnectAndLogin($actions->Plugins(), $imap, $actions->Config());
        try {
            $settings = $actions->SettingsProvider(true)->Load($account);
            $folder = $this->folder($imap, $settings);
            if (isset($imap->FolderStatusList($folder, '')[$folder])) {
                foreach ($this->scan($imap, $folder) as $entry) {
                    if ($entry['held']) { ++$report['held']; continue; }
                    if ($entry['due'] === null) { $report['notes'][] = 'uid ' . $entry['uid'] . ': no send time'; continue; }
                    if ($entry['due'] > $now) {
                        ++$report['pending'];
                        $report['next'] = $report['next'] === null ? $entry['due'] : \min($report['next'], $entry['due']);
                        continue;
                    }
                    if ($dryRun) { ++$report['pending']; continue; }
                    $this->deliver($actions, $account, $imap, $settings, $folder, $entry, $now, $report);
                }
            }
            $reminders = $this->reminderFolder($imap, $settings);
            if (isset($imap->FolderStatusList($reminders, '')[$reminders])) {
                foreach ($this->scanReminders($imap, $reminders) as $entry) {
                    if ($entry['due'] === null) {
                        $report['notes'][] = 'reminder uid ' . $entry['uid'] . ': no reminder time';
                        continue;
                    }
                    if ($entry['due'] > $now) {
                        ++$report['reminderPending'];
                        $report['next'] = $report['next'] === null ? $entry['due'] : \min($report['next'], $entry['due']);
                        continue;
                    }
                    if ($dryRun) { ++$report['reminderPending']; continue; }
                    $this->wakeReminder($actions->MailClient(), $imap, $reminders, $entry, $now, $report);
                }
            }
        } finally {
            try { $imap->Disconnect(); } catch (\Throwable $error) {}
        }
        return $report;
    }

    /* Overridable so the checks can drive the sender without a mail server. */
    protected function account($actions, string $email, SensitiveString $password)
    {
        $domain = $actions->DomainProvider()->getByEmailAddress($email);
        $account = new \RainLoop\Model\MainAccount;
        $account->setCredentials($domain, $email,
            $domain->ImapSettings()->fixUsername($email), $password,
            $domain->SmtpSettings()->fixUsername($email));
        return $account;
    }

    /* The same rule the browser uses: a sibling of the account's own Drafts folder. */
    public function folder($imap, $settings): string
    {
        return $this->siblingFolder($imap, $settings, self::LEAF);
    }

    public function reminderFolder($imap, $settings): string
    {
        return $this->siblingFolder($imap, $settings, self::REMINDER_LEAF);
    }

    private function siblingFolder($imap, $settings, string $leaf): string
    {
        $drafts = (string) $settings->GetConf('DraftsFolder', '');
        if (!$drafts || $drafts === '__UNUSE__' || \strcasecmp($drafts, 'INBOX') === 0) {
            throw new \RuntimeException('no Drafts folder is configured');
        }
        $delimiter = (string) ($imap->FolderHierarchyDelimiter($drafts) ?? '');
        $cut = $delimiter === '' ? false : \strrpos($drafts, $delimiter);
        $name = $cut === false ? $leaf : \substr($drafts, 0, $cut) . $delimiter . $leaf;
        if (\strcasecmp($name, 'INBOX') === 0) throw new \RuntimeException('refusing INBOX as a queue');
        foreach (['DraftsFolder', 'SentFolder', 'TrashFolder', 'SpamFolder', 'ArchiveFolder'] as $conf) {
            if (\strcasecmp($name, (string) $settings->GetConf($conf, '')) === 0) {
                throw new \RuntimeException('refusing a system folder as a queue');
            }
        }
        return $name;
    }

    /** @return array<int, array{uid:int,due:?int,flags:string[]}> */
    private function scanReminders($imap, string $folder): array
    {
        $imap->FolderExamine($folder);
        $uids = $imap->MessageSearch('UNDELETED', true);
        if (!$uids) return [];
        \sort($uids);
        $entries = [];
        $items = [FetchType::UID, FetchType::FLAGS];
        foreach ($imap->Fetch($items, \implode(',', $uids), true) as $response) {
            $uid = (int) $response->GetFetchValue(FetchType::UID);
            if (!$uid) continue;
            $flags = \array_map('strtolower', (array) $response->GetFetchValue(FetchType::FLAGS));
            $times = [];
            foreach ($flags as $flag) {
                if (!\preg_match('/^\\$pwremind-([0-9a-z]+)$/Di', $flag, $match)) continue;
                $when = (int) \base_convert($match[1], 36, 10);
                if ($when > 0) $times[] = $when;
            }
            $entries[] = ['uid' => $uid, 'due' => $times ? \min($times) : null, 'flags' => $flags];
        }
        return $entries;
    }

    private function wakeReminder($client, $imap, string $folder, array $entry, int $now, array &$report): void
    {
        $range = new SequenceSet([$entry['uid']]);
        $flags = \array_values(\array_filter($entry['flags'],
            static fn($flag) => \str_starts_with(\strtolower((string) $flag), self::REMINDER_PREFIX)));
        try {
            $client->MessageSetFlag($folder, $range, MessageFlag::SEEN, false, false);
            foreach ($flags as $flag) $client->MessageSetFlag($folder, $range, $flag, false, true);
            $imap->MessageMove($folder, 'INBOX', $range);
            ++$report['reminded'];
        } catch (\Throwable $error) {
            try { $client->MessageSetFlag($folder, $range, MessageFlag::SEEN, true, true); }
            catch (\Throwable $ignored) {}
            foreach ($flags as $flag) {
                try { $client->MessageSetFlag($folder, $range, $flag, true, true); } catch (\Throwable $ignored) {}
            }
            ++$report['reminderPending'];
            $retry = $now + 60;
            $report['next'] = $report['next'] === null ? $retry : \min($report['next'], $retry);
            $report['notes'][] = 'reminder uid ' . $entry['uid'] . ': not restored (' . $error->getMessage() . ')';
            $this->logger->warning('Mail reminder not restored', ['exception' => $error]);
        }
    }

    /** @return array<int, array{uid:int,due:?int,held:bool,flags:string[]}> */
    private function scan($imap, string $folder): array
    {
        $imap->FolderExamine($folder);
        $uids = $imap->MessageSearch('UNDELETED', true);
        if (!$uids) return [];
        \sort($uids);
        $entries = [];
        $items = [FetchType::UID, FetchType::FLAGS, FetchType::BuildBodyCustomHeaderRequest([self::HEADER])];
        foreach ($imap->Fetch($items, \implode(',', $uids), true) as $response) {
            $uid = (int) $response->GetFetchValue(FetchType::UID);
            if (!$uid) continue;
            $flags = \array_map('\strtolower', (array) $response->GetFetchValue(FetchType::FLAGS));
            $raw = \trim((new HeaderCollection($response->GetHeaderFieldsValue()))->ValueByName(self::HEADER));
            $due = null;
            // The plugin writes whole seconds; a fractional instant from anywhere else still reads.
            if ($raw !== '' && \preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/D', $raw)) {
                try { $due = (new \DateTimeImmutable($raw))->getTimestamp(); } catch (\Throwable $error) { $due = null; }
            }
            $entries[] = ['uid' => $uid, 'due' => $due, 'flags' => $flags,
                // A claimed, sent or abandoned message is the sender's own residue: never touch it again.
                'held' => (bool) \array_intersect([self::SENDING, self::SENT, self::FAILED], $flags)];
        }
        return $entries;
    }

    private function deliver($actions, $account, $imap, $settings, string $folder, array $entry, int $now, array &$report): void
    {
        $uid = $entry['uid'];
        $range = new SequenceSet([$uid]);
        $client = $actions->MailClient();
        try {
            // Claiming first is what makes a crash safe: an unclaimable mailbox is left alone.
            $client->MessageSetFlag($folder, $range, self::SENDING, true, false);
        } catch (\Throwable $error) {
            $report['notes'][] = 'uid ' . $uid . ': cannot claim (' . $error->getMessage() . ')';
            return;
        }
        $accepted = false;
        try {
            $raw = $this->read($client, $folder, $uid);
            $headers = new HeaderCollection($this->headerBlock($raw));
            $recipients = $this->recipients($headers);
            if (!$recipients) throw new \RuntimeException('no recipient');
            $outgoing = $this->rewrite($raw, $now, true);
            $smtp = $this->smtp();
            $account->SmtpConnectAndLogin($actions->Plugins(), $smtp);
            if ($smtp->Settings->usePhpMail) throw new \RuntimeException('the account sends through mail(), which has no queue');
            $dsn = '1' === \trim($headers->ValueByName(self::DSN));
            // Native composing writes TLS-Required: No unless the message asked for TLS.
            $requireTLS = 0 !== \strcasecmp('No', \trim($headers->ValueByName('TLS-Required')));
            $from = $headers->GetAsEmailCollection('From');
            $smtp->MailFrom($from && \count($from) ? $from[0]->GetEmail() : $account->Email(), 0, $dsn, $requireTLS);
            foreach ($recipients as $address) $smtp->Rcpt($address, $dsn);
            \rewind($outgoing['stream']);
            $smtp->DataWithStream($outgoing['stream']);
            $accepted = true;
            $smtp->Disconnect();
            // From here the message has left. Nothing below may let it be sent again.
            $client->MessageSetFlag($folder, $range, self::SENT, true, true);
            $this->file($imap, $settings, $folder, $range, $raw, $headers, $now, $outgoing, $report, $uid);
            ++$report['sent'];
        } catch (\Throwable $error) {
            if ($accepted) {
                $report['notes'][] = 'uid ' . $uid . ': sent, but not filed (' . $error->getMessage() . ')';
                ++$report['sent'];
                $this->logger->warning('Scheduled message sent but not filed', ['exception' => $error]);
                return;
            }
            $give = $entry['due'] !== null && $entry['due'] < $now - self::GIVE_UP;
            try {
                $client->MessageSetFlag($folder, $range, self::SENDING, false, true);
                if ($give) $client->MessageSetFlag($folder, $range, self::FAILED, true, true);
            } catch (\Throwable $ignored) {}
            ++$report[$give ? 'failed' : 'pending'];
            $report['notes'][] = 'uid ' . $uid . ($give ? ': abandoned (' : ': not sent, will retry (') . $error->getMessage() . ')';
            $this->logger->warning('Scheduled message not sent', ['exception' => $error]);
        }
    }

    /* Filing is what the native send does after SMTP: a copy in Sent, the reply flag on the
     * message that was answered, and the scheduled copy gone. */
    private function file($imap, $settings, string $folder, SequenceSet $range, $raw, HeaderCollection $headers,
        int $now, array $outgoing, array &$report, int $uid): void
    {
        $sent = (string) $settings->GetConf('SentFolder', '');
        if ($sent && $sent !== '__UNUSE__') {
            $copy = $outgoing['bcc'] ? $this->rewrite($raw, $now, false) : $outgoing;
            \rewind($copy['stream']);
            $imap->MessageAppendStream($sent, $copy['stream'], $copy['size'], [MessageFlag::SEEN]);
        }
        $imap->MessageDelete($folder, $range);
        // Read back the way the native message model reads it, parameters and all.
        $type = ''; $source = ''; $answered = 0;
        foreach (new \MailSo\Mime\ParameterCollection($headers->ValueByName('X-Draft-Info')) as $parameter) {
            switch (\strtolower($parameter->Name())) {
                case 'type': $type = \strtolower($parameter->Value()); break;
                case 'uid': $answered = (int) $parameter->Value(); break;
                case 'folder': $source = (string) \base64_decode($parameter->Value()); break;
            }
        }
        $flag = ['reply' => MessageFlag::ANSWERED, 'reply-all' => MessageFlag::ANSWERED, 'forward' => MessageFlag::FORWARDED][$type] ?? '';
        if ($flag && $source && $answered > 0) {
            try {
                $imap->FolderSelect($source);
                $imap->MessageStoreFlag(new SequenceSet([$answered]), [$flag], \MailSo\Imap\Enumerations\StoreAction::ADD_FLAGS_SILENT);
            } catch (\Throwable $error) {
                $report['notes'][] = 'uid ' . $uid . ': sent, reply flag not set';
            }
        }
    }

    protected function smtp()
    {
        $smtp = new \MailSo\Smtp\SmtpClient;
        $smtp->SetLogger(\RainLoop\Api::Logger());
        return $smtp;
    }

    /** @return resource */
    private function read($client, string $folder, int $uid)
    {
        $raw = \MailSo\Base\ResourceRegistry::CreateMemoryResource();
        $client->MessageMimeStream(function ($stream) use ($raw) {
            \MailSo\Base\Utils::WriteStream($stream, $raw);
        }, $folder, $uid, '');
        if (!\ftell($raw)) throw new \RuntimeException('the stored message could not be read');
        return $raw;
    }

    private function headerBlock($raw): string
    {
        \rewind($raw);
        $block = '';
        while (!\feof($raw)) {
            $block .= (string) \fread($raw, 8192);
            if (false !== \strpos($block, "\r\n\r\n")) break;
            if (\strlen($block) > 1048576) throw new \RuntimeException('the stored message has no header block');
        }
        $cut = \strpos($block, "\r\n\r\n");
        if (false === $cut) throw new \RuntimeException('the stored message has no header block');
        return \substr($block, 0, $cut + 2);
    }

    /* Header surgery, not reserialisation: every header the message keeps is copied byte for
     * byte, so boundaries, encodings and signatures survive exactly as the browser wrote them.
     * @return array{stream:resource,size:int,bcc:bool} */
    private function rewrite($raw, int $now, bool $forTransport): array
    {
        $block = $this->headerBlock($raw);
        $drop = self::PRIVATE_HEADERS;
        $drop[] = 'date';
        if ($forTransport) $drop[] = 'bcc';
        $bcc = false;
        $kept = [];
        foreach (\preg_split("/\r\n(?![ \t])/", \rtrim($block, "\r\n")) as $line) {
            $colon = \strpos($line, ':');
            $name = false === $colon ? '' : \strtolower(\trim(\substr($line, 0, $colon)));
            if ($name === 'bcc') $bcc = true;
            if (\in_array($name, $drop, true)) continue;
            $kept[] = $line;
        }
        // The date a recipient reads is the moment the message left, not the moment it was written.
        \array_unshift($kept, 'Date: ' . \gmdate('r', $now));
        $stream = \MailSo\Base\ResourceRegistry::CreateMemoryResource();
        \fwrite($stream, \implode("\r\n", $kept) . "\r\n\r\n");
        \fseek($raw, \strlen($block) + 2);
        \stream_copy_to_stream($raw, $stream);
        $size = \ftell($stream);
        \rewind($stream);
        return ['stream' => $stream, 'size' => (int) $size, 'bcc' => $bcc];
    }

    /** @return string[] */
    private function recipients(HeaderCollection $headers): array
    {
        $addresses = [];
        foreach (['To', 'Cc', 'Bcc'] as $name) {
            $collection = $headers->GetAsEmailCollection($name);
            if (!$collection) continue;
            foreach ($collection as $email) {
                $address = $email->GetEmail();
                if ($address !== '' && !\in_array($address, $addresses, true)) $addresses[] = $address;
            }
        }
        return $addresses;
    }
}
