<?php
namespace RainLoop\Model {
    class Account { public function __construct(private string $email) {} public function Email() { return $this->email; } }
    class AdditionalAccount extends Account { public function ParentEmail() { return 'owner@example.test'; } }
}
namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public function Manager() { return new class { public function JsonResponseHelper($name, $result) { return $result; } }; }
    }
}
namespace RainLoop { class Api { public static $actions; public static function Actions() { return self::$actions; } } }
namespace {
    spl_autoload_register(function ($class) {
        $path = getenv('NEXTSNAPMAIL_SOURCE') . '/app/snappymail/v/2.38.2/app/libraries/' . str_replace('\\', '/', $class) . '.php';
        if (is_file($path)) require_once $path;
    });
    require __DIR__ . '/../plugin/pied-web-ux/index.php';
    $root = sys_get_temp_dir() . '/pw-image-tests-' . bin2hex(random_bytes(8));
    $files = new \RainLoop\Providers\Files\FileStorage($root);
    $a = new \RainLoop\Model\Account('a@example.test');
    $b = new \RainLoop\Model\Account('b@example.test');
    $actions = new class($files, $a) {
        public string $key = 'nextcloud-file-test';
        public function __construct(public $files, public $account) {}
        public function getAccountFromToken() { return $this->account; }
        public function GetActionParam($name, $default) { return $this->key; }
        public function FilesProvider() { return $this->files; }
    };
    \RainLoop\Api::$actions = $actions;
    $plugin = new \PiedWebUxPlugin;
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8S8AAAAASUVORK5CYII=');
    $checks = 0;
    $check = function ($ok, $message) use (&$checks) { if (!$ok) throw new \RuntimeException($message); ++$checks; echo "PASS $message\n"; };
    $put = function ($account, $key, $bytes) use ($files) {
        $stream = fopen('php://temp', 'w+b'); fwrite($stream, $bytes); rewind($stream);
        $files->PutFile($account, $key, $stream); fclose($stream);
    };
    try {
        $_SERVER['REQUEST_METHOD'] = 'POST'; $put($a, $actions->key, $png);
        $check($plugin->AttachmentImage() === ['data'=>'data:image/png;base64,'.base64_encode($png)], 'Account-scoped native storage returns intact PNG');
        $actions->account = $b;
        $check(isset($plugin->AttachmentImage()['error']), 'Another account cannot read the same opaque key');
        $actions->account = new \RainLoop\Model\AdditionalAccount('linked@example.test');
        $check(isset($plugin->AttachmentImage()['error']), 'Linked accounts remain isolated');
        $actions->account = $a; $actions->key = '../../etc/passwd';
        $check(isset($plugin->AttachmentImage()['error']), 'Filesystem paths are rejected');
        $actions->key = 'absent';
        $check(isset($plugin->AttachmentImage()['error']), 'Expired attachment yields a generic error');
        $actions->key = 'document'; $put($a, $actions->key, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
        $check(isset($plugin->AttachmentImage()['error']), 'SVG and non-raster bytes cannot pass as an image');
        $actions->key = 'large'; $path = $files->GenerateLocalFullFileName($a, $actions->key);
        $stream = fopen($path, 'w+b'); ftruncate($stream, 20*1024*1024+1); fclose($stream);
        $check(isset($plugin->AttachmentImage()['error']), 'Oversized file rejected before reading its bytes');
        $actions->account = null;
        try { $plugin->AttachmentImage(); $rejected = false; } catch (\RuntimeException $error) { $rejected = true; }
        $check($rejected, 'Authentication required');
        $actions->account = $a; $_SERVER['REQUEST_METHOD'] = 'GET';
        try { $plugin->AttachmentImage(); $rejected = false; } catch (\RuntimeException $error) { $rejected = true; }
        $check($rejected, 'GET cannot access the endpoint');
        $check(file_get_contents($files->GetFileName($a, 'nextcloud-file-test')) === $png, 'Reading never changes the original attachment');
        echo "$checks checks passed\n";
    } finally {
        if (is_dir($root)) {
            foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST) as $path) {
                $path->isDir() ? rmdir($path) : unlink($path);
            }
            rmdir($root);
        }
    }
}
