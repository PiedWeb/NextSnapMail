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
        public $actions;
        public string $folder = '';
        public array $calls = [];
        public function __construct() { $this->Settings = (new \ReflectionClass(\MailSo\Imap\Settings::class))->newInstanceWithoutConstructor(); }
        public function hasCapability(string $name): bool { return false; }
        private function messages(): array {
            if (in_array($this->folder,$this->actions->failedFolders,true)) throw new \RuntimeException('fixture inaccessible');
            $rows = [];
            foreach ($this->actions->responses as $pages) {
                if (!is_array($pages)) continue;
                foreach ($pages as $page) foreach ($page as $message) {
                    if ($message->sFolder === $this->folder) $rows[$message->Uid] = $message;
                }
            }
            return $rows;
        }
        public function FolderExamine(string $folder, bool $force = false): \MailSo\Imap\FolderInformation {
            $this->folder = $folder;
            return new \MailSo\Imap\FolderInformation($folder,false);
        }
        public function MessageSearch(string $criteria, bool $uid = true): array {
            $this->calls[] = ['kind'=>'search','folder'=>$this->folder,'criteria'=>$criteria,'uid'=>$uid];
            $rows = $this->messages();
            if (str_contains($criteria,'HEADER')) {
                if ($this->actions->brokenHeaderSearch) return [];
                preg_match('/^UID ([0-9]+)/',$criteria,$match);
                return isset($rows[(int)($match[1]??0)]) ? [(int)$match[1]] : [];
            }
            return array_keys(array_filter($rows,fn($m) => $criteria !== 'UNDELETED' || !in_array('\\deleted',$m->aFlagsLowerCase,true)));
        }
        public function Fetch(array $items, string $range, bool $uid): array {
            $uids = array_map('intval',explode(',',$range));
            $this->calls[] = ['kind'=>'fetch','folder'=>$this->folder,'items'=>$items,'uids'=>$uids,'uid'=>$uid];
            $rows = $this->messages(); $out = [];
            foreach ($uids as $id) {
                if (!isset($rows[$id])) continue;
                $m = $rows[$id];
                $headers = 'Message-ID: '.$m->sMessageId."\r\nReferences: ".$m->References
                    ."\r\nIn-Reply-To: ".$m->InReplyTo."\r\nDate: ".gmdate('r',1700000000+$m->iHeaderTimeStampInUTC)."\r\nSubject: Shared subject\r\n"
                    ."From: Sender <sender@example.test>\r\nTo: Reader <reader@example.test>\r\n\r\n";
                $response = new \MailSo\Imap\Response;
                $response->ResponseList = ['*',$id,'FETCH',['UID',$id,'FLAGS',$m->aFlagsLowerCase,
                    'RFC822.SIZE',256,'INTERNALDATE',gmdate('d-M-Y H:i:s +0000',1700000000+$m->iHeaderTimeStampInUTC),
                    'BODY[HEADER]',$headers]];
                $out[] = new \MailSo\Imap\FetchResponse($response);
            }
            return $out;
        }
    }

    $actions = new class {
        public $account; public string $sent = 'Sent'; public array $params = [], $calls = [];
        public $imap; public array $responses = [], $folderNames = [], $failedFolders = [];
        public array $folderRoles = [];
        public bool $brokenHeaderSearch = false;
        public string $hash = 'a'; public int $hashCalls = 0;
        public function __construct() {
            $this->imap = new ReadOnlyImap;
            $this->imap->actions = $this;
            $this->account = new class { public int $logins = 0; public function ImapConnectAndLogin(...$a) { ++$this->logins; } };
        }
        public function getAccountFromToken() { return $this->account; }
        public function SettingsProvider($local) { return $this; }
        public function Load($account) { return $this; }
        public function GetConf($name, $default) {
            return ['SentFolder'=>$this->sent,'TrashFolder'=>'Trash','JunkFolder'=>'Junk','DraftsFolder'=>'Drafts'][$name] ?? $default;
        }
        public function GetActionParam($name, $default) { return $this->params[$name] ?? $default; }
        public function Plugins() { return null; }
        public function Config() { return null; }
        public function ImapClient() { return $this->imap; }
        public function MailClient() { return $this; }
        public function FolderHash($folder) { ++$this->hashCalls; return $this->hash . ':' . $folder; }
        public function Folders(...$args) {
            return array_map(fn($name) => new \MailSo\Imap\Folder($name, '/', $name === 'Unselectable'
                ? ['\\noselect'] : (isset($this->folderRoles[$name]) ? ['\\'.$this->folderRoles[$name]] : [])), $this->folderNames);
        }
        public function MessageList($params) {
            $this->calls[] = ['folder'=>$params->sFolderName, 'search'=>$params->sSearch,
                'threads'=>$params->bUseThreads, 'threadUid'=>$params->iThreadUid,
                'offset'=>$params->iOffset, 'limit'=>$params->iLimit, 'sort'=>$params->sSort,
                'uids'=>$params->oSequenceSet?->getArrayCopy()];
            if (in_array($params->sFolderName, $this->failedFolders, true)) throw new \RuntimeException('fixture inaccessible');
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
    $searchCalls = array_values(array_filter($actions->calls, fn($call) => !$call['uids']));
    $check($searchCalls[0]['threads'] === true && $searchCalls[0]['threadUid'] === 11
        && $searchCalls[0]['folder'] === 'INBOX', 'The folder pass uses the native thread list');
    $check($searchCalls[1]['folder'] === 'Sent'
        && $searchCalls[1]['search'] === http_build_query(['header' => 'References ' . $root]),
        'The Sent pass starts from the thread root References search');
    $cache = false;
    $criteria = (string) \MailSo\Imap\SearchCriterias::fromString($actions->imap, 'Sent', $searchCalls[1]['search'], true, $cache);
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

    // Explicit filed-message exchange, without changing any native list setting.
    $actions->folderNames = ['INBOX','Sent','Archive','Projects','Drafts','Trash','Junk','Scheduled','Reminders','Unselectable'];
    $actions->params = ['scope'=>'account','folder'=>'Archive','uid'=>71,'messageId'=>$reply,'references'=>$root];
    $actions->responses = [
        'INBOX|' . http_build_query(['header'=>'Message-ID ' . $root]) => [[message('INBOX',11,$root)]],
        'Sent|' . http_build_query(['header'=>'References ' . $root]) => [[message('Sent',21,$reply,$root,$root)]],
        'Projects|' . http_build_query(['header'=>'References ' . $root]) => [[
            message('Projects',31,'<project@example.test>',$reply,$root . ' ' . $reply),
            message('Projects',32,'<unrelated@example.test>','','<noise@example.test>'),
        ]],
    ];
    $actions->calls = [];
    $result = $plugin->Conversation();
    $keys = array_map(fn($m) => $m->sFolder . '/' . $m->Uid, $result['messages']);
    $check(in_array('INBOX/11',$keys,true) && in_array('Sent/21',$keys,true) && in_array('Projects/31',$keys,true),
        'Explicit account lookup joins original, sent and filed messages using header identity');
    $check(!in_array('Projects/32',$keys,true), 'Account lookup also rejects inexact Message-ID header hits');
    $check(array_diff(array_unique(array_column($actions->calls,'folder')),['Archive','INBOX','Sent','Projects']) === [],
        'Drafts, Trash, Junk, scheduled mail, reminders and non-selectable folders stay excluded');
    $check(!$result['partial'] && $result['searchedFolders'] === 4 && $result['scope'] === 'account',
        'The explicit search reports its actual account scope');
    $check(array_reduce($actions->calls,fn($ok,$call) => $ok && !$call['threads'] && $call['threadUid'] === 0,true),
        'Explicit exchange never enables native threading on filed folder lists');
    $actions->failedFolders = ['Projects']; $actions->calls = [];
    $result = $plugin->Conversation();
    $check($result['partial'] && $result['failedFolders'] === 1 && count($result['messages']) >= 2,
        'One inaccessible folder reports partial results without discarding healthy folders');
    $check(count(array_filter($actions->calls,fn($call) => $call['folder'] === 'Projects')) === 1,
        'An inaccessible folder is attempted once, not once per header');
    $actions->failedFolders = []; $actions->calls = [];
    $actions->params['folder'] = 'Trash'; $plugin->Conversation();
    $check(in_array('Trash',array_column($actions->calls,'folder'),true), 'An explicitly opened excluded origin stays in scope');
    $actions->folderNames = array_map(fn($i) => 'Folder' . $i,range(1,100));
    $actions->calls = []; $actions->imap->calls = []; $result = $plugin->Conversation();
    $check($result['partial'] && $result['searchedFolders'] === 50 && count($actions->calls) <= 160,
        'Large account lookup reports folder/query budget truncation');
    $noise = array_map(fn($i) => message('Noise',1000+$i,'<noise@example.test>','','<unrelated@example.test>'),range(1,50));
    $actions->responses = [];
    foreach ($actions->folderNames as $folder) {
        $key = $folder . '|' . http_build_query(['header'=>'References ' . $root]);
        $actions->responses[$key] = [$noise,$noise,$noise,$noise];
        $actions->responses[$key . '|total'] = 200;
    }
    $actions->calls = []; $result = $plugin->Conversation();
    $check($result['partial'] && count($actions->calls) <= 160,
        'The account budget counts every pagination request, not only logical queries');
    $actions->params = ['scope'=>'account','folder'=>'Archive','uid'=>71]; $actions->calls = [];
    $result = $plugin->Conversation();
    $check($result['missingMessageId'] && !$actions->calls, 'A message without identifiers does not trigger speculative subject searches');

    // An IMAP server may return OK with no hits even for the source's own ID.
    // Its unfiltered native header pages still contain the correct relationships.
    $actions->brokenHeaderSearch = true;
    $actions->folderNames = ['INBOX','Sent','Projects','Drafts','Trash','Junk','Scheduled','Reminders'];
    $actions->params = ['scope'=>'account','folder'=>'INBOX','uid'=>11,'messageId'=>$root];
    $middle = '<middle@example.test>'; $last = '<last@example.test>';
    $noise = array_map(fn($i) => message('Sent',1000+$i,'<noise'.$i.'@example.test>'),range(1,49));
    $actions->responses = [
        'INBOX|' => [[message('INBOX',11,$root)]],
        'Sent|' => [array_merge([message('Sent',23,$last,$middle)],$noise),
            [message('Sent',21,$middle,$root),message('Sent',22,'<unrelated@example.test>','','<root@example.test.extra>')]],
        'Sent||total' => 52,
        'Projects|' => [[message('Projects',31,'<filed@example.test>',$last)]],
    ];
    $actions->calls = []; $actions->imap->calls = []; $result = $plugin->Conversation();
    $keys = array_map(fn($m) => $m->sFolder . '/' . $m->Uid, $result['messages']);
    $check(count($keys) === 4 && !array_diff(['INBOX/11','Sent/21','Sent/23','Projects/31'],$keys),
        'Broken HEADER search falls back to native header pages and joins reverse-order reply chains across folders');
    $check(!in_array('Sent/22',$keys,true), 'Fallback still rejects substring-only ID matches and unrelated messages');
    $check(!$result['partial'] && !$result['failedFolders'], 'An exhausted fallback reports a complete exchange');
    $transport = $actions->imap->calls;
    $check(count(array_filter($transport,fn($call) => str_contains($call['criteria']??'','HEADER'))) === 1
        && $transport[0]['uids'] === [11], 'The HEADER failure is detected with the verified source UID, then probed only once');
    $check(array_diff(array_unique(array_column($transport,'folder')),['INBOX','Sent','Projects']) === [],
        'Fallback preserves excluded-folder and account boundaries');
    $check(array_reduce($transport,fn($ok,$call) => $ok && $call['uid']
        && ($call['kind'] !== 'fetch' || count($call['uids']) <= 50
            && in_array('BODY.PEEK[HEADER.FIELDS (MESSAGE-ID REFERENCES IN-REPLY-TO SUBJECT DATE FROM TO)]',$call['items'],true)),true),
        'Fallback uses bounded UID header fetches with BODY.PEEK and no message bodies');

    $actions->failedFolders = ['Projects']; $actions->calls = [];
    $result = $plugin->Conversation();
    $check($result['partial'] && $result['failedFolders'] === 1 && count($result['messages']) === 3,
        'An inaccessible fallback folder preserves healthy results and reports incompleteness');
    $actions->failedFolders = [];
    unset($actions->params['scope']); $actions->calls = [];
    $result = $plugin->Conversation();
    $keys = array_map(fn($m) => $m->sFolder . '/' . $m->Uid, $result['messages']);
    $check(count($keys) === 3 && in_array('Sent/23',$keys,true) && !in_array('Projects/31',$keys,true),
        'Automatic Inbox fallback stays scoped to the source and configured Sent folder');
    $before = count($actions->imap->calls); $actions->params['etag'] = $result['etag'];
    $result = $plugin->Conversation();
    $check($result['unchanged'] && count($actions->imap->calls) === $before,
        'A successful fallback retains cheap unchanged-mailbox refreshes');
    unset($actions->params['etag']);
    $actions->params['scope'] = 'account';
    $actions->responses['Sent|'] = array_chunk(array_map(fn($i) => message('Sent',1000+$i,'<noise'.$i.'@example.test>'),range(1,8000)),50);
    $actions->responses['Sent||total'] = 10000;
    $actions->calls = []; $actions->imap->calls = []; $result = $plugin->Conversation();
    $check($result['partial'] && count($actions->imap->calls) <= 160 && count($result['messages']) <= 200,
        'Fallback cannot exceed the native-page budget and reports truncation');
    $check($actions->imap->calls[2]['folder'] === 'Sent', 'Account fallback prioritizes Sent before scanning a large source folder');

    $actions->responses['Sent|'] = array_chunk(array_map(fn($i) => message('Sent',3000+$i,'<reply'.$i.'@example.test>',$root),range(1,205)),50);
    $actions->imap->calls = []; $result = $plugin->Conversation();
    $check($result['partial'] && count($result['messages']) === 200,
        'More than 200 exactly connected messages reports the row ceiling');
    $actions->imap->calls = [];
    $expired = new ReflectionMethod(PiedWebConversation::class,'scanHeaders');
    $result = $expired->invoke(null,$actions,['Sent'],[$root],true,[],microtime(true)-13);
    $check($result['partial'] && !$actions->imap->calls,
        'An expired fallback deadline stops before any additional IMAP command');

    $actions->folderNames = ['INBOX','Sent','ServerDrafts','ServerJunk','ServerTrash'];
    $actions->folderRoles = ['ServerDrafts'=>'drafts','ServerJunk'=>'junk','ServerTrash'=>'trash'];
    $actions->responses['Sent|'] = [[message('Sent',21,$reply,$root)]];
    $actions->imap->calls = []; $result = $plugin->Conversation();
    $check(!$result['partial'] && $result['searchedFolders'] === 2
        && !array_intersect(['ServerDrafts','ServerJunk','ServerTrash'],array_column($actions->imap->calls,'folder')),
        'Native special-use roles exclude drafts, junk and trash even when local settings use other folder names');
    unset($actions->params['scope']); $actions->sent = '';
    $actions->folderRoles['Sent'] = 'sent';
    $result = $plugin->Conversation();
    $check(count($result['messages']) === 2,
        'Inbox finds the native SPECIAL-USE Sent folder before its local setting has been saved');
    $actions->sent = '__UNUSE__'; $result = $plugin->Conversation();
    $check(count($result['messages']) === 1,
        'Explicitly disabled Sent storage is not overridden by folder autodetection');

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
