<?php
/* Behaviour checks for the scheduled sender, against the native MailSo header parser,
 * sequence sets and stream helpers. IMAP and SMTP transport are simulated: no mailbox is
 * opened and no message is sent. Addresses and content are fictional. */

namespace Psr\Log {
    interface LoggerInterface { public function warning($message, array $context = []); }
}

namespace RainLoop {
    class Api {
        public static $actions;
        public static function Actions() { return self::$actions; }
        public static function Logger() { return null; }
    }
}

namespace {

spl_autoload_register(function ($class) {
    $base = getenv('NEXTSNAPMAIL_SOURCE') . '/app/snappymail/v/2.38.2/app/libraries/';
    foreach ([str_replace('\\', '/', $class), strtolower(str_replace('\\', '/', $class))] as $name) {
        if (is_file($base . $name . '.php')) { require_once $base . $name . '.php'; return; }
    }
});
require __DIR__ . '/../app/piedwebmailscheduler/lib/Service/Sender.php';

use MailSo\Imap\SequenceSet;
use OCA\PiedWebMailScheduler\Service\Sender;
use SnappyMail\SensitiveString;

$n = 0;
$check = function ($ok, $label) use (&$n) {
    if (!$ok) throw new \RuntimeException('FAIL ' . $label);
    ++$n; echo "PASS $label\n";
};

class Log implements \Psr\Log\LoggerInterface {
    public array $lines = [];
    public function warning($message, array $context = []): void { $this->lines[] = (string) $message; }
}

class Response {
    public function __construct(private array $values, private string $headers) {}
    public function GetFetchValue(string $name) { return $this->values[$name] ?? null; }
    public function GetHeaderFieldsValue(): string { return $this->headers; }
}

class Journal {
    public array $lines = [];
    public function add(string $line): void { $this->lines[] = $line; }
    public function at(string $line): int { $index = array_search($line, $this->lines, true); return $index === false ? PHP_INT_MAX : $index; }
}

class Imap {
    public array $messages = [], $folders = [], $appended = [], $deleted = [], $stored = [], $trace = [];
    public Journal $journal;
    public string $selected = '', $delimiter = '.';
    public bool $writable = false, $keywords = true;
    public function __construct(?Journal $journal = null) { $this->journal = $journal ?: new Journal; }
    public function FolderHierarchyDelimiter(string $folder = '') { return $this->delimiter; }
    public function FolderStatusList(string $name, string $pattern) { return isset($this->folders[$name]) ? [$name => true] : []; }
    public function FolderExamine(string $name, bool $force = false) { $this->selected = $name; $this->writable = false; return $this; }
    public function FolderSelect(string $name, bool $force = false) { $this->selected = $name; $this->writable = true; return $this; }
    public function IsFlagSupported(string $flag): bool { return $this->keywords || !str_starts_with($flag, '$'); }
    public function MessageSearch(string $criteria, bool $uid = true) { $this->journal->add('search'); return array_keys($this->messages); }
    public function Fetch(array $items, string $range, bool $uid) {
        $out = [];
        foreach (explode(',', $range) as $id) {
            $message = $this->messages[(int) $id] ?? null;
            if (!$message) continue;
            $headers = '';
            foreach (explode("\r\n", explode("\r\n\r\n", $message['raw'], 2)[0]) as $line) {
                if (stripos($line, Sender::HEADER . ':') === 0) $headers .= $line . "\r\n";
            }
            $out[] = new Response(['UID' => (int) $id, 'FLAGS' => $message['flags']], $headers);
        }
        return $out;
    }
    public function MessageStoreFlag(SequenceSet $range, array $flags, string $action) {
        if (!$this->writable) throw new \RuntimeException('folder is read-only');
        foreach (explode(',', (string) $range) as $uid) {
            $this->journal->add('flag ' . $this->selected . ' ' . $uid . ' ' . implode(',', $flags) . ' ' . $action);
            $this->stored[] = [$this->selected, (int) $uid, $flags, $action];
            if (!isset($this->messages[(int) $uid])) continue;
            $current = $this->messages[(int) $uid]['flags'];
            $lower = array_map('strtolower', $flags);
            $this->messages[(int) $uid]['flags'] = str_contains($action, 'REMOVE')
                ? array_values(array_diff($current, $lower)) : array_values(array_unique(array_merge($current, $lower)));
        }
        return null;
    }
    public function MessageAppendStream(string $folder, $stream, int $size, ?array $flags = null, int $date = 0) {
        $this->journal->add('append ' . $folder);
        rewind($stream);
        $this->appended[] = [$folder, stream_get_contents($stream), $flags];
        return 1;
    }
    public function MessageDelete(string $folder, SequenceSet $range, bool $all = false) {
        foreach (explode(',', (string) $range) as $uid) { $this->journal->add('delete ' . $folder . ' ' . $uid); $this->deleted[] = [$folder, (int) $uid]; unset($this->messages[(int) $uid]); }
    }
    public function Disconnect() {}
}

class Client {
    public function __construct(public Imap $imap) {}
    public function MessageSetFlag(string $folder, SequenceSet $range, string $flag, bool $set = true, bool $skip = false): void {
        $information = $this->imap->FolderSelect($folder);
        if (!$information->IsFlagSupported($flag)) {
            if ($skip) return;
            throw new \MailSo\RuntimeException('Message flag "' . $flag . '" is not supported.');
        }
        $this->imap->MessageStoreFlag($range, [$flag], $set ? 'FLAGS.SILENT +' : 'FLAGS.SILENT REMOVE');
    }
    public function MessageMimeStream($callback, string $folder, int $uid, string $index): bool {
        $this->imap->FolderExamine($folder);
        $stream = fopen('php://temp', 'r+b');
        fwrite($stream, $this->imap->messages[$uid]['raw']); rewind($stream);
        $callback($stream);
        return true;
    }
}

class Settings {
    public array $conf = [];
    public function GetConf(string $name, $default = '') { return $this->conf[$name] ?? $default; }
}

class Smtp {
    public Journal $journal;
    public array $trace = [], $rcpt = [];
    public string $from = '', $data = '';
    public bool $dsn = false, $requireTLS = false, $connected = false;
    public $Settings;
    public $failAt = '';
    public function __construct(?Journal $journal = null) {
        $this->journal = $journal ?: new Journal;
        $this->Settings = new class { public bool $usePhpMail = false; };
    }
    public function SetLogger($logger) {}
    public function Connected() { return $this->connected; }
    public function MailFrom(string $from, int $size = 0, bool $dsn = false, bool $requireTLS = false) {
        if ($this->failAt === 'from') throw new \RuntimeException('550 sender rejected');
        $this->trace[] = 'from'; $this->journal->add('smtp from'); $this->from = $from; $this->dsn = $dsn; $this->requireTLS = $requireTLS; return $this;
    }
    public function Rcpt(string $to, bool $dsn = false) {
        if ($this->failAt === 'rcpt') throw new \RuntimeException('451 try later');
        $this->trace[] = 'rcpt'; $this->journal->add('smtp rcpt'); $this->rcpt[] = $to; return $this;
    }
    public function DataWithStream($stream) {
        if ($this->failAt === 'data') throw new \RuntimeException('452 out of space');
        $this->trace[] = 'data'; $this->journal->add('smtp data'); rewind($stream); $this->data = stream_get_contents($stream); return $this;
    }
    public function Disconnect() { $this->trace[] = 'quit'; $this->journal->add('smtp quit'); }
}

class Account {
    public function __construct(public string $email) {}
    public function Email(): string { return $this->email; }
    public function ImapConnectAndLogin(...$args) { return true; }
    public function SmtpConnectAndLogin(...$args) { return true; }
}

class Actions {
    public function __construct(public Imap $imap, public Client $client, public Settings $settings) {}
    public function ImapClient() { return $this->imap; }
    public function MailClient() { return $this->client; }
    public function Plugins() { return null; }
    public function Config() { return null; }
    public function SettingsProvider(bool $local = false) { return $this; }
    public function logMask($value) {}
    public function Load($account) { return $this->settings; }
}

class TestSender extends Sender {
    public Smtp $smtp;
    public function __construct($logger, Smtp $smtp) { parent::__construct($logger); $this->smtp = $smtp; }
    protected function account($actions, string $email, SensitiveString $password) { return new Account($email); }
    protected function smtp() { return $this->smtp; }
}

$body = "--pw-boundary-1\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBonjour Alice,\r\nÀ demain.\r\n\r\n--pw-boundary-1--\r\n";
$message = function (string $at, array $extra = []) use ($body) {
    $headers = array_merge([
        'From: Robin <robin@example.test>',
        'To: Alice <alice@example.test>, bob@example.test',
        'Cc: carol@example.test',
        'Bcc: dan@example.test',
        'References: <a@example.test>' . "\r\n" . ' <b@example.test>',
        'Subject: =?UTF-8?Q?Rendez-vous?=',
        'Date: Mon, 14 Sep 2026 09:12:00 +0000',
        'Message-ID: <abc@example.test>',
        'X-Draft-Info: type=reply; uid=42; folder=' . base64_encode('INBOX'),
        'TLS-Required: No',
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="pw-boundary-1"',
    ], $at === '' ? [] : [Sender::HEADER . ': ' . $at], $extra);
    return implode("\r\n", $headers) . "\r\n\r\n" . $body;
};
$now = (new DateTimeImmutable('2026-09-18T06:00:30Z'))->getTimestamp();
$due = '2026-09-18T06:00:00Z';

$world = function (array $messages, array $conf = []) {
    $imap = new Imap(new Journal);
    $imap->folders = ['INBOX.Brouillons' => true, 'INBOX.Scheduled' => true, 'INBOX.Envoyes' => true];
    $imap->messages = $messages;
    $settings = new Settings;
    $settings->conf = array_merge(['DraftsFolder' => 'INBOX.Brouillons', 'SentFolder' => 'INBOX.Envoyes',
        'TrashFolder' => 'INBOX.Corbeille'], $conf);
    $client = new Client($imap);
    \RainLoop\Api::$actions = new Actions($imap, $client, $settings);
    return [$imap, $settings];
};
$run = function ($imap, $smtp, $now, $dryRun = false) {
    $sender = new TestSender(new Log, $smtp);
    return $sender->mailbox('robin@example.test', new SensitiveString('secret'), $now, $dryRun);
};

// The queue is a sibling of the account's own Drafts folder, never a system folder.
[$imap, $settings] = $world([]);
$probe = new TestSender(new Log, new Smtp);
$check($probe->folder($imap, $settings) === 'INBOX.Scheduled', 'The queue is a sibling of Drafts');
$settings->conf['DraftsFolder'] = 'Drafts'; $imap->delimiter = '/';
$check($probe->folder($imap, $settings) === 'Scheduled', 'A root Drafts folder gives a root queue');
$settings->conf['DraftsFolder'] = 'INBOX/Drafts';
$check($probe->folder($imap, $settings) === 'INBOX/Scheduled', 'The server delimiter is used, not a guess');
foreach ([['DraftsFolder' => ''], ['DraftsFolder' => '__UNUSE__'], ['DraftsFolder' => 'INBOX']] as $broken) {
    $settings->conf = array_merge($settings->conf, $broken);
    try { $probe->folder($imap, $settings); $failed = false; } catch (\Throwable $error) { $failed = true; }
    $check($failed, 'No queue without a usable Drafts folder: ' . json_encode($broken));
}
$settings->conf['DraftsFolder'] = 'INBOX/Drafts'; $settings->conf['SentFolder'] = 'INBOX/Scheduled';
try { $probe->folder($imap, $settings); $failed = false; } catch (\Throwable $error) { $failed = true; }
$check($failed, 'A queue that is also Sent is refused');

// A due message: claimed first, then sent, then filed, then gone.
[$imap] = $world([7 => ['flags' => [], 'raw' => $message($due)]]);
$smtp = new Smtp($imap->journal);
$report = $run($imap, $smtp, $now);
$check($imap->journal->at('flag INBOX.Scheduled 7 $pwsending FLAGS.SILENT +') < $imap->journal->at('smtp from'),
    'The claim is stored before anything is offered to SMTP');
$check($smtp->trace === ['from','rcpt','rcpt','rcpt','rcpt','data','quit'], 'One transaction, one recipient per address');
$check($report['sent'] === 1 && $report['failed'] === 0, 'The due message is reported as sent');
$check($smtp->from === 'robin@example.test', 'The envelope sender is the From address');
$check($smtp->rcpt === ['alice@example.test','bob@example.test','carol@example.test','dan@example.test'],
    'To, Cc and Bcc are all envelope recipients');
$check($smtp->requireTLS === false && $smtp->dsn === false, 'TLS-Required: No and no DSN are carried through');
[$sentHeaders, $sentBody] = explode("\r\n\r\n", $smtp->data, 2);
$check($sentBody === $body, 'The body is transmitted byte for byte');
$check(!preg_match('/^Bcc:/mi', $sentHeaders), 'The transmitted copy carries no Bcc');
$check(!stripos($sentHeaders, 'X-Draft-Info') && !stripos($sentHeaders, Sender::HEADER), 'Private headers do not leave');
$check(substr_count($sentHeaders, 'Date:') === 1 && str_contains($sentHeaders, 'Date: ' . gmdate('r', $now)),
    'The date a recipient reads is the moment the message left');
$check(str_contains($sentHeaders, "References: <a@example.test>\r\n <b@example.test>"), 'Folded headers keep their folding');
$check(str_contains($sentHeaders, 'Content-Type: multipart/alternative; boundary="pw-boundary-1"'), 'The MIME boundary is untouched');
$check(count($imap->appended) === 1 && $imap->appended[0][0] === 'INBOX.Envoyes', 'A copy is filed in Sent');
$check(preg_match('/^Bcc: dan@example.test/mi', $imap->appended[0][1]) === 1, 'The filed copy keeps the Bcc the author wrote');
$check(!stripos($imap->appended[0][1], Sender::HEADER), 'The filed copy carries no send time');
$check($imap->deleted === [['INBOX.Scheduled', 7]], 'The scheduled copy is gone once it is sent');
$check(in_array(['INBOX', 42, ['\\Answered'], '+FLAGS.SILENT'], $imap->stored, true), 'The message that was answered is flagged');
$check($imap->journal->at('smtp data') < $imap->journal->at('flag INBOX.Scheduled 7 $pwsent FLAGS.SILENT +')
    && $imap->journal->at('flag INBOX.Scheduled 7 $pwsent FLAGS.SILENT +') < $imap->journal->at('append INBOX.Envoyes')
    && $imap->journal->at('append INBOX.Envoyes') < $imap->journal->at('delete INBOX.Scheduled 7'),
    'Sent, marked, filed, removed, in that order');

// Held messages are the sender's own residue and are never sent again.
foreach (['$pwsending', '$pwsent', '$pwsendfailed'] as $flag) {
    [$imap] = $world([7 => ['flags' => [$flag], 'raw' => $message($due)]]);
    $smtp = new Smtp($imap->journal);
    $report = $run($imap, $smtp, $now);
    $check($smtp->trace === [] && $report['held'] === 1 && $report['sent'] === 0, 'A message marked ' . $flag . ' is left alone');
}

// Not due yet, and the earliest time is reported so the next pass knows when to come back.
[$imap] = $world([7 => ['flags' => [], 'raw' => $message('2026-09-18T08:00:00Z')],
    8 => ['flags' => [], 'raw' => $message('2026-09-18T07:00:00Z')]]);
$smtp = new Smtp($imap->journal);
$report = $run($imap, $smtp, $now);
$check($smtp->trace === [] && $report['pending'] === 2, 'A message before its time is not sent');
$check($report['next'] === (new DateTimeImmutable('2026-09-18T07:00:00Z'))->getTimestamp(), 'The earliest due time is reported');

// A message with no due time is reported, never sent.
[$imap] = $world([7 => ['flags' => [], 'raw' => $message('')]]);
$smtp = new Smtp($imap->journal);
$report = $run($imap, $smtp, $now);
$check($smtp->trace === [] && $report['sent'] === 0 && count($report['notes']) === 1, 'A message without a send time waits for its author');

// A refused transaction releases the claim so the next pass can retry.
[$imap] = $world([7 => ['flags' => [], 'raw' => $message($due)]]);
$smtp = new Smtp($imap->journal); $smtp->failAt = 'rcpt';
$report = $run($imap, $smtp, $now);
$check($report['sent'] === 0 && $report['pending'] === 1 && $report['failed'] === 0, 'A refused send is retried, not abandoned');
$check(!in_array('$pwsending', $imap->messages[7]['flags'], true), 'The claim is released when nothing was sent');
$check($imap->deleted === [] && $imap->appended === [], 'Nothing is filed or deleted when nothing was sent');

// A message still refused a day later is abandoned rather than retried forever.
[$imap] = $world([7 => ['flags' => [], 'raw' => $message('2026-09-16T06:00:00Z')]]);
$smtp = new Smtp($imap->journal); $smtp->failAt = 'from';
$report = $run($imap, $smtp, $now);
$check($report['failed'] === 1 && in_array('$pwsendfailed', $imap->messages[7]['flags'], true), 'A day-old failure is abandoned');

// Accepted by SMTP but not filed: sent once, never again, and said so.
[$imap] = $world([7 => ['flags' => [], 'raw' => $message($due)]], ['SentFolder' => 'INBOX.Missing']);
$imap->folders['INBOX.Missing'] = true;
$smtp = new Smtp($imap->journal);
$brokenImap = new class($imap) extends Imap {
    public function __construct(public Imap $inner) { parent::__construct($inner->journal); $this->messages = $inner->messages; $this->folders = $inner->folders; }
    public function MessageAppendStream(string $folder, $stream, int $size, ?array $flags = null, int $date = 0) {
        throw new \RuntimeException('over quota');
    }
};
\RainLoop\Api::$actions = new Actions($brokenImap, new Client($brokenImap), (function () {
    $settings = new Settings;
    $settings->conf = ['DraftsFolder' => 'INBOX.Brouillons', 'SentFolder' => 'INBOX.Envoyes'];
    return $settings;
})());
$report = (new TestSender(new Log, $smtp))->mailbox('robin@example.test', new SensitiveString('secret'), $now);
$check($report['sent'] === 1 && count($report['notes']) === 1 && str_contains($report['notes'][0], 'not filed'),
    'A message that left but could not be filed is reported as sent');
$check(in_array('$pwsent', $brokenImap->messages[7]['flags'], true) && $brokenImap->deleted === [],
    'It keeps the sent mark, so no later pass can send it twice');

// A mailbox whose server refuses keywords is left untouched: at-most-once cannot be promised.
[$imap] = $world([7 => ['flags' => [], 'raw' => $message($due)]]);
$imap->keywords = false;
$smtp = new Smtp($imap->journal);
$report = $run($imap, $smtp, $now);
$check($smtp->trace === [] && $report['sent'] === 0 && str_contains($report['notes'][0] ?? '', 'cannot claim'),
    'Without custom keywords nothing is sent');

// A dry run reports and touches nothing.
[$imap] = $world([7 => ['flags' => [], 'raw' => $message($due)]]);
$smtp = new Smtp($imap->journal);
$report = $run($imap, $smtp, $now, true);
$check($smtp->trace === [] && $imap->stored === [] && $report['pending'] === 1, 'A dry run sends nothing and claims nothing');

// DSN and TLS-Required travel with the message, not with the request that scheduled it.
[$imap] = $world([7 => ['flags' => [], 'raw' => str_replace("TLS-Required: No\r\n", '', $message($due, [Sender::DSN . ': 1']))]]);
$smtp = new Smtp($imap->journal);
$run($imap, $smtp, $now);
$check($smtp->dsn === true && $smtp->requireTLS === true, 'A message asking for DSN and TLS gets both');

echo "\n$n checks passed\n";
}
