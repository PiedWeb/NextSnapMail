<?php
/* Behaviour checks for the reminder endpoint. IMAP is simulated, content is fictional,
 * and no mailbox is opened or changed. */

namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public function Manager() { return new class { public function JsonResponseHelper($name, $data) { return $data; } }; }
    }
}
namespace RainLoop { class Api { public static $actions; public static function Actions() { return self::$actions; } } }
namespace {
    spl_autoload_register(function ($class) {
        $base = getenv('NEXTSNAPMAIL_SOURCE') . '/app/snappymail/v/2.38.2/app/libraries/';
        foreach ([str_replace('\\', '/', $class), strtolower(str_replace('\\', '/', $class))] as $name) {
            if (is_file($base . $name . '.php')) { require_once $base . $name . '.php'; return; }
        }
    });
    $private = sys_get_temp_dir() . '/pw-reminder-fixture-' . getmypid() . '/';
    mkdir($private . 'pied-web-ux/scheduled', 0700, true);
    define('APP_PRIVATE_DATA', $private);
    file_put_contents($private . 'pied-web-ux/scheduled/sender.json', json_encode(['at' => time()]));
    require __DIR__ . '/../plugin/pied-web-ux/index.php';
    require __DIR__ . '/../plugin/pied-web-ux/Reminders.php';

    use MailSo\Imap\SequenceSet;

    class ReminderResponse {
        public function __construct(private array $values) {}
        public function GetFetchValue(string $name) { return $this->values[$name] ?? null; }
    }
    class ReminderImap {
        public array $folders = [], $messages = [], $moved = [], $stored = [];
        public string $delimiter = '.', $selected = '';
        public bool $keywords = true, $failMove = false;
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
        public function FolderStatusList(string $name, string $pattern) { return isset($this->folders[$name]) ? [$name => true] : []; }
        public function FolderExamine(string $name, bool $force = false) { $this->selected = $name; return $this; }
        public function FolderSelect(string $name, bool $force = false) { $this->selected = $name; return $this; }
        public function IsFlagSupported(string $flag): bool { return $this->keywords || !str_starts_with($flag, '$'); }
        public function MessageSearch(string $criteria, bool $uid = true) { return array_keys($this->messages[$this->selected] ?? []); }
        public function Fetch(array $items, string $range, bool $uid) {
            $responses = [];
            foreach ($this->ids($range) as $id) {
                $message = $this->messages[$this->selected][$id] ?? null;
                if ($message) $responses[] = new ReminderResponse(['UID' => $id, 'FLAGS' => $message['flags']]);
            }
            return $responses;
        }
        public function MessageStoreFlag(SequenceSet $range, array $flags, string $action) {
            foreach ($this->ids((string) $range) as $uid) {
                $this->stored[] = [$this->selected,$uid,$flags,$action];
                if (!isset($this->messages[$this->selected][$uid])) continue;
                $current = $this->messages[$this->selected][$uid]['flags'];
                if (str_contains($action, 'REMOVE')) {
                    $lower = array_map('strtolower',$flags);
                    $current = array_values(array_filter($current, fn($flag) => !in_array(strtolower($flag),$lower,true)));
                } else $current = array_values(array_unique(array_merge($current,$flags)));
                $this->messages[$this->selected][$uid]['flags'] = $current;
            }
        }
        public function MessageMove(string $from, string $to, SequenceSet $range) {
            if ($this->failMove) throw new RuntimeException('offline');
            foreach ($this->ids((string) $range) as $uid) {
                if (!isset($this->messages[$from][$uid])) throw new RuntimeException('missing');
                $this->messages[$to][$uid] = $this->messages[$from][$uid]; unset($this->messages[$from][$uid]);
            }
            $this->folders[$to] = true; $this->moved[] = [$from,$to,(string) $range];
        }
    }
    class ReminderClient {
        public array $created = [];
        public function __construct(private ReminderImap $imap) {}
        public function FolderCreate(string $name, string $parent = '', bool $subscribe = true, string $delimiter = '') {
            $this->created[] = [$name,$parent,$subscribe];
            $this->imap->folders[($parent === '' ? '' : $parent . $this->imap->delimiter) . $name] = true;
        }
        public function MessageSetFlag(string $folder, SequenceSet $range, string $flag, bool $set = true, bool $skip = false): void {
            $info = $this->imap->FolderSelect($folder);
            if (!$info->IsFlagSupported($flag)) {
                if ($skip) return;
                throw new RuntimeException('unsupported');
            }
            $this->imap->MessageStoreFlag($range,[$flag],$set ? '+FLAGS.SILENT' : 'REMOVE_FLAGS_SILENT');
        }
    }
    class ReminderSettings {
        public array $conf = ['DraftsFolder'=>'INBOX.Brouillons','SentFolder'=>'INBOX.Envoyes','TrashFolder'=>'INBOX.Corbeille'];
        public function GetConf(string $name, $default = '') { return $this->conf[$name] ?? $default; }
    }
    class ReminderAccount {
        public function Email(): string { return 'robin@example.test'; }
        public function ImapConnectAndLogin(...$args) { return true; }
    }
    class ReminderActions {
        public array $params = [];
        public $account;
        public ReminderImap $imap;
        public ReminderClient $client;
        public ReminderSettings $settings;
        public function __construct() {
            $this->account = new ReminderAccount; $this->imap = new ReminderImap;
            $this->client = new ReminderClient($this->imap); $this->settings = new ReminderSettings;
            $this->imap->folders = ['INBOX'=>true,'INBOX.Brouillons'=>true,'INBOX.Envoyes'=>true];
            $this->imap->messages['INBOX'] = [];
        }
        public function getAccountFromToken($throw = true) { return $this->account; }
        public function GetActionParam($name, $default = null) { return $this->params[$name] ?? $default; }
        public function SettingsProvider(bool $local = false) { return $this; }
        public function Load($account) { return $this->settings; }
        public function ImapClient() { return $this->imap; }
        public function MailClient() { return $this->client; }
        public function Plugins() { return null; }
        public function Config() { return null; }
    }

    $n = 0;
    $check = function ($ok, string $label) use (&$n) {
        if (!$ok) throw new RuntimeException('FAIL ' . $label);
        ++$n; echo "PASS $label\n";
    };
    $actions = new ReminderActions; \RainLoop\Api::$actions = $actions;
    $plugin = new PiedWebUxPlugin; $_SERVER['REQUEST_METHOD'] = 'POST';
    $soon = time() + 7 * 86400;
    $iso = gmdate('Y-m-d\TH:i:s\Z',$soon);

    $actions->params = ['operation'=>'folder'];
    $folder = $plugin->Reminders();
    $check($folder['folder'] === 'INBOX.Reminders', 'The reminders folder is a sibling of Drafts');
    $check($actions->client->created === [['Reminders','INBOX',true]], 'The folder is created and subscribed once');
    $check($folder['sender'] > 0, 'The endpoint reports the running server-side reminder service');

    $actions->imap->messages['INBOX'] = [7=>['flags'=>['\\Seen']],8=>['flags'=>[]]];
    $actions->params = ['operation'=>'set','uids'=>'7,8','remindAt'=>$iso];
    $result = $plugin->Reminders();
    $keyword = PiedWebReminders::keyword($soon);
    $check(($result['count'] ?? 0) === 2 && ($result['folder'] ?? '') === 'INBOX.Reminders',
        'Two selected messages receive one reminder');
    $check(!isset($actions->imap->messages['INBOX'][7]) && isset($actions->imap->messages['INBOX.Reminders'][7]),
        'A reminded message leaves Inbox for the dedicated folder');
    $check(in_array($keyword,$actions->imap->messages['INBOX.Reminders'][7]['flags'],true), 'The due instant travels as an IMAP keyword');
    $check(in_array('\\Seen',$actions->imap->messages['INBOX.Reminders'][8]['flags'],true), 'An unread message becomes read while it waits');
    $hint = APP_PRIVATE_DATA . 'pied-web-ux/scheduled/' . hash('sha256','robin@example.test') . '.json';
    $check((int) json_decode((string) file_get_contents($hint),true)['due'] === $soon, 'The cron runner is told the earliest due instant');

    $actions->params = ['operation'=>'list'];
    $list = $plugin->Reminders();
    $check(count($list['entries']) === 2 && $list['entries'][0]['state'] === 'pending', 'The folder list exposes reminder dates, not message content');
    $check($list['entries'][0]['remindAt'] === $iso, 'The IMAP keyword is read back as a UTC instant');

    $later = $soon + 86400; $laterIso = gmdate('Y-m-d\TH:i:s\Z',$later);
    $actions->params = ['operation'=>'reschedule','uids'=>'7','remindAt'=>$laterIso];
    $plugin->Reminders();
    $flags = $actions->imap->messages['INBOX.Reminders'][7]['flags'];
    $check(in_array(PiedWebReminders::keyword($later),$flags,true) && !in_array($keyword,$flags,true), 'Rescheduling replaces the old due keyword');

    $actions->params = ['operation'=>'wake','uids'=>'7'];
    $wake = $plugin->Reminders();
    $check($wake === ['folder'=>'INBOX','count'=>1], 'Wake now reports the restored message');
    $flags = $actions->imap->messages['INBOX'][7]['flags'];
    $check(!in_array('\\Seen',$flags,true), 'A restored message is unread');
    $check(PiedWebReminders::timeFromFlags($flags) === null, 'A restored message keeps no reminder keyword');

    $actions->imap->messages['INBOX'][10] = ['flags'=>[]]; $actions->imap->failMove = true;
    $actions->params = ['operation'=>'set','uids'=>'10','remindAt'=>$iso];
    $check(($plugin->Reminders()['error'] ?? '') === 'move', 'A failed move is reported');
    $flags = $actions->imap->messages['INBOX'][10]['flags'];
    $check(!in_array('\\Seen',$flags,true) && PiedWebReminders::timeFromFlags($flags) === null,
        'A failed move restores the unread Inbox state and removes the reminder keyword');
    $actions->params = ['operation'=>'wake','uids'=>'8'];
    $check(($plugin->Reminders()['error'] ?? '') === 'move', 'A failed manual wake is reported');
    $flags = $actions->imap->messages['INBOX.Reminders'][8]['flags'];
    $check(in_array('\\Seen',$flags,true) && PiedWebReminders::timeFromFlags($flags) !== null,
        'A failed manual wake remains read and scheduled in Reminders');
    $actions->imap->failMove = false;

    foreach (['', 'tomorrow', gmdate('Y-m-d\TH:i:s\Z',time()-3600), gmdate('Y-m-d\TH:i:s\Z',time()+500*86400)] as $bad) {
        $actions->params = ['operation'=>'set','uids'=>'8','remindAt'=>$bad];
        $check(($plugin->Reminders()['error'] ?? '') === 'time', 'An unusable reminder time is refused: ' . var_export($bad,true));
    }
    foreach (['', '0', '-1', 'x', '1,,2'] as $bad) {
        $actions->params = ['operation'=>'set','uids'=>$bad,'remindAt'=>$iso];
        $check(($plugin->Reminders()['error'] ?? '') === 'scope', 'An unusable UID set is refused: ' . var_export($bad,true));
    }
    $actions->params = ['operation'=>'set','uids'=>'99','remindAt'=>$iso];
    $check(($plugin->Reminders()['error'] ?? '') === 'missing', 'A vanished Inbox message is not scheduled');

    $actions->imap->messages['INBOX'][9] = ['flags'=>[]]; $actions->imap->keywords = false;
    $actions->params = ['operation'=>'set','uids'=>'9','remindAt'=>$iso];
    $check(($plugin->Reminders()['error'] ?? '') === 'keyword' && isset($actions->imap->messages['INBOX'][9]),
        'A server without custom keywords leaves the message in Inbox');
    $actions->imap->keywords = true;

    file_put_contents(APP_PRIVATE_DATA . 'pied-web-ux/scheduled/sender.json',json_encode(['at'=>time()-3600]));
    $actions->params = ['operation'=>'set','uids'=>'9','remindAt'=>$iso];
    $check(($plugin->Reminders()['error'] ?? '') === 'sender', 'A stale cron heartbeat cannot hide a message');
    file_put_contents(APP_PRIVATE_DATA . 'pied-web-ux/scheduled/sender.json',json_encode(['at'=>time()]));

    $actions->params = ['operation'=>'wipe'];
    $check(($plugin->Reminders()['error'] ?? '') === 'scope', 'An unknown operation does nothing');
    $actions->account = null; $actions->params = ['operation'=>'list'];
    $check(isset($plugin->Reminders()['error']), 'Authentication is required');
    $actions->account = new ReminderAccount; $_SERVER['REQUEST_METHOD'] = 'GET';
    $check(isset($plugin->Reminders()['error']), 'Only POST is accepted');

    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($private,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iterator as $path) $path->isDir() ? rmdir($path->getPathname()) : unlink($path->getPathname());
    rmdir($private);
    echo "\n$n checks passed\n";
}
