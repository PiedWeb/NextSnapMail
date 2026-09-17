<?php
/* Behaviour checks for the scheduled-send endpoint and the header it stamps, against the
 * native message builder, header parser and sequence sets. IMAP transport is simulated:
 * no mailbox is opened and no message is sent. Addresses are fictional. */

namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public function Manager() { return new class { public function JsonResponseHelper($name, $data) { return $data; } }; }
    }
}
namespace RainLoop { class Api { public static $actions; public static function Actions() { return self::$actions; } } }
namespace {
    spl_autoload_register(function ($class) {
        $path = getenv('NEXTSNAPMAIL_SOURCE') . '/app/snappymail/v/2.38.2/app/libraries/' . str_replace('\\', '/', $class) . '.php';
        if (is_file($path)) require_once $path;
    });
    // The native message serialiser stamps its own X-Mailer from the application version.
    defined('APP_VERSION') || define('APP_VERSION', '2.38.2');
    require __DIR__ . '/../plugin/pied-web-ux/index.php';
    require __DIR__ . '/../plugin/pied-web-ux/ScheduledSend.php';

    use MailSo\Imap\SequenceSet;

    class Response {
        public function __construct(private array $values) {}
        public function GetFetchValue(string $name) { return $this->values[$name] ?? null; }
        public function GetHeaderFieldsValue(): string { return $this->values['headers'] ?? ''; }
    }
    class Imap {
        public array $messages = [], $folders = [], $created = [], $moved = [], $deleted = [], $stored = [];
        public string $delimiter = '.', $selected = '';
        public function FolderHierarchyDelimiter(string $folder = '') { return $this->delimiter; }
        public function FolderStatusList(string $name, string $pattern) { return isset($this->folders[$name]) ? [$name => true] : []; }
        public function FolderExamine(string $name, bool $force = false) { $this->selected = $name; return $this; }
        public function FolderSelect(string $name, bool $force = false) { $this->selected = $name; return $this; }
        public function IsFlagSupported(string $flag): bool { return true; }
        public function MessageSearch(string $criteria, bool $uid = true) { return array_keys($this->messages); }
        public function Fetch(array $items, string $range, bool $uid) {
            $out = [];
            foreach (explode(',', $range) as $id) {
                $message = $this->messages[(int) $id] ?? null;
                if (!$message) continue;
                $out[] = new Response(['UID' => (int) $id, 'FLAGS' => $message['flags'],
                    'headers' => $message['due'] === '' ? '' : PiedWebScheduledSend::HEADER . ': ' . $message['due'] . "\r\n"]);
            }
            return $out;
        }
        public function MessageMove(string $from, string $to, SequenceSet $range) { $this->moved[] = [$from, $to, (string) $range]; }
        public function MessageDelete(string $folder, SequenceSet $range, bool $all = false) { $this->deleted[] = [$folder, (string) $range]; }
    }
    class Client {
        public array $created = [], $flags = [];
        public function __construct(private Imap $imap) {}
        public function FolderCreate(string $name, string $parent = '', bool $subscribe = true, string $delimiter = '') {
            $this->created[] = [$name, $parent, $subscribe];
            $this->imap->folders[($parent === '' ? '' : $parent . $this->imap->delimiter) . $name] = true;
            return null;
        }
        public function MessageSetFlag(string $folder, SequenceSet $range, string $flag, bool $set = true, bool $skip = false): void {
            $this->flags[] = [$folder, (string) $range, $flag, $set];
        }
    }
    class Settings {
        public array $conf = ['DraftsFolder' => 'INBOX.Brouillons', 'SentFolder' => 'INBOX.Envoyes'];
        public function GetConf(string $name, $default = '') { return $this->conf[$name] ?? $default; }
    }
    class Account {
        public int $logins = 0;
        public function __construct(public string $email = 'robin@example.test') {}
        public function Email(): string { return $this->email; }
        public function ImapConnectAndLogin(...$args) { ++$this->logins; return true; }
    }
    class Actions {
        public array $params = [];
        public $account;
        public Imap $imap;
        public Client $client;
        public Settings $settings;
        public function __construct() {
            $this->imap = new Imap; $this->client = new Client($this->imap);
            $this->settings = new Settings; $this->account = new Account;
            $this->imap->folders = ['INBOX.Brouillons' => true, 'INBOX.Envoyes' => true];
        }
        public function getAccountFromToken($throw = true) { return $this->account; }
        public function GetActionParam($name, $default = null) { return $this->params[$name] ?? $default; }
        public function SettingsProvider($local = false) { return $this; }
        public function Load($account) { return $this->settings; }
        public function ImapClient() { return $this->imap; }
        public function MailClient() { return $this->client; }
        public function Plugins() { return null; }
        public function Config() { return null; }
    }

    $n = 0;
    $check = function ($ok, $label) use (&$n) {
        if (!$ok) throw new \RuntimeException('FAIL ' . $label);
        ++$n; echo "PASS $label\n";
    };
    $actions = new Actions;
    \RainLoop\Api::$actions = $actions;
    $plugin = new \PiedWebUxPlugin;
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $soon = gmdate('Y-m-d\TH:i:s\Z', time() + 3600);

    // The queue is named from the account's own Drafts folder, and created only when missing.
    $actions->params = ['operation' => 'folder'];
    $result = $plugin->ScheduledSend();
    $check($result['folder'] === 'INBOX.Scheduled', 'The queue is a sibling of the configured Drafts folder');
    $check($actions->client->created === [['Scheduled', 'INBOX', true]], 'A missing queue is created once, subscribed');
    $actions->client->created = [];
    $check($plugin->ScheduledSend()['folder'] === 'INBOX.Scheduled' && $actions->client->created === [],
        'An existing queue is not created again');
    $check($actions->account->logins > 0, 'Every request authenticates against the mailbox');
    $check(array_key_exists('sender', $result) && $result['sender'] === 0,
        'With no sender running, the composer is told so instead of being left to guess');
    $beat = sys_get_temp_dir() . '/pw-sender-' . getmypid();
    mkdir($beat);
    file_put_contents($beat . '/sender.json', json_encode(['at' => 1789623304]));
    $check(PiedWebScheduledSend::sender($beat) === 1789623304, 'A running sender reports when it last passed');
    array_map('unlink', glob($beat . '/*')); rmdir($beat);

    // Stamping is refused unless the save really goes to that queue.
    $message = new \MailSo\Mime\Message;
    $actions->params = [];
    $plugin->FilterSaveMessage($message);
    $check(!str_contains((string) stream_get_contents($message->ToStream()), PiedWebScheduledSend::HEADER),
        'An ordinary draft save carries no send time');
    foreach ([['saveFolder' => 'INBOX.Brouillons'], ['saveFolder' => 'INBOX'], ['saveFolder' => '']] as $params) {
        $message = new \MailSo\Mime\Message;
        $actions->params = array_merge(['pwSendAt' => $soon], $params);
        try { $plugin->FilterSaveMessage($message); $refused = false; } catch (\Throwable $error) { $refused = 'folder' === $error->getMessage(); }
        $check($refused, 'A send time is refused outside the queue: ' . json_encode($params));
    }
    foreach (['', 'tomorrow', '2026-09-18 08:00', '2026-09-18T08:00:00', gmdate('Y-m-d\TH:i:s\Z', time() - 3600),
        gmdate('Y-m-d\TH:i:s\Z', time() + 500 * 86400)] as $raw) {
        $message = new \MailSo\Mime\Message;
        $actions->params = ['pwSendAt' => $raw, 'saveFolder' => 'INBOX.Scheduled'];
        try { $plugin->FilterSaveMessage($message); $stamped = str_contains((string) stream_get_contents($message->ToStream()), PiedWebScheduledSend::HEADER); }
        catch (\Throwable $error) { $stamped = false; }
        $check(!$stamped, 'An unusable send time never reaches a stored message: ' . var_export($raw, true));
    }
    $message = new \MailSo\Mime\Message;
    $actions->params = ['pwSendAt' => '2027-03-14T08:30:00+01:00', 'saveFolder' => 'INBOX.Scheduled'];
    $plugin->FilterSaveMessage($message);
    $raw = (string) stream_get_contents($message->ToStream());
    $check(str_contains($raw, PiedWebScheduledSend::HEADER . ': 2027-03-14T07:30:00Z'),
        'The stored time is the author’s instant, written once in UTC');
    $check(!str_contains($raw, PiedWebScheduledSend::DSN), 'No delivery receipt is claimed unless one was asked for');
    // What the composer actually hands over is `new Date(...).toISOString()`: an instant with
    // milliseconds. Refusing that shape refuses every schedule the interface can make.
    $when = time() + 7200;
    $message = new \MailSo\Mime\Message;
    $actions->params = ['pwSendAt' => gmdate('Y-m-d\TH:i:s', $when) . '.000Z', 'saveFolder' => 'INBOX.Scheduled'];
    $plugin->FilterSaveMessage($message);
    $check(str_contains((string) stream_get_contents($message->ToStream()),
        PiedWebScheduledSend::HEADER . ': ' . gmdate('Y-m-d\TH:i:s\Z', $when)),
        'A browser instant with milliseconds is accepted and stored to the second');
    $message = new \MailSo\Mime\Message;
    $actions->params = ['pwSendAt' => gmdate('Y-m-d\TH:i:s', $when) . '.123456Z', 'saveFolder' => 'INBOX.Scheduled'];
    $plugin->FilterSaveMessage($message);
    $check(str_contains((string) stream_get_contents($message->ToStream()),
        PiedWebScheduledSend::HEADER . ': ' . gmdate('Y-m-d\TH:i:s\Z', $when)), 'A finer fraction is truncated, not refused');
    $actions->params = ['pwSendAt' => '2027-03-14T08:30:00+01:00', 'saveFolder' => 'INBOX.Scheduled'];
    $message = new \MailSo\Mime\Message;
    $actions->params['dsn'] = 1;
    $plugin->FilterSaveMessage($message);
    $check(str_contains((string) stream_get_contents($message->ToStream()), PiedWebScheduledSend::DSN . ': 1'),
        'A requested delivery receipt is stored with the message');

    // The note left for the sender only ever moves earlier.
    $base = sys_get_temp_dir() . '/pw-scheduled-' . getmypid();
    PiedWebScheduledSend::hint('robin@example.test', 2000, $base);
    $file = $base . '/' . hash('sha256', 'robin@example.test') . '.json';
    $check(json_decode((string) file_get_contents($file), true) === ['due' => 2000], 'The sender is told when the next message is due');
    PiedWebScheduledSend::hint('robin@example.test', 3000, $base);
    $check(json_decode((string) file_get_contents($file), true) === ['due' => 2000], 'A later message does not postpone the note');
    PiedWebScheduledSend::hint('robin@example.test', 1000, $base);
    $check(json_decode((string) file_get_contents($file), true) === ['due' => 1000], 'An earlier message brings the note forward');
    $check(!str_contains($file, 'robin@example.test'), 'The note is named by a hash, not by the address');
    array_map('unlink', glob($base . '/*')); rmdir($base);

    // Reading the queue reports what the mailbox says, including the sender's own marks.
    $actions->imap->folders['INBOX.Scheduled'] = true;
    $actions->imap->messages = [
        3 => ['flags' => [], 'due' => '2026-09-18T06:00:00Z'],
        4 => ['flags' => ['$pwsending'], 'due' => '2026-09-18T06:00:00Z'],
        5 => ['flags' => ['$pwsendfailed'], 'due' => '2026-09-18T06:00:00Z'],
        6 => ['flags' => ['$pwsent'], 'due' => '2026-09-18T06:00:00Z'],
        7 => ['flags' => [], 'due' => ''],
    ];
    $actions->params = ['operation' => 'list'];
    $result = $plugin->ScheduledSend();
    $states = array_column($result['entries'], 'state', 'uid');
    $check($result['folder'] === 'INBOX.Scheduled' && count($result['entries']) === 5, 'Every queued message is described');
    $check($states === [3 => 'pending', 4 => 'sending', 5 => 'failed', 6 => 'sent', 7 => 'unscheduled'],
        'Pending, claimed, abandoned, sent and unscheduled are told apart');
    $check($result['entries'][0]['sendAt'] === '2026-09-18T06:00:00Z', 'The due time comes from the message itself');

    // Cancelling: back to the composer deletes the copy, back to Drafts moves it.
    $actions->params = ['operation' => 'cancel', 'uid' => 3, 'mode' => 'resume'];
    $result = $plugin->ScheduledSend();
    $check($result['mode'] === 'resume' && $actions->imap->deleted === [['INBOX.Scheduled', '3']], 'Resuming removes the scheduled copy');
    $actions->params = ['operation' => 'cancel', 'uid' => 3, 'mode' => 'draft'];
    $result = $plugin->ScheduledSend();
    $check($actions->imap->moved === [['INBOX.Scheduled', 'INBOX.Brouillons', '3']], 'Cancelling puts the message back in Drafts');
    $actions->params = ['operation' => 'cancel', 'uid' => 5, 'mode' => 'draft'];
    $plugin->ScheduledSend();
    $check(in_array(['INBOX.Scheduled', '5', '$pwsendfailed', false], $actions->client->flags, true),
        'A cancelled message does not keep the failure mark');
    foreach ([4, 6] as $uid) {
        $before = count($actions->imap->moved) + count($actions->imap->deleted);
        $actions->params = ['operation' => 'cancel', 'uid' => $uid, 'mode' => 'draft'];
        $result = $plugin->ScheduledSend();
        $check(($result['error'] ?? '') === 'sending' && count($actions->imap->moved) + count($actions->imap->deleted) === $before,
            'A message the sender has taken cannot be cancelled: uid ' . $uid);
    }
    foreach ([0, -1, 'x', 99] as $uid) {
        $actions->params = ['operation' => 'cancel', 'uid' => $uid, 'mode' => 'draft'];
        $check(isset($plugin->ScheduledSend()['error']), 'An unusable uid is refused: ' . var_export($uid, true));
    }
    $actions->params = ['operation' => 'cancel', 'uid' => 3, 'mode' => 'elsewhere'];
    $check(($plugin->ScheduledSend()['error'] ?? '') === 'scope', 'Only the two cancel modes are accepted');

    // A queue that would collide with a system folder is never used.
    foreach ([['DraftsFolder' => ''], ['DraftsFolder' => '__UNUSE__'], ['DraftsFolder' => 'INBOX'],
        ['DraftsFolder' => 'INBOX.Drafts', 'SentFolder' => 'INBOX.Scheduled']] as $conf) {
        $actions->settings->conf = array_merge(['DraftsFolder' => 'INBOX.Brouillons', 'SentFolder' => 'INBOX.Envoyes'], $conf);
        $actions->params = ['operation' => 'folder'];
        $check(isset($plugin->ScheduledSend()['error']), 'No queue is invented: ' . json_encode($conf));
    }
    $actions->settings->conf = ['DraftsFolder' => 'INBOX.Brouillons', 'SentFolder' => 'INBOX.Envoyes'];

    // Login and POST are required, and nothing else is an operation.
    $actions->params = ['operation' => 'folder'];
    $actions->account = null;
    $check(isset($plugin->ScheduledSend()['error']), 'Authentication is required');
    $actions->account = new Account;
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $check(isset($plugin->ScheduledSend()['error']), 'Only POST is accepted');
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $actions->params = ['operation' => 'wipe'];
    $check(($plugin->ScheduledSend()['error'] ?? '') === 'scope', 'An unknown operation does nothing');

    echo "\n$n checks passed\n";
}
