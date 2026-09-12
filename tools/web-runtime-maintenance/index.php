<?php
class PiedWebRuntimeMaintenancePlugin extends \RainLoop\Plugins\AbstractPlugin {
    const NAME = 'Temporary Pied Web runtime check', VERSION = '1.0.0', REQUIRED = '2.38.2';
    public function Init(): void { $this->addJsonHook('PiedWebRuntimeCheck', 'Check'); }
    public function Check(): array {
        $actions = \RainLoop\Api::Actions();
        $user = \OC::$server->get(\OCP\IUserSession::class)->getUser();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !$actions->getAccountFromToken() || !$user || !\OC_User::isAdminUser($user->getUID())) throw new \RuntimeException('Forbidden');
        $root = APP_PLUGINS_PATH . 'pied-web-ux/';
        $out = ['version' => PiedWebUxPlugin::VERSION, 'validate_timestamps' => ini_get('opcache.validate_timestamps'), 'revalidate_freq' => ini_get('opcache.revalidate_freq'), 'sapi' => PHP_SAPI];
        foreach (['index.php', 'UnreadDrafts.php', 'FilteredSelection.php', 'AttachmentImage.php'] as $file) {
            $out['files'][$file] = ['cached' => function_exists('opcache_is_script_cached') && opcache_is_script_cached($root . $file)];
            if ($actions->GetActionParam('invalidate', '') === '1') $out['files'][$file]['invalidated'] = function_exists('opcache_invalidate') && opcache_invalidate($root . $file, true);
        }
        return $this->Manager()->JsonResponseHelper('PiedWebRuntimeCheck', $out);
    }
}
