<?php
namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public function Manager() { return new class { public function JsonResponseHelper($name, $data) { return $data; } }; }
    }
}
namespace RainLoop {
    class Api { public static $actions; public static function Actions() { return self::$actions; } }
}
namespace RainLoop\Model {
    class AdditionalAccount {
        public static function NewInstanceFromTokenArray($actions, $token, $throw = false) { return $token['account'] ?? null; }
    }
}
namespace MailSo\Mail {
    class MessageListParams {
        public string $sFolderName = '', $sSearch = '', $sSort = '', $sThreadAlgorithm = '';
        public bool $bHideDeleted = true, $bUseThreads = false;
        public int $iOffset = 0, $iLimit = 0;
        public $oCacher = null;
    }
}
namespace {
    final class FeedTestAccount {
        public function __construct(private string $email, private string $hash) {}
        public function Email(): string { return $this->email; }
        public function Hash(): string { return $this->hash; }
    }
    final class FeedTestSettings {
        public array $values = [];
        public int $saves = 0;
        public bool $saveResult = true;
        public function GetConf($name, $default = null) { return $this->values[$name] ?? $default; }
        public function SetConf($name, $value): void { $this->values[$name] = $value; }
        public function save(): bool { ++$this->saves; return $this->saveResult; }
    }
    final class FeedTestMessage implements \JsonSerializable {
        public function __construct(private array $data) {}
        public function jsonSerialize(): array { return $this->data; }
    }
    final class FeedTestCollection implements \IteratorAggregate {
        public int $totalEmails;
        public object $FolderInfo;
        public function __construct(private array $rows, ?int $total = null, int $validity = 123) {
            $this->totalEmails = $total ?? \count($rows);
            $this->FolderInfo = (object) ['UIDVALIDITY' => $validity];
        }
        public function getIterator(): \Traversable { return new \ArrayIterator($this->rows); }
    }
    final class FeedTestMail {
        public array $calls = [];
        public function __construct(private string $email) {}
        public function MessageList($params): FeedTestCollection {
            $this->calls[] = clone $params;
            $rows = [];
            if ($params->sFolderName === 'INBOX' && $params->sSearch === '') {
                $rows = $this->email === 'main@example.test'
                    ? [new FeedTestMessage(['folder'=>'INBOX','uid'=>10,'subject'=>'Unread main','flags'=>[], 'threadUnseen'=>[], 'dateTimestamp'=>100]),
                       new FeedTestMessage(['folder'=>'INBOX','uid'=>11,'subject'=>'Read main','flags'=>['\\Seen'], 'threadUnseen'=>[], 'dateTimestamp'=>300])]
                    : [new FeedTestMessage(['folder'=>'INBOX','uid'=>10,'subject'=>'Unread work','flags'=>[], 'threadUnseen'=>[], 'dateTimestamp'=>200])];
            } elseif ($params->sFolderName === 'INBOX' && $params->sSearch === 'is:unseen') {
                $rows = $this->email === 'main@example.test'
                    ? [new FeedTestMessage(['folder'=>'INBOX','uid'=>10,'subject'=>'Unread main','flags'=>[], 'threadUnseen'=>[], 'dateTimestamp'=>100])]
                    : [new FeedTestMessage(['folder'=>'INBOX','uid'=>10,'subject'=>'Unread work','flags'=>[], 'threadUnseen'=>[], 'dateTimestamp'=>200])];
            } elseif ($params->sFolderName === 'Drafts' && $params->sSearch === 'is:unseen') {
                $rows = [new FeedTestMessage(['folder'=>'Drafts','uid'=>10,'subject'=>'Draft '.$this->email,'flags'=>[], 'threadUnseen'=>[], 'dateTimestamp'=>50])];
            }
            return new FeedTestCollection($rows, null, $params->sFolderName === 'Drafts' ? 456 : 123);
        }
    }
    final class FeedTestActions {
        public array $params = [], $accounts = [], $mails = [], $failingAccounts = [];
        public FeedTestSettings $shared;
        public function __construct(public FeedTestAccount $main, public FeedTestAccount $active, public array $locals) {
            $this->shared = new FeedTestSettings;
        }
        public function getAccountFromToken() { return $this->active; }
        public function getMainAccountFromToken() { return $this->main; }
        public function GetAccounts($main): array { return $this->accounts; }
        public function GetActionParam($name, $default = null) { return $this->params[$name] ?? $default; }
        public function HasActionParam($name): bool { return \array_key_exists($name, $this->params); }
        public function SettingsProvider($local) {
            return new class($this, $local) {
                public function __construct(private FeedTestActions $actions, private bool $local) {}
                public function Load($account) {
                    return $this->local ? $this->actions->locals[$account->Hash()] : $this->actions->shared;
                }
            };
        }
        public function PiedWebFeedMailClient($account): FeedTestMail {
            if (in_array($account->Email(), $this->failingAccounts, true)) {
                throw new \RuntimeException('mail');
            }
            return $this->mails[$account->Email()] ??= new FeedTestMail($account->Email());
        }
    }

    require __DIR__ . '/../plugin/pied-web-ux/index.php';
    $main = new FeedTestAccount('main@example.test', 'main-hash');
    $work = new FeedTestAccount('work@example.test', 'work-hash');
    $localMain = new FeedTestSettings;
    $localMain->values = ['DraftsFolder'=>'Drafts','UseThreads'=>true,'threadAlgorithm'=>'REFERENCES'];
    $localWork = new FeedTestSettings;
    $localWork->values = ['DraftsFolder'=>'Drafts','UseThreads'=>false];
    $actions = new FeedTestActions($main, $main, ['main-hash'=>$localMain,'work-hash'=>$localWork]);
    $actions->accounts = ['work@example.test'=>['name'=>'Work','account'=>$work]];
    \RainLoop\Api::$actions = $actions;
    $plugin = new \PiedWebUxPlugin;
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $count = 0;
    $check = function($ok, $label) use (&$count) {
        if (!$ok) throw new \RuntimeException($label);
        ++$count; echo "PASS $label\n";
    };

    $actions->params = ['operation'=>'settings'];
    $state = $plugin->Feed();
    $check($state === ['defaultView'=>'auto','showDrafts'=>true,'showRead'=>true,'includeGlobal'=>true,'accountCount'=>2,
        'compact'=>false,'lastView'=>'','lastFolder'=>'','lastAccountHash'=>''],
        'Feed settings default to the current workflow and detect both accounts');
    $check($localMain->saves === 0 && $actions->shared->saves === 0,
        'Reading Feed settings performs no write');

    $actions->params = ['operation'=>'settings','defaultView'=>'inbox','showDrafts'=>'0','showRead'=>1,'includeGlobal'=>false];
    $state = $plugin->Feed();
    $check($state['defaultView'] === 'inbox' && !$state['showDrafts'] && $state['showRead'] && !$state['includeGlobal'],
        'Shared opening view and per-account Feed switches are persisted');
    $check($localMain->saves === 1 && $actions->shared->saves === 1,
        'Each touched settings scope is saved once');

    $localMain->values['PiedWebFeedShowDrafts'] = true;
    $localMain->values['PiedWebFeedIncludeGlobal'] = true;
    $actions->params = ['operation'=>'global'];
    $global = $plugin->Feed();
    $check(\count($global['accounts']) === 2 && \count($global['items']) === 5,
        'The global Feed combines two account-safe message sets and deduplicates unread rows');
    $keys = \array_map(fn($item) => $item['_pwAccountEmail'].'|'.$item['folder'].'|'.$item['uid'], $global['items']);
    $check(\count($keys) === \count(\array_unique($keys)),
        'Account, folder and UID form a collision-free row identity');
    $check(\count(\array_filter($global['items'], fn($item) => $item['_pwKind'] === 'draft')) === 2,
        'Unread drafts stay distinct and retain their source account');
    $check(!\array_filter($global['items'], fn($item) => $item['_pwUidValidity'] !== ($item['_pwKind'] === 'draft' ? 456 : 123)),
        'Global Inbox and Drafts rows carry their own folder UIDVALIDITY');
    $check($actions->mails['main@example.test']->calls[0]->bUseThreads
        && !$actions->mails['work@example.test']->calls[0]->bUseThreads,
        'Each account keeps its own Conversations preference');

    $localWork->values['PiedWebFeedIncludeGlobal'] = false;
    $actions->params = ['operation'=>'global'];
    $global = $plugin->Feed();
    $check(\count($global['accounts']) === 1
        && \count(\array_filter($global['items'], fn($item) => $item['_pwAccountEmail'] === 'work@example.test')) === 0,
        'A per-account switch excludes that mailbox from the global Feed');

    $localWork->values['PiedWebFeedIncludeGlobal'] = true;
    $actions->failingAccounts = ['work@example.test'];
    $actions->params = ['operation'=>'global'];
    $global = $plugin->Feed();
    $check(\count($global['accounts']) === 2
        && $global['accounts'][0]['error'] === '' && $global['accounts'][1]['error'] === 'mail'
        && \count(\array_filter($global['items'], fn($item) => $item['_pwAccountEmail'] === 'main@example.test')) === 3,
        'One unavailable mailbox is reported without hiding the successful account');
    $actions->failingAccounts = [];

    $actions->params = ['operation'=>'settings','defaultView'=>'last','compact'=>'1','lastView'=>'folder',
        'lastFolder'=>'Projects','lastAccountHash'=>'work-hash'];
    $state = $plugin->Feed();
    $check($state['compact'] && $state['defaultView'] === 'last' && $state['lastView'] === 'folder'
        && $state['lastFolder'] === 'Projects' && $state['lastAccountHash'] === 'work-hash',
        'Compact mode and exact last folder/account persist as shared user preferences');
    $actions->active = $work;
    $actions->params = ['operation'=>'settings'];
    $check($plugin->Feed()['lastAccountHash'] === 'work-hash' && $plugin->Feed()['compact'],
        'Linked accounts read the same shared presentation preferences');
    $actions->active = $main;
    $actions->params = ['operation'=>'settings','lastView'=>'feed','lastAccountHash'=>'foreign-hash'];
    $check(isset($plugin->Feed()['error']), 'Last-view persistence rejects an unauthorized account hash');
    $actions->params = ['operation'=>'settings','compact'=>'yes'];
    $check(isset($plugin->Feed()['error']), 'Compact mode rejects non-boolean values');
    $actions->params = ['operation'=>'settings','lastView'=>'folder','lastFolder'=>"bad\nfolder"];
    $check(isset($plugin->Feed()['error']), 'Last-folder persistence rejects control characters');

    $actions->params = ['operation'=>'settings','defaultView'=>'unknown'];
    $check(isset($plugin->Feed()['error']), 'Invalid opening views are rejected');
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $actions->params = ['operation'=>'settings'];
    $check(isset($plugin->Feed()['error']), 'Feed endpoints require POST');
    echo "$count Feed checks passed; no mailbox access\n";
}
