<?php
namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public array $hooks = [];
        protected function addHook($name, $method) { $this->hooks[$name] = $method; }
        protected function addCss(...$args) {}
        protected function addJs(...$args) {}
        protected function addJsonHook(...$args) {}
    }
}
namespace RainLoop {
    class Api { public static $actions; public static function Actions() { return self::$actions; } }
}
namespace {
    spl_autoload_register(function ($class) {
        $path = getenv('NEXTSNAPMAIL_SOURCE') . '/app/snappymail/v/2.38.2/app/libraries/' . str_replace('\\', '/', $class) . '.php';
        if (is_file($path)) require_once $path;
    });
    require __DIR__ . '/../plugin/pied-web-ux/index.php';

    $imap = new class {
        public array $copies = [];
        public bool $fail = false;
        public function MessageAppendStream($folder, $stream, $size, $flags) {
            if ($this->fail) throw new \RuntimeException('fictional IMAP failure');
            $this->copies[] = [$folder, stream_get_contents($stream), $size, $flags];
            return 42;
        }
    };
    $actions = new class($imap) {
        public array $params = [];
        public function __construct(public $imap) {}
        public function GetActionParam($key, $default) { return $this->params[$key] ?? $default; }
        public function ImapClient() { return $this->imap; }
    };
    \RainLoop\Api::$actions = $actions;
    $plugin = new \PiedWebUxPlugin;
    $plugin->Init();
    $checks = 0;
    $check = function ($condition, $label) use (&$checks) {
        if (!$condition) throw new \RuntimeException($label);
        ++$checks; echo "PASS $label\n";
    };
    $check(($plugin->hooks['filter.send-message-stream'] ?? null) === 'CopyConversationReply', 'Native post-SMTP stream hook registered');
    $message = "Message-ID: <fictional@example.test>\r\nIn-Reply-To: <original@example.test>\r\n\r\nFictional reply";
    $stream = fopen('php://temp', 'w+b'); fwrite($stream, $message);
    $actions->params = ['draftInfo'=>['reply', 17, 'INBOX'], 'saveFolder'=>'Sent'];
    $plugin->CopyConversationReply(new \stdClass, $stream, strlen($message));
    $check(count($imap->copies) === 1 && $imap->copies[0][0] === 'INBOX' && $imap->copies[0][1] === $message, 'Reply copied intact into original folder');
    $check($imap->copies[0][2] === strlen($message) && $imap->copies[0][3] === [\MailSo\Imap\Enumerations\MessageFlag::SEEN], 'Copy is saved read with native IMAP flags');
    $check(ftell($stream) === 0 && stream_get_contents($stream) === $message, 'Normal Sent append can still read the same stream');

    $actions->params['draftInfo'] = ['reply-all', 18, 'Projects'];
    $plugin->CopyConversationReply(new \stdClass, $stream, strlen($message));
    $check(count($imap->copies) === 2 && $imap->copies[1][0] === 'Projects', 'Reply all uses the original folder');
    foreach ([['forward', 17, 'INBOX'], ['reply', 0, 'INBOX'], ['reply', 17, ''], ['reply', 17, 'Sent']] as $info) {
        $actions->params['draftInfo'] = $info;
        $plugin->CopyConversationReply(new \stdClass, $stream, strlen($message));
    }
    $check(count($imap->copies) === 2, 'Forward, invalid source and same-folder saves do not duplicate');
    $actions->params['draftInfo'] = ['reply', 17, 'INBOX'];
    $actions->params['saveFolder'] = '';
    $plugin->CopyConversationReply(new \stdClass, $stream, strlen($message));
    $check(count($imap->copies) === 2, 'Disabled Sent saving does not trigger the native stream hook path');
    $actions->params['saveFolder'] = 'Sent'; $imap->fail = true;
    $plugin->CopyConversationReply(new \stdClass, $stream, strlen($message));
    $check(ftell($stream) === 0 && count($imap->copies) === 2, 'Failed conversation copy leaves normal Sent stream available');
    fclose($stream);
    echo "$checks fictional transport checks passed\n";
}
