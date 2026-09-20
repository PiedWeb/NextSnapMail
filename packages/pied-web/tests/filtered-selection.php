<?php
namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public function Manager() { return new class {
            public function JsonResponseHelper($name, $data) { return $data; }
        }; }
    }
}
namespace RainLoop { class Api { public static $actions; public static function Actions() { return self::$actions; } } }
namespace {
    spl_autoload_register(function($class) {
        $path = getenv('NEXTSNAPMAIL_SOURCE') . '/app/snappymail/v/2.38.2/app/libraries/' . str_replace('\\', '/', $class) . '.php';
        if (is_file($path)) require_once $path;
    });
    require __DIR__ . '/../plugin/pied-web-ux/index.php';
    require __DIR__ . '/../plugin/pied-web-ux/FilteredSelection.php';
    define('APP_PRIVATE_DATA', sys_get_temp_dir() . '/pw-filtered-tests-' . bin2hex(random_bytes(8)) . '/');
    class FakeImap extends \MailSo\Imap\ImapClient {
        public array $capabilities = ['MOVE', 'UIDPLUS', 'MULTISEARCH'], $uids = [], $calls = [];
        public int $validity = 123;
        public bool $fail = false;
        public function __construct() { $this->Settings = (new \ReflectionClass(\MailSo\Imap\Settings::class))->newInstanceWithoutConstructor(); }
        public function hasCapability(string $name): bool { return in_array($name, $this->capabilities); }
        public function FolderSelect(string $folder, bool $force = false): \MailSo\Imap\FolderInformation {
            $this->calls[] = ['select', $folder, $force];
            $info = new \MailSo\Imap\FolderInformation($folder, true); $info->UIDVALIDITY = $this->validity; return $info;
        }
        public function FolderExamine(string $folder, bool $force = false): \MailSo\Imap\FolderInformation { return $this->FolderSelect($folder, $force); }
        public function MessageSearch(string $criteria, bool $uid = true): array { $this->calls[] = ['search', $criteria, $uid]; return $this->uids; }
        public function MessageMove(string $from, string $to, \MailSo\Imap\SequenceSet $range): void {
            $this->calls[] = ['move', $from, $to, $range->getArrayCopy(), $range->UID];
            if ($this->fail) throw new \RuntimeException('Disconnected');
        }
        public function MessageDelete(string $folder, \MailSo\Imap\SequenceSet $range, bool $all = false): void {
            $this->calls[] = ['delete', $folder, $range->getArrayCopy(), $range->UID, $all];
        }
    }
    class FakeActions {
        public array $params = [], $settings = ['TrashFolder' => 'Trash', 'HideDeleted' => 1];
        public string $account = 'account-A';
        public bool $authenticated = true;
        public FakeImap $imap;
        public function __construct() { $this->imap = new FakeImap; }
        public function GetActionParam($key, $default) { return $this->params[$key] ?? $default; }
        public function getAccountFromToken() {
            if (!$this->authenticated) throw new \RuntimeException('login required');
            return new class($this->account) {
                private $id;
                public function __construct($id) { $this->id = $id; }
                public function Hash() { return $this->id; }
                public function ImapConnectAndLogin(...$args) { return true; }
            };
        }
        public function ImapClient() { return $this->imap; }
        public function Plugins() { return null; }
        public function Config() { return null; }
        public function SettingsProvider($local) { return $this; }
        public function Load($account) { return $this; }
        public function GetConf($key, $default) { return $this->settings[$key] ?? $default; }
    }
    function check($condition, $message) { if (!$condition) throw new \RuntimeException($message); echo "PASS $message\n"; }
    $actions = new FakeActions; \RainLoop\Api::$actions = $actions;
    $plugin = new \PiedWebUxPlugin;
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $base = ['folder' => 'INBOX', 'search' => 'from:newsletter@example.test'];
    $call = function($params) use ($plugin, $actions, $base) { $actions->params = $params + $base; return $plugin->FilteredSelection(); };
    $mutationCount = fn() => count(array_filter($actions->imap->calls, fn($c) => in_array($c[0], ['move', 'delete'])));
    try {
        $actions->imap->uids = range(1, 451);
        $selection = $call(['operation' => 'prepare']);
        check(($selection['count'] ?? 0) === 451 && $mutationCount() === 0, 'Preparation counts every page without changing mail');
        check(in_array(['search', 'FROM "newsletter@example.test" UNDELETED', true], $actions->imap->calls, true), 'Uses native search parser, deleted visibility and UID search');
        $file = APP_PRIVATE_DATA . 'pied-web-ux/selections/' . hash('sha256', $actions->account) . '/' . $selection['token'] . '.json';
        check((fileperms($file) & 0777) === 0600, 'Snapshot is private');
        $delete = ['operation' => 'delete', 'token' => $selection['token'], 'cursor' => 0, 'confirmed' => '1'];
        check($call($delete + ['search' => 'different'])['error'] === 'scope', 'Filter changes cannot reuse the selection');
        check($call($delete + ['folder' => 'Archive'])['error'] === 'scope', 'Folder changes cannot reuse the selection');
        $actions->account = 'account-B';
        check($call($delete)['error'] === 'expired', 'Another account cannot use the selection');
        $actions->account = 'account-A';
        $actions->imap->validity = 124;
        check($call($delete)['error'] === 'changed' && $mutationCount() === 0, 'UIDVALIDITY changes block all mutations');
        $actions->imap->validity = 123;
        $actions->settings['TrashFolder'] = 'NewTrash';
        check($call($delete)['error'] === 'scope', 'Trash mapping changes require a new confirmation');
        $actions->settings['TrashFolder'] = 'Trash';
        $actions->imap->uids[] = 99999;
        $first = $call($delete);
        check($first['cursor'] === 200 && !$first['done'], 'First batch processes at most 200 messages');
        $calls = $mutationCount(); $retry = $call($delete);
        check($retry === $first && $mutationCount() === $calls, 'Retry of an acknowledged batch does not repeat a move');
        $second = $call(array_replace($delete, ['cursor' => 200]));
        $last = $call(array_replace($delete, ['cursor' => 400]));
        $moved = [];
        foreach ($actions->imap->calls as $c) if ($c[0] === 'move') $moved = array_merge($moved, $c[3]);
        check($last['done'] && $moved === range(1, 451), 'All selected UIDs processed once; later arrivals excluded');
        $calls = $mutationCount(); $call(array_replace($delete, ['cursor' => 451]));
        check($mutationCount() === $calls, 'Completed selection is idempotent');
        $actions->imap->capabilities = ['UIDPLUS'];
        check($call(['operation' => 'prepare'])['error'] === 'capability', 'No broad EXPUNGE fallback without MOVE');
        $actions->imap->capabilities = ['MOVE', 'UIDPLUS', 'MULTISEARCH'];
        check($call(['operation' => 'prepare', 'search' => 'in:subtree from:news@example.test'])['error'] === 'scope', 'Multi-folder search cannot be treated as one folder');
        $unfiltered = $call(['operation' => 'prepare', 'search' => '']);
        check(($unfiltered['count'] ?? 0) === count($actions->imap->uids), 'An explicit single-folder selection can cover all pages without a search query');
        $actions->settings['TrashFolder'] = '__UNUSE__';
        check($call(['operation' => 'prepare'])['error'] === 'trash', 'No implicit permanent deletion when Trash is disabled');
        $actions->settings['TrashFolder'] = 'Trash';
        $permanent = $call(['operation' => 'prepare', 'folder' => 'Trash']);
        check($permanent['permanent'], 'Trash selection explicitly reports permanent deletion');
        $pdelete = ['operation' => 'delete', 'folder' => 'Trash', 'token' => $permanent['token'], 'cursor' => 0, 'confirmed' => '1'];
        $call($pdelete); $tail = end($actions->imap->calls);
        check($tail[0] === 'delete' && $tail[3] === true && $tail[4] === false, 'Permanent deletion uses UIDs and disables folder-wide EXPUNGE');
        $actions->imap->capabilities = ['MOVE'];
        check($call(['operation' => 'prepare', 'folder' => 'Trash'])['error'] === 'capability', 'Permanent deletion requires UIDPLUS');
        $actions->imap->capabilities = ['MOVE', 'UIDPLUS'];
        $uncertain = $call(['operation' => 'prepare']);
        $actions->imap->fail = true;
        $udelete = array_replace($delete, ['token' => $uncertain['token']]);
        check($call($udelete)['error'] === 'mail', 'Connection failure is surfaced');
        $calls = $mutationCount();
        check($call($udelete)['error'] === 'uncertain' && $calls === $mutationCount(), 'Uncertain batch is not retried');
        $actions->imap->fail = false;
        $expired = json_decode(file_get_contents($file), true); $expired['expires'] = time() - 1; file_put_contents($file, json_encode($expired));
        check($call($delete)['error'] === 'expired', 'Expired selection is rejected');
        check($call(array_replace($delete, ['confirmed' => '0']))['error'] === 'scope', 'Mutation requires confirmation');
        $actions->authenticated = false;
        try { $call(['operation' => 'prepare']); throw new \LogicException('Authentication bypass'); }
        catch (\RuntimeException $e) { check($e->getMessage() === 'login required', 'Login is required before any search'); }
        $actions->authenticated = true; $_SERVER['REQUEST_METHOD'] = 'GET';
        try { $call($delete); throw new \LogicException('Method bypass'); }
        catch (\RuntimeException $e) { check($e->getMessage() === 'POST required', 'GET cannot mutate messages'); }
        echo "All checks passed with mocked IMAP; no network or real mail used.\n";
    } finally {
        if (is_dir(APP_PRIVATE_DATA)) {
            $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(APP_PRIVATE_DATA, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
            foreach ($files as $file) $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
            rmdir(APP_PRIVATE_DATA);
        }
    }
}
