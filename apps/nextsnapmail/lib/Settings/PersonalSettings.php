<?php
namespace OCA\NextSnapMail\Settings;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\Settings\ISettings;

class PersonalSettings implements ISettings
{
	private $config;

	public function __construct(IConfig $config)
	{
		$this->config = $config;
	}

	public function getForm()
	{
		$uid = \OC::$server->get(\OCP\IUserSession::class)->getUser()->getUID();
		$sEmail = $this->config->getUserValue($uid, 'nextsnapmail', 'nextsnapmail-email');
		if ($sPass = $this->config->getUserValue($uid, 'nextsnapmail', 'nextsnapmail-password')) {
			$this->config->deleteUserValue($uid, 'nextsnapmail', 'nextsnapmail-password');
			$this->config->setUserValue($uid, 'nextsnapmail', 'passphrase', $sPass);
		}
		$session = \OC::$server->get(\OCP\ISession::class);
		$parameters = [
			'nextsnapmail-email' => $sEmail,
			'nextsnapmail-password' => $this->config->getUserValue($uid, 'nextsnapmail', 'passphrase') ? '******' : '',
			'gmail-oauth-enabled' => $this->isGmailOauthEnabled(),
			'gmail-oauth-url' => \OC::$server->get(\OCP\IURLGenerator::class)
				->linkToRoute('nextsnapmail.page.index') . '?NextSnapMailGmailOauthStart',
			'gmail-oauth-message' => (string) $session->get('nextsnapmail-gmail-oauth-message'),
			'gmail-oauth-error' => (string) $session->get('nextsnapmail-gmail-oauth-error')
		];
		$session->remove('nextsnapmail-gmail-oauth-message');
		$session->remove('nextsnapmail-gmail-oauth-error');
		\OCP\Util::addScript('nextsnapmail', 'nextsnapmail');
		return new TemplateResponse('nextsnapmail', 'personal_settings', $parameters, '');
	}

	private function isGmailOauthEnabled(): bool
	{
		return '' !== \trim($this->config->getAppValue('nextsnapmail', 'gmail-oauth-client-id', ''))
			&& '' !== \trim($this->config->getAppValue('nextsnapmail', 'gmail-oauth-client-secret', ''));
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
