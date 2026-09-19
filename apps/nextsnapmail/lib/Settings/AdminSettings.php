<?php
namespace OCA\NextSnapMail\Settings;

use OCA\NextSnapMail\Util\SnappyMailHelper;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\Settings\ISettings;

class AdminSettings implements ISettings
{
	private $config;

	public function __construct(IConfig $config)
	{
		$this->config = $config;
	}

	public function getForm()
	{
		\OCA\NextSnapMail\Util\SnappyMailHelper::loadApp();

		$keys = [
			'nextsnapmail-autologin',
			'nextsnapmail-autologin-with-email',
			'nextsnapmail-no-embed',
			'nextsnapmail-autologin-oidc'
		];
		$parameters = [];
		foreach ($keys as $k) {
			$v = $this->config->getAppValue('nextsnapmail', $k);
			$parameters[$k] = $v;
		}
		$uid = \OC::$server->get(\OCP\IUserSession::class)->getUser()->getUID();
		if (\OC_User::isAdminUser($uid)) {
//			$parameters['nextsnapmail-admin-panel-link'] = SnappyMailHelper::getAppUrl().'?admin';
			SnappyMailHelper::loadApp();
			$parameters['nextsnapmail-admin-panel-link'] =
				\OC::$server->get(\OCP\IURLGenerator::class)->linkToRoute('nextsnapmail.page.index')
				. '?' . \RainLoop\Api::Config()->Get('security', 'admin_panel_key', 'admin');
		}

		$oConfig = \RainLoop\Api::Config();
		$passfile = APP_PRIVATE_DATA . 'admin_password.txt';
		$sPassword = '';
		if (\is_file($passfile)) {
			$sPassword = \file_get_contents($passfile);
			$parameters['nextsnapmail-admin-panel-link'] .= '#/security';
		}
		$parameters['nextsnapmail-admin-password'] = $sPassword;

		$parameters['can-import-rainloop'] = $sPassword && \is_dir(
			\rtrim(\trim($this->config->getSystemValue('datadirectory', '')), '\\/')
			. '/rainloop-storage'
		);

		$parameters['nextsnapmail-debug'] = $oConfig->Get('debug', 'enable', false);

		// Prevent "Failed loading /nextcloud/snappymail/v/2.N.N/static/js/min/libs.min.js"
		$app_path = $oConfig->Get('webmail', 'app_path');
		if (!$app_path) {
			$app_path = \OC::$server->get(\OCP\App\IAppManager::class)->getAppWebPath('nextsnapmail') . '/app/';
			$oConfig->Set('webmail', 'app_path', $app_path);
			$oConfig->Set('webmail', 'theme', 'NextcloudV25+');
			$oConfig->Save();
		}
		$parameters['nextsnapmail-app_path'] = $oConfig->Get('webmail', 'app_path', false);
		$parameters['nextsnapmail-nc-lang'] = !$oConfig->Get('webmail', 'allow_languages_on_settings', true);
		$parameters['gmail-oauth-client-id'] = $this->config->getAppValue('nextsnapmail', 'gmail-oauth-client-id', '');
		$parameters['gmail-oauth-client-secret-set'] = '' !== $this->config->getAppValue('nextsnapmail', 'gmail-oauth-client-secret', '');
		$parameters['gmail-oauth-domains'] = $this->config->getAppValue('nextsnapmail', 'gmail-oauth-domains', "gmail.com\ngooglemail.com");
		$parameters['gmail-oauth-auto-configure'] = $this->config->getAppValue('nextsnapmail', 'gmail-oauth-auto-configure', '1');
		$parameters['gmail-oauth-callback-url'] = \OC::$server->get(\OCP\IURLGenerator::class)
			->linkToRouteAbsolute('nextsnapmail.page.index') . '?NextSnapMailGmailOauth';

		\OCP\Util::addScript('nextsnapmail', 'nextsnapmail');
		return new TemplateResponse('nextsnapmail', 'admin-local', $parameters);
	}

	public function getSection()
	{
		return 'nextsnapmail';
	}

	public function getPriority()
	{
		return 50;
	}
}
