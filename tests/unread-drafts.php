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
    class ReadOnlyImap extends \MailSo\Imap\ImapClient {
        public function __construct() { $this->Settings = (new \ReflectionClass(\MailSo\Imap\Settings::class))->newInstanceWithoutConstructor(); }
        public function hasCapability(string $name): bool { return false; }
    }
    $actions = new class {
        public $account; public string $folder = 'INBOX.Brouillons'; public array $params = [], $calls = [];
        public $imap; public $collection;
        public function __construct() {
            $this->imap = new ReadOnlyImap;
            $this->account = new class { public int $logins = 0; public function ImapConnectAndLogin(...$args) { ++$this->logins; } };
            $this->collection = new \MailSo\Mail\MessageCollection; $this->collection->totalEmails = 27;
        }
        public function getAccountFromToken() { return $this->account; }
        public function SettingsProvider($local) { return $this; }
        public function Load($account) { return $this; }
        public function GetConf($name, $default) { return $this->folder; }
        public function GetActionParam($name, $default) { return $this->params[$name] ?? $default; }
        public function Plugins() { return null; }
        public function Config() { return null; }
        public function ImapClient() { return $this->imap; }
        public function MailClient() { return $this; }
        public function MessageList($params) { $this->calls[] = $params; return $this->collection; }
        public string $hash = 'etag-1'; public int $hashCalls = 0;
        public function FolderHash($folder) { ++$this->hashCalls; return $this->hash; }
    };
    \RainLoop\Api::$actions = $actions; $plugin = new \PiedWebUxPlugin;
    $n = 0; $check = function($ok, $label) use (&$n) { if (!$ok) throw new \RuntimeException($label); ++$n; echo "PASS $label\n"; };
    $_SERVER['REQUEST_METHOD'] = 'POST'; $result = $plugin->UnreadDrafts(); $params = $actions->calls[0];
    $check($result['folder'] === 'INBOX.Brouillons', 'Uses the actual configured Drafts folder');
    $check($params->sFolderName === 'INBOX.Brouillons' && $params->sSearch === 'is:unseen', 'Only unread drafts are requested');
    $cache = false; $criteria = (string) \MailSo\Imap\SearchCriterias::fromString($actions->imap, $params->sFolderName, $params->sSearch, $params->bHideDeleted, $cache);
    $check(str_contains($criteria, 'UNSEEN') && str_contains($criteria, 'UNDELETED') && !str_contains($criteria, 'DRAFT'), 'Native parser means UNSEEN and UNDELETED, independent of the Draft flag');
    $check(!$params->bUseThreads && $params->sSort === 'REVERSE DATE', 'Newest drafts first, independent of Inbox thread mode');
    $check($params->iLimit === 10 && $params->iOffset === 0, 'Bounded first page');
    $check($result['messages'] === $actions->collection && $result['messages']->totalEmails === 27, 'Preserves the full native filtered count for pagination');
    $check($result['etag'] === 'etag-1' && $result['unchanged'] === false, 'First read returns the Drafts folder state');

    // An unchanged Drafts folder must cost one STATUS and no search.
    $before = count($actions->calls); $actions->params = ['offset'=>0,'etag'=>'etag-1'];
    $result = $plugin->UnreadDrafts();
    $check($result['unchanged'] === true && $result['messages'] === null && count($actions->calls) === $before,
        'Unchanged Drafts folder skips the search and the header fetch');
    $actions->params = ['offset'=>0,'etag'=>'stale'];
    $result = $plugin->UnreadDrafts();
    $check($result['unchanged'] === false && count($actions->calls) === $before + 1, 'A moved Drafts folder is read again');
    $before = count($actions->calls); $actions->params = ['offset'=>20,'etag'=>'etag-1'];
    $plugin->UnreadDrafts();
    $check(count($actions->calls) === $before + 1, 'Pagination never takes the unchanged shortcut');
    $actions->params = [];
    $actions->params = ['offset'=>20,'folder'=>'Trash','search'=>'','limit'=>99999,'useThreads'=>1];
    $plugin->UnreadDrafts(); $params = end($actions->calls);
    $check($params->iOffset === 20 && $params->iLimit === 10, 'Later pages do not truncate the unread feed to the first page');
    $check($params->sFolderName === 'INBOX.Brouillons' && $params->sSearch === 'is:unseen' && !$params->bUseThreads, 'Client cannot broaden the folder, criteria or page size');
    foreach ([-1,3,1000010,'invalid'] as $offset) {
        $before = count($actions->calls); $actions->params = ['offset'=>$offset];
        $check(isset($plugin->UnreadDrafts()['error']) && count($actions->calls) === $before, 'Invalid offset rejected: ' . $offset);
    }
    $actions->params = [];
    foreach (['','__UNUSE__','INBOX','inbox'] as $folder) {
        $actions->folder = $folder; $before = count($actions->calls); $hashBefore = $actions->hashCalls; $result = $plugin->UnreadDrafts();
        $check($result === ['folder'=>'','messages'=>null] && count($actions->calls) === $before && $actions->hashCalls === $hashBefore, 'Disabled/Inbox folder mapping cannot expose received mail as drafts: ' . $folder);
    }
    $actions->folder = 'Drafts-other-account'; $plugin->UnreadDrafts();
    $check(end($actions->calls)->sFolderName === 'Drafts-other-account', 'Current account settings are reloaded on every request');
    $actions->account = null; $before = count($actions->calls);
    $check(isset($plugin->UnreadDrafts()['error']) && count($actions->calls) === $before, 'Authentication required before querying mail');
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $check(isset($plugin->UnreadDrafts()['error']) && count($actions->calls) === $before, 'POST required (native dispatcher also enforces CSRF)');
    echo "$n read-only checks passed; no mail access or mutation\n";
}
