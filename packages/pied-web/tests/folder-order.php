<?php
namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public function Manager() { return new class { public function JsonResponseHelper($name, $data) { return $data; } }; }
    }
}
namespace RainLoop {
    class Api { public static $actions; public static function Actions() { return self::$actions; } }
}
namespace {
    final class FolderOrderTestSettings {
        public array $values = [];
        public int $saves = 0;
        public bool $saveResult = true;
        public function GetConf($name, $default = null) { return $this->values[$name] ?? $default; }
        public function SetConf($name, $value): void { $this->values[$name] = $value; }
        public function save(): bool { ++$this->saves; return $this->saveResult; }
    }
    final class FolderOrderTestActions {
        public array $params = [];
        public $account = true;
        public FolderOrderTestSettings $settings;
        public function __construct() { $this->settings = new FolderOrderTestSettings; }
        public function getAccountFromToken() { return $this->account; }
        public function GetActionParam($name, $default = null) { return $this->params[$name] ?? $default; }
        public function HasActionParam($name): bool { return \array_key_exists($name, $this->params); }
        public function SettingsProvider($local) {
            return new class($this->settings) {
                public function __construct(private FolderOrderTestSettings $settings) {}
                public function Load($account): FolderOrderTestSettings { return $this->settings; }
            };
        }
    }

    require __DIR__ . '/../plugin/pied-web-ux/index.php';
    $actions = new FolderOrderTestActions;
    \RainLoop\Api::$actions = $actions;
    $plugin = new \PiedWebUxPlugin;
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $count = 0;
    $check = function ($ok, $label) use (&$count) {
        if (!$ok) throw new \RuntimeException($label);
        ++$count; echo "PASS $label\n";
    };

    $actions->params = [];
    $check($plugin->FolderOrder() === ['order'=>[]] && $actions->settings->saves === 0,
        'Reading a new account returns the native order without writing');

    $wanted = ['folder:INBOX/Clients', 'folder:INBOX', 'feed:account'];
    $actions->params = ['order'=>json_encode($wanted)];
    $check($plugin->FolderOrder() === ['order'=>$wanted] && $actions->settings->saves === 1,
        'A unique account-scoped folder order is persisted');
    $actions->params = [];
    $check($plugin->FolderOrder() === ['order'=>$wanted], 'The stored order survives a later read');

    $actions->params = ['order'=>'["folder:INBOX","folder:INBOX"]'];
    $check(isset($plugin->FolderOrder()['error']) && $actions->settings->saves === 1,
        'Duplicate identifiers are rejected without overwriting the saved order');
    $actions->params = ['order'=>'{"not":"a list"}'];
    $check(isset($plugin->FolderOrder()['error']), 'Non-list payloads are rejected');
    $actions->params = ['order'=>json_encode(["folder:bad\nname"])];
    $check(isset($plugin->FolderOrder()['error']), 'Control characters are rejected');

    $actions->settings->values['PiedWebFolderOrderV1'] = '{damaged';
    $actions->params = [];
    $check($plugin->FolderOrder() === ['order'=>[]], 'A damaged optional preference falls back safely');

    $actions->settings->saveResult = false;
    $actions->params = ['order'=>json_encode(['folder:Archive'])];
    $check(isset($plugin->FolderOrder()['error']), 'Storage failures are reported');
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $check(isset($plugin->FolderOrder()['error']), 'Non-POST requests are rejected');
    echo "PASS $count folder-order checks\n";
}
