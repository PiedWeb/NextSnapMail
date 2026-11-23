<?php

namespace RainLoop\Actions;

use RainLoop\Exceptions\ClientException;
use RainLoop\Notifications;
use RainLoop\Model\Account;
use RainLoop\Providers\Storage\Enumerations\StorageType;
use MailSo\Imap\FolderCollection;
use MailSo\Imap\NamespaceResult;
use MailSo\Imap\Enumerations\FolderType;

trait Folders
{

	/**
	 * Appends uploaded rfc822 message to mailbox
	 * @throws \MailSo\RuntimeException
	 */
	public function DoFolderAppend(): array
	{
		$oAccount = $this->initMailClientConnection();

		$sFolderFullName = $this->GetActionParam('folder', '');

		if (!$this->oConfig->Get('labs', 'allow_message_append', false)) {
			return $this->FalseResponse(999, 'Permission denied');
		}

		if (empty($_FILES['appendFile'])) {
			return $this->FalseResponse(999, 'No file');
		}

		if (\UPLOAD_ERR_OK != $_FILES['appendFile']['error']) {
			return $this->FalseResponse($iErrorCode, \RainLoop\Enumerations\UploadError::getMessage($iErrorCode));
		}

		if ($oAccount && !empty($sFolderFullName) && \is_uploaded_file($_FILES['appendFile']['tmp_name'])) {
			$sSavedName = 'append-post-' . \md5($sFolderFullName . $_FILES['appendFile']['name'] . $_FILES['appendFile']['tmp_name']);
			if ($this->FilesProvider()->MoveUploadedFile($oAccount, $sSavedName, $_FILES['appendFile']['tmp_name'])) {
				$iMessageStreamSize = $this->FilesProvider()->FileSize($oAccount, $sSavedName);
				$rMessageStream = $this->FilesProvider()->GetFile($oAccount, $sSavedName);
				$this->ImapClient()->MessageAppendStream($sFolderFullName, $rMessageStream, $iMessageStreamSize);
				$this->FilesProvider()->Clear($oAccount, $sSavedName);
				return $this->TrueResponse();
			}
		}
		return $this->FalseResponse(999);
	}

	public function DoFolders() : array
	{
		$oAccount = $this->initMailClientConnection();

		$HideUnsubscribed = false;
		$oSettingsLocal = $this->SettingsProvider(true)->Load($oAccount);
		if ($oSettingsLocal instanceof \RainLoop\Settings) {
			$HideUnsubscribed = (bool) $oSettingsLocal->GetConf('HideUnsubscribed', $HideUnsubscribed);
		}

		$oFolderCollection = $this->MailClient()->Folders('', '*', $HideUnsubscribed);

		$oNamespaces = $this->ImapClient()->GetNamespaces();
		if ($oNamespaces) {
			if (isset($oNamespaces->aOtherUsers[0])) try {
				$oCollection = $this->MailClient()->Folders($oNamespaces->aOtherUsers[0]['prefix'], '*', $HideUnsubscribed);
				if ($oCollection) {
					foreach ($oCollection as $oFolder) {
						$oFolderCollection[$oFolder->FullName] = $oFolder;
					}
				}
			} catch (\Throwable $e) {
				// https://github.com/the-djmaze/snappymail/issues/1438
				// $oAccount->Domain()->ImapSettings()->disabled_capabilities[] = 'NAMESPACE';
				// $this->DomainProvider()->Save($oAccount->Domain());
			}
			if (isset($oNamespaces->aShared[0])) try {
				$oCollection = $this->MailClient()->Folders($oNamespaces->aShared[0]['prefix'], '*', $HideUnsubscribed);
				if ($oCollection) {
					foreach ($oCollection as $oFolder) {
						$oFolderCollection[$oFolder->FullName] = $oFolder;
					}
				}
			} catch (\Throwable $e) {
				// https://github.com/the-djmaze/snappymail/issues/1438
				// $oAccount->Domain()->ImapSettings()->disabled_capabilities[] = 'NAMESPACE';
				// $this->DomainProvider()->Save($oAccount->Domain());
			}
		}

		if ($oFolderCollection) {
			try {
//				$aQuota = $this->ImapClient()->Quota();
				$aQuota = $this->ImapClient()->QuotaRoot();
			} catch (\Throwable $oException) {
				// ignore
			}

			$aCapabilities = \array_values(\array_filter($this->ImapClient()->Capability() ?: [], function ($item) {
				return !\preg_match('/^(IMAP|AUTH|LOGIN|SASL)/', $item);
			}));

			$aSystemFolders = $this->readSystemFolders($oAccount);
			if (\in_array('', $aSystemFolders, true)) {
				$aDetected = self::detectSystemFolders($oFolderCollection, $oNamespaces, $this->ImapClient()->hasCapability('ACL'));
				if (\array_intersect_key(\array_filter($aSystemFolders, static fn($name) => '' === $name), $aDetected)) {
					$aSystemFolders = $this->updateSystemFolders($oAccount, $aDetected, true) ?? $aSystemFolders;
				}
			}

			$oFolderCollection = \array_merge(
				$oFolderCollection->jsonSerialize(),
				array(
					'quotaUsage' => $aQuota ? $aQuota[0] * 1024 : null,
					'quotaLimit' => $aQuota ? $aQuota[1] * 1024 : null,
					'namespace' => $oNamespaces ? $oNamespaces->GetPersonalPrefix() : '',
					'namespaces' => $oNamespaces,
					'capabilities' => $aCapabilities,
					'systemFolders' => $aSystemFolders
				)
			);
		}

		return $this->DefaultResponse($oFolderCollection);
	}

	public function DoFolderCreate() : array
	{
		$this->initMailClientConnection();

		try
		{
			$oFolder = $this->MailClient()->FolderCreate(
				$this->GetActionParam('folder', ''),
				$this->GetActionParam('parent', ''),
				!empty($this->GetActionParam('subscribe', 0))
			);

//			FolderInformation(string $sFolderName, int $iPrevUidNext = 0, array $aUids = array())
			return $this->DefaultResponse($oFolder);
		}
		catch (\Throwable $oException)
		{
			throw new ClientException(Notifications::CantCreateFolder, $oException);
		}
	}

	public function DoFolderSetMetadata() : array
	{
		$this->initMailClientConnection();
		$sFolderFullName = $this->GetActionParam('folder');
		$sMetadataKey = $this->GetActionParam('key');
		if ($sFolderFullName && $sMetadataKey) {
			$this->ImapClient()->FolderSetMetadata($sFolderFullName, [
				$sMetadataKey => $this->GetActionParam('value') ?: null
			]);
		}
		return $this->TrueResponse();
	}

	public function DoFolderSettings() : array
	{
		$this->initMailClientConnection();

		$sFolderFullName = $this->GetActionParam('folder', '');

		// DoFolderSubscribe
		try
		{
			$bSubscribe = !empty($this->GetActionParam('subscribe', 0));
			$this->ImapClient()->{$bSubscribe ? 'FolderSubscribe' : 'FolderUnsubscribe'}($sFolderFullName);
		}
		catch (\Throwable $oException)
		{
		}

		// DoFolderCheckable
		$this->SetFolderCheckable($sFolderFullName, !empty($this->GetActionParam('checkable')));

		// DoFolderSetMetadata
		try
		{
			$aKolab = $this->GetActionParam('kolab');
			if ($aKolab['type']) {
				$this->ImapClient()->FolderSetMetadata($sFolderFullName, [
					$aKolab['type'] => $aKolab['value'] ?: null
				]);
			}
		}
		catch (\Throwable $oException)
		{
		}

		return $this->TrueResponse();
	}

	public function DoFolderSubscribe() : array
	{
		$this->initMailClientConnection();

		$sFolderFullName = $this->GetActionParam('folder', '');
		$bSubscribe = !empty($this->GetActionParam('subscribe', 0));

		try
		{
			$this->ImapClient()->{$bSubscribe ? 'FolderSubscribe' : 'FolderUnsubscribe'}($sFolderFullName);
		}
		catch (\Throwable $oException)
		{
			throw new ClientException(
				$bSubscribe ? Notifications::CantSubscribeFolder : Notifications::CantUnsubscribeFolder,
				$oException
			);
		}

		return $this->TrueResponse();
	}

	protected function SetFolderCheckable(string $sFolderFullName, bool $bCheckable) : bool
	{
		$oAccount = $this->getAccountFromToken();
		$oSettingsLocal = $this->SettingsProvider(true)->Load($oAccount);

		$aCheckableFolders = \json_decode($oSettingsLocal->GetConf('CheckableFolder', '[]'));
		if (!\is_array($aCheckableFolders)) {
			$aCheckableFolders = array();
		}

		if ($bCheckable) {
			$aCheckableFolders[] = $sFolderFullName;
		} else if (($key = \array_search($sFolderFullName, $aCheckableFolders)) !== false) {
			\array_splice($aCheckableFolders, $key, 1);
		}

		$oSettingsLocal->SetConf('CheckableFolder', \json_encode(\array_unique($aCheckableFolders)));

		return $oSettingsLocal->save();
	}

	public function DoFolderCheckable() : array
	{
		return $this->DefaultResponse(
			$this->SetFolderCheckable(
				$this->GetActionParam('folder', ''),
				!empty($this->GetActionParam('checkable'))
			)
		);
	}

	/**
	 * @throws \MailSo\RuntimeException
	 */
	public function DoFolderRename() : array
	{
		$this->initMailClientConnection();

		try
		{
			$sOldName = $this->GetActionParam('oldName', '');
			$sNewName = $this->GetActionParam('newName', '');
			$sDelimiter = $this->ImapClient()->FolderHierarchyDelimiter($sOldName);

			$this->MailClient()->FolderRename($sOldName, $sNewName);

			// DoFolderSubscribe
			try
			{
				$bSubscribe = !empty($this->GetActionParam('subscribe', 0));
				$this->ImapClient()->{$bSubscribe ? 'FolderSubscribe' : 'FolderUnsubscribe'}($sNewName);
			}
			catch (\Throwable $oException)
			{
			}

			// DoFolderCheckable
			$oAccount = $this->getAccountFromToken();
			$oSettingsLocal = $this->SettingsProvider(true)->Load($oAccount);
			$aCheckableFolders = \json_decode($oSettingsLocal->GetConf('CheckableFolder', '[]'));
			$aRemoveFolders = [];
			if (\is_array($aCheckableFolders)) {
				foreach ($aCheckableFolders as $sFolder) {
					if (\str_starts_with($sFolder . $sDelimiter, $sOldName . $sDelimiter)) {
						$aRemoveFolders[] = $sFolder;
						if ($sFolder !== $sOldName) {
							$aCheckableFolders[] = $sNewName . $sDelimiter . \substr($sFolder, \strlen($sOldName) + 1);
						}
					}
				}
				$aCheckableFolders = \array_diff($aCheckableFolders, $aRemoveFolders);
			} else {
				$aCheckableFolders = [];
			}
			if ($this->GetActionParam('checkable')) {
				$aCheckableFolders[] = $sNewName;
			}
			$oSettingsLocal->SetConf('CheckableFolder', \json_encode(\array_unique($aCheckableFolders)));
			$oSettingsLocal->save();

			// DoFolderSetMetadata
			try
			{
				$aKolab = $this->GetActionParam('kolab');
				if ($aKolab['type']) {
					$this->ImapClient()->FolderSetMetadata($sNewName, [
						$aKolab['type'] => $aKolab['value'] ?: null
					]);
				}
			}
			catch (\Throwable $oException)
			{
			}
		}
		catch (\Throwable $oException)
		{
			throw new ClientException(Notifications::CantRenameFolder, $oException);
		}

		return $this->TrueResponse();
	}

	/**
	 * @throws \MailSo\RuntimeException
	 */
	public function DoFolderDelete() : array
	{
		$this->initMailClientConnection();

		try
		{
			$this->ImapClient()->FolderDelete($this->GetActionParam('folder', ''));
		}
		catch (\MailSo\Mail\Exceptions\NonEmptyFolder $oException)
		{
			throw new ClientException(Notifications::CantDeleteNonEmptyFolder, $oException);
		}
		catch (\Throwable $oException)
		{
			throw new ClientException(Notifications::CantDeleteFolder, $oException);
		}

		return $this->TrueResponse();
	}

	/**
	 * @throws \MailSo\RuntimeException
	 */
	public function DoFolderClear() : array
	{
		$this->initMailClientConnection();

		try
		{
			$this->ImapClient()->FolderClear($this->GetActionParam('folder', ''));
		}
		catch (\Throwable $oException)
		{
			throw new ClientException(Notifications::MailServerError, $oException);
		}

		return $this->TrueResponse();
	}

	/**
	 * @throws \MailSo\RuntimeException
	 */
	public function DoFolderInformation() : array
	{
		$this->initMailClientConnection();

		try
		{
			return $this->DefaultResponse($this->MailClient()->FolderInformation(
				$this->GetActionParam('folder', ''),
				(int) $this->GetActionParam('uidNext', 0),
				new \MailSo\Imap\SequenceSet($this->GetActionParam('flagsUids', []))
			));
		}
		catch (\Throwable $oException)
		{
			throw new ClientException(Notifications::MailServerError, $oException);
		}
	}

	/**
	 * @throws \MailSo\RuntimeException
	 */
	public function DoFolderInformationMultiply() : array
	{
		$aResult = array();

		$aFolders = $this->GetActionParam('folders', null);
		if (\is_array($aFolders)) {
			$this->initMailClientConnection();

			$aFolders = \array_unique($aFolders);
			foreach ($aFolders as $sFolder) {
				try
				{
					$aResult[] = $this->MailClient()->FolderInformation($sFolder);
				}
				catch (\Throwable $oException)
				{
					$this->logException($oException);
				}
			}
		}

		return $this->DefaultResponse($aResult);
	}

	public function DoSystemFoldersUpdate() : array
	{
		$oAccount = $this->getAccountFromToken();
		$aUpdates = [];
		foreach (\array_keys(self::systemFolderSettings()) as $role) {
			$aUpdates[$role] = (string) $this->GetActionParam($role, '');
		}
		return $this->DefaultResponse(null !== $this->updateSystemFolders($oAccount, $aUpdates, false));
	}

	private static function systemFolderSettings() : array
	{
		return ['sent' => 'SentFolder', 'drafts' => 'DraftsFolder', 'junk' => 'JunkFolder',
			'trash' => 'TrashFolder', 'archive' => 'ArchiveFolder'];
	}

	private static function detectSystemFolders(FolderCollection $folders, ?NamespaceResult $namespaces, bool $acl) : array
	{
		// Without NAMESPACE, ACL can expose folders owned by other users.
		if (!$namespaces && $acl) return [];
		$personal = $namespaces ? \array_column($namespaces->aPersonal, 'prefix') : [''];
		$external = $namespaces ? \array_column(\array_merge($namespaces->aOtherUsers, $namespaces->aShared), 'prefix') : [];
		$roles = self::systemFolderSettings();
		$candidates = [];
		foreach ($folders as $folder) {
			$role = $folder->Role();
			$name = $folder->FullName;
			if (!isset($roles[$role]) || !$folder->Selectable() || $folder->IsInbox() || '' === $name || '__UNUSE__' === $name) continue;
			$matches = static fn(string $prefix): bool => \str_starts_with($name, $prefix);
			if (\array_filter($personal, $matches) && !\array_filter($external, $matches)) {
				$candidates[$role][$name] = $name;
			}
		}
		return \array_map(static fn($names) => \reset($names),
			\array_filter($candidates, static fn($names) => 1 === \count($names)));
	}

	private function readSystemFolders(Account $account, ?\RainLoop\Settings $settings = null) : array
	{
		$settings = $settings ?? $this->SettingsProvider(true)->Load($account);
		return \array_map(static fn($key) => (string) $settings->GetConf($key, ''), self::systemFolderSettings());
	}

	private function updateSystemFolders(Account $account, array $updates, bool $onlyMissing) : ?array
	{
		$directory = $this->LocalStorageProvider()->GenerateFilePath($account, StorageType::CONFIG, true);
		$lock = $directory ? @\fopen($directory . '/system-folders.lock', 'c') : false;
		if (!$lock) return null;
		try {
			if (!\flock($lock, LOCK_EX)) return null;
			$settings = $this->SettingsProvider(true)->Load($account);
			$folders = $this->readSystemFolders($account, $settings);
			$changed = false;
			foreach (self::systemFolderSettings() as $role => $key) {
				if (!isset($updates[$role]) || $updates[$role] === $folders[$role]) continue;
				if ($onlyMissing && ('' !== $folders[$role] || \in_array($updates[$role], $folders, true))) continue;
				$settings->SetConf($key, $folders[$role] = $updates[$role]);
				$changed = true;
			}
			return !$changed || $settings->save() ? $folders : null;
		} finally {
			\fclose($lock);
		}
	}

	public function DoFolderACL() : array
	{
		$this->initMailClientConnection();
		return $this->DefaultResponse([
			'@Object' => 'Collection/FolderACL',
			'@Collection' => $this->ImapClient()->FolderGetACL(
				$this->GetActionParam('folder', '')
			)
		]);
	}

	public function DoFolderDeleteACL() : array
	{
		$this->initMailClientConnection();
		$this->ImapClient()->FolderDeleteACL(
			$this->GetActionParam('folder', ''),
			$this->GetActionParam('identifier', '')
		);
		return $this->TrueResponse();
	}

	public function DoFolderSetACL() : array
	{
//		$oImapClient->FolderSetACL('INBOX', 'demo@snappymail.eu', 'lrwstipekxacd');
//		$oImapClient->FolderSetACL($sFolderFullName, 'demo@snappymail.eu', 'lrwstipekxacd');
//		$oImapClient->FolderSetACL($sFolderFullName, 'foobar@snappymail.eu', 'lr');
		$this->initMailClientConnection();
		$this->ImapClient()->FolderSetACL(
			$this->GetActionParam('folder', ''),
			$this->GetActionParam('identifier', ''),
			$this->GetActionParam('rights', '')
		);
		return $this->TrueResponse();
	}

}
