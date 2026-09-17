<?php
namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public function Manager() { return new class { public function JsonResponseHelper($name, $data) { return $data; } }; }
    }
}
namespace RainLoop { class Api { public static $actions; public static function Actions() { return self::$actions; } } }
namespace {
    require __DIR__ . '/../plugin/pied-web-ux/index.php';
    $settings = new class {
        public array $values = []; public bool $saveResult = true; public int $saves = 0;
        public function GetConf($name, $default) { return $this->values[$name] ?? $default; }
        public function SetConf($name, $value) { $this->values[$name] = $value; }
        public function save() { ++$this->saves; return $this->saveResult; }
    };
    $actions = new class($settings) {
        public $account; public $settings; public array $params = [];
        public function __construct($settings) { $this->account = new \stdClass; $this->settings = $settings; }
        public function getAccountFromToken() { return $this->account; }
        public function SettingsProvider($local) { if (!$local) throw new \RuntimeException('local settings required'); return $this; }
        public function Load($account) { return $this->settings; }
        public function HasActionParam($name) { return \array_key_exists($name, $this->params); }
        public function GetActionParam($name, $default) { return $this->params[$name] ?? $default; }
    };
    \RainLoop\Api::$actions = $actions; $plugin = new \PiedWebUxPlugin;
    $n = 0; $check = function($ok, $label) use (&$n) { if (!$ok) throw new \RuntimeException($label); ++$n; echo "PASS $label\n"; };

    $_SERVER['REQUEST_METHOD'] = 'POST';
    $check($plugin->UnreadOrder() === ['enabled'=>false] && $settings->saves === 0,
        'The per-account preference defaults off and a read does not write settings');
    $actions->params = ['enabled'=>'1'];
    $check($plugin->UnreadOrder() === ['enabled'=>true] && $settings->saves === 1
        && $settings->values['PiedWebUnreadOldestFirst'] === true,
        'Enabling persists the boolean in the active account local settings');
    $actions->params = [];
    $check($plugin->UnreadOrder() === ['enabled'=>true] && $settings->saves === 1,
        'The saved state is returned on the next load');
    $actions->params = ['enabled'=>0];
    $check($plugin->UnreadOrder() === ['enabled'=>false] && $settings->saves === 2,
        'Disabling persists and returns the resulting state');
    foreach (['yes', 2, -1, null] as $invalid) {
        $before = $settings->saves; $actions->params = ['enabled'=>$invalid];
        $check(isset($plugin->UnreadOrder()['error']) && $settings->saves === $before,
            'Invalid state is rejected without a settings write');
    }
    $settings->saveResult = false; $actions->params = ['enabled'=>1];
    $check(isset($plugin->UnreadOrder()['error']), 'A failed settings write is reported');
    $settings->saveResult = true; $actions->account = null; $actions->params = [];
    $check(isset($plugin->UnreadOrder()['error']), 'Authentication is required');
    $actions->account = new \stdClass; $_SERVER['REQUEST_METHOD'] = 'GET';
    $check(isset($plugin->UnreadOrder()['error']), 'POST is required (the native dispatcher also checks CSRF)');
    echo "$n preference checks passed; no mailbox access\n";
}
