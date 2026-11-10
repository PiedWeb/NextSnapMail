<?php
// Exercise the real controller with in-memory Nextcloud and mail-service doubles.
namespace OCP\AppFramework { class Controller {} }
namespace OCP\AppFramework\Http {
    class TemplateResponse {
        public function __construct(public string $app, public string $template, public array $params) {}
        public function setContentSecurityPolicy($policy): void {}
    }
}
namespace OCP {
    interface IConfig {}
    interface INavigationManager {}
    class Util {
        public static function addScript(...$args): void {}
        public static function addStyle(...$args): void {}
    }
}
namespace OCA\NextSnapMail {
    class ContentSecurityPolicy {
        public function addAllowedFrameDomain($domain): void {}
        public function getPolicy() { return null; }
    }
}
namespace OCA\NextSnapMail\Util {
    class SnappyMailHelper {
        public static bool $admin = false;
        public static int $handled = 0;
        public static function loadApp(): void {}
        public static function ensureAdminSession(): void {
            if (!self::$admin) throw new \RuntimeException('Admin required');
        }
        public static function startApp(bool $handle = false) {
            if ($handle) { self::$handled++; return 'service'; }
        }
        public static function normalizeUrl(string $url): string { return $url; }
        public static function getAppUrl(): string { return '/apps/nextsnapmail/app/'; }
    }
}
namespace RainLoop {
    class Api {
        public static function Config() {
            return new class {
                public function Get($section, $name, $default) {
                    return $section === 'admin_panel' && $name === 'key' ? 'private-admin' : $default;
                }
            };
        }
    }
}
namespace {
    use OCA\NextSnapMail\Util\SnappyMailHelper;
    class OC { public static $server; }
    OC::$server = new class {
        public function get($name) {
            return new class {
                public function getAppValue(...$args) { return true; }
                public function setActiveEntry(...$args): void {}
            };
        }
    };
    require __DIR__ . '/../lib/Controller/PageController.php';
    $controller = new OCA\NextSnapMail\Controller\PageController();
    $checks = 0;
    function check(bool $ok, string $name): void {
        global $checks;
        if (!$ok) throw new RuntimeException($name);
        $checks++;
    }
    function query(string $value): void {
        $_SERVER['QUERY_STRING'] = $value;
        parse_str($value, $_GET);
    }
    query('account=' . str_repeat('a', 40) . '&target=' . rawurlencode('mailbox/INBOX'));
    $response = $controller->index();
    check($response->template === 'index', 'An account URL enters the Nextcloud shell');
    check(str_contains(html_entity_decode($response->params['nextsnapmail-iframe-url']), '?account=' . str_repeat('a', 40) . '#mailbox/INBOX'), 'The shell preserves tab-local account and target');
    check(SnappyMailHelper::$handled === 0, 'Shell query does not become a raw service request');
    foreach (['index', 'indexPost', 'appGet', 'appPost'] as $method) {
        foreach (['private-admin', 'private-admin/Json&account=' . str_repeat('b', 40)] as $route) {
            query($route);
            $before = SnappyMailHelper::$handled;
            $blocked = false;
            try { $controller->$method(); } catch (RuntimeException $e) { $blocked = true; }
            check($blocked && SnappyMailHelper::$handled === $before, $method . ' rejects non-admin requests before dispatch');
        }
    }
    foreach (['admin', 'adminPost'] as $method) {
        query('Json');
        $blocked = false;
        try { $controller->$method(); } catch (RuntimeException $e) { $blocked = true; }
        check($blocked, $method . ' requires an administrator');
        SnappyMailHelper::$admin = true;
        check($controller->$method() === 'service', $method . ' dispatches authenticated requests');
        check($_SERVER['QUERY_STRING'] === 'private-admin/Json', 'Integrated route is prefixed exactly once');
        SnappyMailHelper::$admin = false;
    }
    SnappyMailHelper::$admin = true;
    query('private-admin/Json');
    check($controller->adminPost() === 'service' && $_SERVER['QUERY_STRING'] === 'private-admin/Json', 'An existing admin prefix is retained');
    query('Json&account=' . str_repeat('c', 40));
    SnappyMailHelper::$admin = false;
    check($controller->index() === 'service', 'Normal mail services retain their account query');
    echo $checks . " controller routing checks passed\n";
}
