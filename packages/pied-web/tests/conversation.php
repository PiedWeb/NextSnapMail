<?php
namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public function Manager() { return new class { public function JsonResponseHelper($name, $data) { return $data; } }; }
    }
}
namespace RainLoop { class Api { public static $actions; public static function Actions() { return self::$actions; } } }
namespace {
    spl_autoload_register(function($class) {
        $path = getenv('NEXTSNAPMAIL_SOURCE') . '/app/snappymail/v/2.38.2/app/libraries/' . str_replace('\\', '/', $class) . '.php';
        if (is_file($path)) require_once $path;
    });
    require __DIR__ . '/../plugin/pied-web-ux/index.php';

    /** Build a native message without touching a mailbox. */
    function message(string $folder, int $uid, string $messageId = '', string $inReplyTo = '', string $references = '', int $stamp = 0) {
        $message = (new ReflectionClass(\MailSo\Mail\Message::class))->newInstanceWithoutConstructor();
        foreach (['sFolder'=>$folder,'Uid'=>$uid,'sMessageId'=>$messageId,'InReplyTo'=>$inReplyTo,
                  'References'=>$references,'iHeaderTimeStampInUTC'=>$stamp] as $name => $value) {
            $property = new ReflectionProperty(\MailSo\Mail\Message::class, $name);
            $property->setAccessible(true); $property->setValue($message, $value);
        }
        return $message;
    }
    function collection(array $messages, int $total = 0) {
        $result = new \MailSo\Mail\MessageCollection;
        foreach ($messages as $message) $result->append($message);
        $result->totalEmails = $total ?: count($messages);
        return $result;
    }

    class ReadOnlyImap extends \MailSo\Imap\ImapClient {
        public function __construct() { $this->Settings = (new \ReflectionClass(\MailSo\Imap\Settings::class))->newInstanceWithoutConstructor(); }
        public function hasCapability(string $name): bool { return false; }
    }

    $actions = new class {
        public $account; public string $sent = 'Sent'; public array $params = [], $calls = [];
        public $imap; public array $responses = []; public string $hash = 'a'; public int $hashCalls = 0;
        public function __construct() {
            $this->imap = new ReadOnlyImap;
            $this->account = new class { public int $logins = 0; public function ImapConnectAndLogin(...$a) { ++$this->logins; } };
        }
        public function getAccountFromToken() { return $this->account; }
        public function SettingsProvider($local) { return $this; }
        public function Load($account) { return $this; }
        public function GetConf($name, $default) { return $name === 'SentFolder' ? $this->sent : $default; }
        public function GetActionParam($name, $default) { return $this->params[$name] ?? $default; }
        public function Plugins() { return null; }
        public function Config() { return null; }
        public function ImapClient() { return $this->imap; }
        public function MailClient() { return $this; }
        public function FolderHash($folder) { ++$this->hashCalls; return $this->hash . ':' . $folder; }
        public function MessageList($params) {
            $this->calls[] = ['folder'=>$params->sFolderName, 'search'=>$params->sSearch,
                'threads'=>$params->bUseThreads, 'threadUid'=>$params->iThreadUid,
                'offset'=>$params->iOffset, 'limit'=>$params->iLimit, 'sort'=>$params->sSort];
            $key = $params->sFolderName . '|' . $params->sSearch;
            $pages = $this->responses[$key] ?? [];
            $page = $pages[intdiv($params->iOffset, 50)] ?? [];
            return collection($page, $this->responses[$key . '|total'] ?? count($page));
        }
    };
    \RainLoop\Api::$actions = $actions; $plugin = new \PiedWebUxPlugin;
    $n = 0; $check = function($ok, $label) use (&$n) { if (!$ok) throw new \RuntimeException($label); ++$n; echo "PASS $label\n"; };
    $_SERVER['REQUEST_METHOD'] = 'POST';

    $root = '<root@example.test>';
    $reply = '<reply@example.test>';
    $actions->responses = [
        'INBOX|' => [[message('INBOX', 11, $root, '', '', 100), message('Other', 99, '<x@example.test>')]],
        'Sent|' . http_build_query(['header' => 'References ' . $root]) => [[
            message('Sent', 21, $reply, $root, $root, 200),
            message('Sent', 22, '<noise@example.test>', '', '<unrelated@example.test>', 300),
        ]],
        'Sent|' . http_build_query(['header' => 'In-Reply-To ' . $root]) => [[message('Sent', 21, $reply, $root, $root, 200)]],
        'Sent|' . http_build_query(['header' => 'In-Reply-To ' . $reply]) => [[message('Sent', 23, '<last@example.test>', $reply, '', 400)]],
    ];
    $actions->params = ['folder'=>'INBOX','uid'=>11,'threadUid'=>11,'messageId'=>$root];
    $result = $plugin->Conversation();
    $keys = array_map(fn($m) => $m->sFolder . '/' . $m->Uid, $result['messages']);

    $check($actions->account->logins === 1, 'One IMAP login for the whole conversation scan');
    $check(in_array('INBOX/11', $keys, true), 'Thread rows of the opened folder are returned');
    $check(!in_array('Other/99', $keys, true), 'Rows from another folder are dropped');
    $check(in_array('Sent/21', $keys, true) && in_array('Sent/23', $keys, true), 'Sent replies are followed transitively');
    $check(!in_array('Sent/22', $keys, true), 'A search hit whose headers do not match is dropped');
    $check($actions->calls[0]['threads'] === true && $actions->calls[0]['threadUid'] === 11
        && $actions->calls[0]['folder'] === 'INBOX', 'The folder pass uses the native thread list');
    $check($actions->calls[1]['folder'] === 'Sent'
        && $actions->calls[1]['search'] === http_build_query(['header' => 'References ' . $root]),
        'The Sent pass starts from the thread root References search');
    $cache = false;
    $criteria = (string) \MailSo\Imap\SearchCriterias::fromString($actions->imap, 'Sent', $actions->calls[1]['search'], true, $cache);
    $check($criteria === 'HEADER "References" "' . $root . '" UNDELETED', 'Native search contract unchanged: ' . $criteria);
    $check(array_reduce($actions->calls, fn($carry, $call) => $carry && $call['limit'] === 50, true), 'Every page stays bounded to 50');

    // Unchanged mailbox: two STATUS commands, no search at all.
    $etag = $result['etag'];
    $before = count($actions->calls); $actions->params['etag'] = $etag;
    $result = $plugin->Conversation();
    $check($result['unchanged'] === true && $result['messages'] === [] && count($actions->calls) === $before,
        'An unchanged mailbox answers without any search');
    $actions->hash = 'b'; $result = $plugin->Conversation();
    $check($result['unchanged'] === false && count($actions->calls) > $before, 'A moved mailbox is scanned again');
    unset($actions->params['etag']);

    // The walk is bounded even if every reply chains to a new one.
    $actions->hash = 'c';
    $chain = [];
    for ($i = 0; $i < 60; ++$i) {
        $id = '<chain' . $i . '@example.test>';
        $next = '<chain' . ($i + 1) . '@example.test>';
        $chain['Sent|' . http_build_query(['header' => 'In-Reply-To ' . $id])] = [[message('Sent', 1000 + $i, $next, $id, '', $i)]];
    }
    $actions->responses = $chain + ['INBOX|' => [[message('INBOX', 11, '<chain0@example.test>', '', '', 1)]]];
    $actions->calls = []; $actions->params = ['folder'=>'INBOX','uid'=>11,'threadUid'=>11,'messageId'=>'<chain0@example.test>'];
    $result = $plugin->Conversation();
    $check(count($actions->calls) <= 25, 'The Sent walk is bounded: ' . count($actions->calls) . ' searches');
    $check(count($result['messages']) <= 200, 'The returned row count is bounded');

    // Guards.
    foreach ([['folder'=>'','uid'=>1], ['folder'=>'INBOX','uid'=>0], ['folder'=>'INBOX','uid'=>'x'],
              ['folder'=>str_repeat('x', 1025),'uid'=>1], ['folder'=>'INBOX','uid'=>1,'threadUid'=>-1]] as $params) {
        $actions->calls = []; $actions->params = $params;
        $check(isset($plugin->Conversation()['error']) && $actions->calls === [], 'Invalid scope rejected before any mail access');
    }
    $actions->params = ['folder'=>'INBOX','uid'=>11];
    $actions->account = null; $actions->calls = [];
    $check(isset($plugin->Conversation()['error']) && $actions->calls === [], 'Authentication required before querying mail');
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $check(isset($plugin->Conversation()['error']) && $actions->calls === [], 'POST required (native dispatcher also enforces CSRF)');

    echo "$n read-only checks passed; no mail access or mutation\n";
}
