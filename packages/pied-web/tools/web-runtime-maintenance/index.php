<?php
class PiedWebRuntimeMaintenanceV11Plugin extends \RainLoop\Plugins\AbstractPlugin {
    const NAME = 'Temporary Pied Web runtime check', VERSION = '1.2.0', REQUIRED = '2.38.2';
    public function Init(): void { $this->addJsonHook('PiedWebRuntimeCheck', 'Check'); }
    public function Check(): array {
        $actions = \RainLoop\Api::Actions();
        $user = \OC::$server->get(\OCP\IUserSession::class)->getUser();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !$actions->getAccountFromToken() || !$user || !\OC_User::isAdminUser($user->getUID())) throw new \RuntimeException('Forbidden');
        $root = APP_PLUGINS_PATH . 'pied-web-ux/';
        $out = ['version' => PiedWebUxPlugin::VERSION, 'validate_timestamps' => ini_get('opcache.validate_timestamps'), 'revalidate_freq' => ini_get('opcache.revalidate_freq'), 'sapi' => PHP_SAPI];
        $files = [
            'plugin/index.php' => $root . 'index.php',
            'plugin/AttachmentImage.php' => $root . 'AttachmentImage.php',
            'plugin/Conversation.php' => $root . 'Conversation.php',
            'plugin/Feed.php' => $root . 'Feed.php',
            'plugin/MailboxOperations.php' => $root . 'MailboxOperations.php',
            'plugin/MailboxMailClient.php' => $root . 'MailboxMailClient.php',
            'plugin/FilteredSelection.php' => $root . 'FilteredSelection.php',
            'plugin/FolderOrder.php' => $root . 'FolderOrder.php',
            'plugin/Reminders.php' => $root . 'Reminders.php',
            'plugin/ScheduledSend.php' => $root . 'ScheduledSend.php',
            'plugin/UnreadDrafts.php' => $root . 'UnreadDrafts.php',
            'plugin/UnreadOrder.php' => $root . 'UnreadOrder.php',
            'core/PageController.php' => '/home/robindfr/nextcloud/apps/nextsnapmail/lib/Controller/PageController.php',
            'core/Actions.php' => APP_VERSION_ROOT_PATH . 'app/libraries/RainLoop/Actions.php',
            'core/Accounts.php' => APP_VERSION_ROOT_PATH . 'app/libraries/RainLoop/Actions/Accounts.php',
            'core/UserAuth.php' => APP_VERSION_ROOT_PATH . 'app/libraries/RainLoop/Actions/UserAuth.php',
            'core/ServiceActions.php' => APP_VERSION_ROOT_PATH . 'app/libraries/RainLoop/ServiceActions.php',
        ];
        foreach ($files as $name => $file) {
            $out['files'][$name] = ['cached' => function_exists('opcache_is_script_cached') && opcache_is_script_cached($file)];
            if ($actions->GetActionParam('invalidate', '') === '1') $out['files'][$name]['invalidated'] = function_exists('opcache_invalidate') && opcache_invalidate($file, true);
        }
        return $this->Manager()->JsonResponseHelper('PiedWebRuntimeCheck', $out);
    }
}
