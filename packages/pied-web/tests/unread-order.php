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
    $settings = new class {
        public array $values = []; public bool $saveResult = true; public int $saves = 0;
        public function GetConf($name, $default) { return $this->values[$name] ?? $default; }
        public function SetConf($name, $value) { $this->values[$name] = $value; }
        public function save() { ++$this->saves; return $this->saveResult; }
    };
    $actions = new class($settings) {
        public $account; public $settings; public array $params = [], $mailCalls = []; public $collection;
        public function __construct($settings) { $this->account = new \stdClass; $this->settings = $settings; }
        public function getAccountFromToken() { return $this->account; }
        public function SettingsProvider($local) { if (!$local) throw new \RuntimeException('local settings required'); return $this; }
        public function Load($account) { return $this->settings; }
        public function HasActionParam($name) { return \array_key_exists($name, $this->params); }
        public function GetActionParam($name, $default) { return $this->params[$name] ?? $default; }
        public function MailClient() { return $this; }
        public function MessageList($params) { $this->mailCalls[] = $params; return $this->collection; }
    };
    \RainLoop\Api::$actions = $actions; $plugin = new \PiedWebUxPlugin;
    $n = 0; $check = function($ok, $label) use (&$n) { if (!$ok) throw new \RuntimeException($label); ++$n; echo "PASS $label\n"; };

    $_SERVER['REQUEST_METHOD'] = 'POST';
    $check($plugin->UnreadOrder() === ['enabled'=>true,'behavior'=>1] && $settings->saves === 0,
        'The per-account Feed preference defaults on and a read does not write settings');
    $actions->params = ['enabled'=>'1'];
    $check($plugin->UnreadOrder() === ['enabled'=>true,'behavior'=>1] && $settings->saves === 1
        && $settings->values['PiedWebUnreadOldestFirst'] === true,
        'Enabling persists the boolean in the active account local settings');
    $actions->params = [];
    $check($plugin->UnreadOrder() === ['enabled'=>true,'behavior'=>1] && $settings->saves === 1,
        'The saved state is returned on the next load');
    $actions->params = ['behavior'=>'2'];
    $check($plugin->UnreadOrder() === ['enabled'=>true,'behavior'=>2] && $settings->saves === 2
        && $settings->values['PiedWebUnreadOrderReadBehavior'] === 2,
        'The read-transition behavior remains an independent per-account setting');
    $actions->params = ['enabled'=>0];
    $check($plugin->UnreadOrder() === ['enabled'=>false,'behavior'=>2] && $settings->saves === 3,
        'Disabling persists and returns the resulting state');
    foreach (['yes', 2, -1, null] as $invalid) {
        $before = $settings->saves; $actions->params = ['enabled'=>$invalid];
        $check(isset($plugin->UnreadOrder()['error']) && $settings->saves === $before,
            'Invalid state is rejected without a settings write');
    }
    foreach ([0,3,'invalid',null] as $invalid) {
        $before = $settings->saves; $actions->params = ['behavior'=>$invalid];
        $check(isset($plugin->UnreadOrder()['error']) && $settings->saves === $before,
            'Invalid read-transition behavior is rejected without a settings write');
    }
    $settings->saveResult = false; $actions->params = ['enabled'=>1];
    $check(isset($plugin->UnreadOrder()['error']), 'A failed settings write is reported');
    $settings->saveResult = true; $actions->account = null; $actions->params = [];
    $check(isset($plugin->UnreadOrder()['error']), 'Authentication is required');
    $actions->account = new \stdClass; $_SERVER['REQUEST_METHOD'] = 'GET';
    $check(isset($plugin->UnreadOrder()['error']), 'POST is required (the native dispatcher also checks CSRF)');

    // The response hook stays on the ordinary first Inbox page and reuses the native
    // sort/thread shape while asking MailClient only for UNSEEN rows.
    $_SERVER['REQUEST_METHOD'] = 'POST'; $settings->saveResult = true;
    $settings->values[PiedWebUnreadOrder::SETTING] = true;
    $actions->collection = new \MailSo\Mail\MessageCollection;
    $actions->collection->totalEmails = 14;
    $actions->params = ['PiedWebFeed'=>'1','useThreads'=>1,'threadAlgorithm'=>'REFERENCES'];
    $response = ['Result'=>[
        '@Collection'=>[['folder'=>'INBOX','uid'=>119,'flags'=>[],'threadUnseen'=>[]]],
        'folder'=>['name'=>'INBOX','unreadEmails'=>14], 'offset'=>0, 'search'=>'',
        'threadUid'=>0, 'sort'=>'REVERSE DATE', 'totalThreads'=>198
    ]];
    PiedWebUnreadOrder::augmentMessageList($actions, $response); $query = $actions->mailCalls[0];
    $check($query->sFolderName === 'INBOX' && $query->sSearch === 'is:unseen'
        && $query->iOffset === 0 && $query->iLimit === 14,
        'The first Inbox page requests exactly the missing unread set');
    $check($query->sSort === 'REVERSE DATE' && $query->bUseThreads
        && $query->sThreadAlgorithm === 'REFERENCES',
        'The supplementary read reuses the native sort and conversation shape');
    $check($response['PiedWebUnreadOrder'] === $actions->collection,
        'The native unread collection is attached for client-side revival');

    $before = count($actions->mailCalls);
    $nativeInbox = ['Result'=>[
        '@Collection'=>[['folder'=>'INBOX','uid'=>120,'flags'=>[],'threadUnseen'=>[]]],
        'folder'=>['name'=>'INBOX','unreadEmails'=>14], 'offset'=>0, 'search'=>'',
        'threadUid'=>0, 'sort'=>'REVERSE DATE', 'totalThreads'=>198
    ]];
    $actions->params = ['useThreads'=>1,'threadAlgorithm'=>'REFERENCES'];
    PiedWebUnreadOrder::augmentMessageList($actions, $nativeInbox);
    $check(count($actions->mailCalls) === $before && !isset($nativeInbox['PiedWebUnreadOrder']),
        'The same native Inbox request is untouched without the Feed marker');
    $actions->params = ['PiedWebFeed'=>'1','useThreads'=>1,'threadAlgorithm'=>'REFERENCES'];

    $covered = ['Result'=>[
        '@Collection'=>[['folder'=>'INBOX','uid'=>119,'flags'=>[],'threadUnseen'=>[117,118]]],
        'folder'=>['name'=>'INBOX','unreadEmails'=>3], 'offset'=>0, 'search'=>'',
        'threadUid'=>0, 'sort'=>'REVERSE DATE', 'totalThreads'=>198
    ]];
    PiedWebUnreadOrder::augmentMessageList($actions, $covered);
    $check(count($actions->mailCalls) === $before && !isset($covered['PiedWebUnreadOrder']),
        'No supplementary query runs when the native page already covers every unread UID');

    foreach ([
        ['folder'=>['name'=>'Trash','unreadEmails'=>14], 'offset'=>0, 'search'=>'', 'threadUid'=>0],
        ['folder'=>['name'=>'INBOX','unreadEmails'=>14], 'offset'=>20, 'search'=>'', 'threadUid'=>0],
        ['folder'=>['name'=>'INBOX','unreadEmails'=>14], 'offset'=>0, 'search'=>'is:unseen', 'threadUid'=>0],
        ['folder'=>['name'=>'INBOX','unreadEmails'=>14], 'offset'=>0, 'search'=>'', 'threadUid'=>119],
    ] as $outOfScope) {
        $candidate = ['Result'=>array_merge(['@Collection'=>[],'sort'=>'REVERSE DATE','totalThreads'=>null], $outOfScope)];
        PiedWebUnreadOrder::augmentMessageList($actions, $candidate);
        $check(count($actions->mailCalls) === $before, 'Supplementary unread query stays outside unrelated native views');
    }
    echo "$n preference checks passed; no mailbox access\n";
}
