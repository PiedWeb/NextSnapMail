<?php
/* Behaviour checks for server-side reminder wake-up. IMAP is simulated and no
 * mailbox, message body or SMTP connection is opened. */

namespace Psr\Log { interface LoggerInterface { public function warning($message, array $context = []); } }
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
    foreach ([str_replace('\\','/',$class),strtolower(str_replace('\\','/',$class))] as $name) {
        if (is_file($base . $name . '.php')) { require_once $base . $name . '.php'; return; }
    }
});
require __DIR__ . '/../app/piedwebmailscheduler/lib/Service/Sender.php';

use MailSo\Imap\SequenceSet;
use OCA\PiedWebMailScheduler\Service\Sender;
use SnappyMail\SensitiveString;

class ReminderLog implements \Psr\Log\LoggerInterface {
    public array $lines = [];
    public function warning($message, array $context = []): void { $this->lines[] = (string) $message; }
}
class ReminderFetch {
    public function __construct(private array $values) {}
    public function GetFetchValue(string $name) { return $this->values[$name] ?? null; }
    public function GetHeaderFieldsValue(): string { return ''; }
}
class ReminderServer {
    public array $folders = [], $messages = [], $moved = [], $stored = [];
    public string $selected = '', $delimiter = '.';
    public bool $failMove = false;
    private function ids(string $range): array {
        $ids = [];
        foreach (explode(',',$range) as $part) {
            if (str_contains($part,':')) {
                [$from,$to] = array_map('intval',explode(':',$part,2));
                foreach (range($from,$to) as $uid) $ids[] = $uid;
            } else $ids[] = (int) $part;
        }
        return $ids;
    }
    public function FolderHierarchyDelimiter(string $folder = '') { return $this->delimiter; }
    public function FolderStatusList(string $name, string $pattern) { return isset($this->folders[$name]) ? [$name=>true] : []; }
    public function FolderExamine(string $name, bool $force = false) { $this->selected = $name; return $this; }
    public function FolderSelect(string $name, bool $force = false) { $this->selected = $name; return $this; }
    public function IsFlagSupported(string $flag): bool { return true; }
    public function MessageSearch(string $criteria, bool $uid = true) { return array_keys($this->messages[$this->selected] ?? []); }
    public function Fetch(array $items, string $range, bool $uid) {
        $result = [];
        foreach ($this->ids($range) as $id) {
            $message = $this->messages[$this->selected][$id] ?? null;
            if ($message) $result[] = new ReminderFetch(['UID'=>$id,'FLAGS'=>$message['flags']]);
        }
        return $result;
    }
    public function MessageStoreFlag(SequenceSet $range, array $flags, string $action) {
        foreach ($this->ids((string) $range) as $uid) {
            $this->stored[] = [$this->selected,$uid,$flags,$action];
            if (!isset($this->messages[$this->selected][$uid])) continue;
            $current = $this->messages[$this->selected][$uid]['flags'];
            if (str_contains($action,'REMOVE')) {
                $drop = array_map('strtolower',$flags);
                $current = array_values(array_filter($current,fn($flag)=>!in_array(strtolower($flag),$drop,true)));
            } else $current = array_values(array_unique(array_merge($current,$flags)));
            $this->messages[$this->selected][$uid]['flags'] = $current;
        }
    }
    public function MessageMove(string $from, string $to, SequenceSet $range) {
        if ($this->failMove) throw new RuntimeException('offline');
        foreach ($this->ids((string) $range) as $uid) {
            $this->messages[$to][$uid] = $this->messages[$from][$uid]; unset($this->messages[$from][$uid]);
        }
        $this->moved[] = [$from,$to,(string) $range];
    }
    public function Disconnect() {}
}
class ReminderMailClient {
    public function __construct(private ReminderServer $imap) {}
    public function MessageSetFlag(string $folder, SequenceSet $range, string $flag, bool $set = true, bool $skip = false): void {
        $this->imap->FolderSelect($folder);
        $this->imap->MessageStoreFlag($range,[$flag],$set ? '+FLAGS.SILENT' : 'REMOVE_FLAGS_SILENT');
    }
}
class ReminderConfig {
    public array $conf = ['DraftsFolder'=>'INBOX.Brouillons','SentFolder'=>'INBOX.Envoyes'];
    public function GetConf(string $name, $default = '') { return $this->conf[$name] ?? $default; }
}
class ReminderMailbox {
    public function __construct(public string $email) {}
    public function Email(): string { return $this->email; }
    public function ImapConnectAndLogin(...$args) { return true; }
}
class ReminderRuntime {
    public function __construct(public ReminderServer $imap, public ReminderMailClient $client, public ReminderConfig $settings) {}
    public function ImapClient() { return $this->imap; }
    public function MailClient() { return $this->client; }
    public function Plugins() { return null; }
    public function Config() { return null; }
    public function SettingsProvider(bool $local = false) { return $this; }
    public function logMask($value) {}
    public function Load($account) { return $this->settings; }
}
class ReminderSender extends Sender {
    protected function account($actions, string $email, SensitiveString $password) { return new ReminderMailbox($email); }
}

$n = 0;
$check = function ($ok, string $label) use (&$n) {
    if (!$ok) throw new RuntimeException('FAIL ' . $label);
    ++$n; echo "PASS $label\n";
};
$now = (new DateTimeImmutable('2026-09-18T12:00:00Z'))->getTimestamp();
$keyword = fn(int $when) => Sender::REMINDER_PREFIX . strtolower(base_convert((string) $when,10,36));
$world = function (array $messages) {
    $imap = new ReminderServer;
    $imap->folders = ['INBOX'=>true,'INBOX.Brouillons'=>true,'INBOX.Reminders'=>true];
    $imap->messages = ['INBOX'=>[],'INBOX.Reminders'=>$messages];
    $settings = new ReminderConfig; $client = new ReminderMailClient($imap);
    \RainLoop\Api::$actions = new ReminderRuntime($imap,$client,$settings);
    return [$imap,$settings];
};
$run = function ($imap, int $now, bool $dry = false, ?ReminderLog $log = null) {
    $sender = new ReminderSender($log ?: new ReminderLog);
    return $sender->mailbox('robin@example.test',new SensitiveString('secret'),$now,$dry);
};

[$imap,$settings] = $world([]); $probe = new ReminderSender(new ReminderLog);
$check($probe->reminderFolder($imap,$settings) === 'INBOX.Reminders', 'The worker resolves the same sibling folder as the plugin');
$settings->conf['DraftsFolder'] = 'INBOX/Drafts'; $imap->delimiter = '/';
$check($probe->reminderFolder($imap,$settings) === 'INBOX/Reminders', 'The server delimiter is respected');

$past = $now - 60; $future = $now + 3600;
[$imap] = $world([
    7=>['flags'=>['\\Seen',$keyword($past)]],
    8=>['flags'=>['\\Seen',$keyword($future)]],
    9=>['flags'=>['\\Seen']],
]);
$report = $run($imap,$now);
$check($report['reminded'] === 1 && $report['reminderPending'] === 1, 'One due reminder wakes while one future reminder waits');
$check($report['next'] === $future, 'The next reminder instant drives the next poll');
$check(isset($imap->messages['INBOX'][7]) && !isset($imap->messages['INBOX.Reminders'][7]), 'A due message returns to Inbox');
$check(!in_array('\\Seen',$imap->messages['INBOX'][7]['flags'],true), 'The returning message is unread');
$check(!array_filter($imap->messages['INBOX'][7]['flags'],fn($flag)=>str_starts_with(strtolower($flag),Sender::REMINDER_PREFIX)),
    'The due keyword is removed before the move');
$check(isset($imap->messages['INBOX.Reminders'][8]), 'A future reminder stays in the reminders folder');
$check(count($report['notes']) === 1 && str_contains($report['notes'][0],'no reminder time'), 'An unstamped folder message is reported and left alone');

[$imap] = $world([7=>['flags'=>['\\Seen',$keyword($past)]]]);
$report = $run($imap,$now,true);
$check($report['reminded'] === 0 && $report['reminderPending'] === 1 && $imap->moved === [] && $imap->stored === [],
    'A dry run reports a due reminder without touching it');

[$imap] = $world([7=>['flags'=>['\\Seen',$keyword($past)]]]); $imap->failMove = true; $log = new ReminderLog;
$report = $run($imap,$now,false,$log);
$flags = $imap->messages['INBOX.Reminders'][7]['flags'];
$check($report['reminded'] === 0 && $report['reminderPending'] === 1 && $report['next'] === $now + 60,
    'A failed restore is retried on the next minute');
$check(in_array($keyword($past),$flags,true) && isset($imap->messages['INBOX.Reminders'][7]),
    'A failed move restores the due keyword and keeps the message in Reminders');
$check(in_array('\\Seen',$flags,true), 'A failed restore keeps the waiting message read');
$check(count($log->lines) === 1, 'A failed restore is logged once');

echo "\n$n checks passed\n";
}
