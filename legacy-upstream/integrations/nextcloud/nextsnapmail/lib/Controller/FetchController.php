<?php

namespace OCA\NextSnapMail\Controller;

use OCA\NextSnapMail\Util\SnappyMailHelper;

use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IL10N;
use OCP\IRequest;

class FetchController extends Controller {
	private const DELETE_OLD_SNAPPYMAIL_CONFIRMATION = 'DELETE_SNAPPYMAIL_DATA';
	private const MAX_ADDITIONAL_ACCOUNTS_BYTES = 1048576;

	private IConfig $config;
	private IAppManager $appManager;
	private IL10N $l;

	public function __construct(string $appName, IRequest $request, IAppManager $appManager, IConfig $config, IL10N $l) {
		parent::__construct($appName, $request);
		$this->config = $config;
		$this->appManager = $appManager;
		$this->l = $l;
	}

	public function upgrade(): JSONResponse {
		$error = 'Upgrade failed';
		try {
			SnappyMailHelper::loadApp();
			if (\SnappyMail\Upgrade::core()) {
				return new JSONResponse([
					'status' => 'success',
					'Message' => $this->l->t('Upgraded successfully')
				]);
			}
		} catch (\Throwable $e) {
			$error .= ': ' . $e->getMessage();
		}
		return new JSONResponse([
			'status' => 'error',
			'Message' => $error
		]);
	}

	public function setAdmin(): JSONResponse {
		try {
			$sUrl = '';
			$sPath = '';

			if (isset($_POST['appname']) && 'nextsnapmail' === $_POST['appname']) {
				if (!empty($_POST['nextsnapmail-list-old-snappymail-accounts'])) {
					return $this->safeJsonResponse(function (): JSONResponse {
						$accounts = $this->getOldSnappyMailAccounts();
						return new JSONResponse([
							'status' => 'success',
							'Message' => $accounts
								? $this->l->t('Old SnappyMail account data found in the Nextcloud database:')
								: $this->l->t('No old SnappyMail account data was found in the Nextcloud database.'),
							'Accounts' => \array_values($accounts),
							'AppData' => $this->scanOldSnappyMailAppData()
						]);
					});
				}

				if (!empty($_POST['nextsnapmail-import-selected-snappymail-accounts'])) {
					return $this->safeJsonResponse(function (): JSONResponse {
						return new JSONResponse([
							'status' => 'success',
							'Message' => \implode("\n", $this->importSelectedOldSnappyMailAccounts()),
							'Accounts' => \array_values($this->getOldSnappyMailAccounts()),
							'AppData' => $this->scanOldSnappyMailAppData()
						]);
					});
				}

				if (!empty($_POST['nextsnapmail-delete-imported-account'])) {
					return $this->safeJsonResponse(function (): JSONResponse {
						return new JSONResponse([
							'status' => 'success',
							'Message' => \implode("\n", $this->deleteNextSnapMailAccountForReimport()),
							'Accounts' => \array_values($this->getOldSnappyMailAccounts()),
							'AppData' => $this->scanOldSnappyMailAppData()
						]);
					});
				}

				if (!empty($_POST['nextsnapmail-delete-old-snappymail-data'])) {
					return $this->safeJsonResponse(function (): JSONResponse {
						return new JSONResponse([
							'status' => 'success',
							'Message' => \implode("\n", $this->deleteOldSnappyMailData()),
							'Accounts' => \array_values($this->getOldSnappyMailAccounts()),
							'AppData' => $this->scanOldSnappyMailAppData()
						]);
					});
				}

				$this->config->setAppValue('nextsnapmail', 'nextsnapmail-autologin',
					isset($_POST['nextsnapmail-autologin']) ? '1' === $_POST['nextsnapmail-autologin'] : false);
				$this->config->setAppValue('nextsnapmail', 'nextsnapmail-autologin-with-email',
					isset($_POST['nextsnapmail-autologin']) ? '2' === $_POST['nextsnapmail-autologin'] : false);
				$this->config->setAppValue('nextsnapmail', 'nextsnapmail-no-embed', isset($_POST['nextsnapmail-no-embed']));
				$this->config->setAppValue('nextsnapmail', 'nextsnapmail-autologin-oidc', isset($_POST['nextsnapmail-autologin-oidc']));
			} else {
				return new JSONResponse([
					'status' => 'error',
					'Message' => $this->l->t('Invalid argument(s)')
				]);
			}

			SnappyMailHelper::loadApp();

			$oConfig = \RainLoop\Api::Config();
			if (!empty($_POST['nextsnapmail-app_path'])) {
				$oConfig->Set('webmail', 'app_path', $_POST['nextsnapmail-app_path']);
			}
			$oConfig->Set('webmail', 'allow_languages_on_settings', empty($_POST['nextsnapmail-nc-lang']));
			$oConfig->Set('login', 'allow_languages_on_login', empty($_POST['nextsnapmail-nc-lang']));
			$oConfig->Save();

			if (!empty($_POST['import-rainloop'])) {
				return new JSONResponse([
					'status' => 'success',
					'Message' => \implode("\n", \OCA\NextSnapMail\Util\RainLoop::import())
				]);
			}

			$debug = !empty($_POST['nextsnapmail-debug']);
			$oConfig = \RainLoop\Api::Config();
			if ($debug != $oConfig->Get('debug', 'enable', false)) {
				$oConfig->Set('debug', 'enable', $debug);
				$oConfig->Save();
			}

			return new JSONResponse([
				'status' => 'success',
				'Message' => $this->l->t('Saved successfully')
			]);
		} catch (\Throwable $e) {
			return new JSONResponse([
				'status' => 'error',
				'Message' => $e->getMessage()
			]);
		}
	}

	private function getOldSnappyMailAccounts(): array {
		$accounts = [];

		$db = \OC::$server->get(\OCP\IDBConnection::class);
		$qb = $db->getQueryBuilder();
		$query = $qb->select('userid', 'configkey', 'configvalue')
			->from('preferences')
			->where($qb->expr()->eq('appid', $qb->createNamedParameter('snappymail')))
			->andWhere($qb->expr()->orX(
				$qb->expr()->eq('configkey', $qb->createNamedParameter('snappymail-email')),
				$qb->expr()->eq('configkey', $qb->createNamedParameter('passphrase')),
				$qb->expr()->eq('configkey', $qb->createNamedParameter('snappymail-password'))
			))
			->orderBy('userid', 'ASC')
			->addOrderBy('configkey', 'ASC');

		$result = $query->executeQuery();
		while (true) {
			$row = \method_exists($result, 'fetchAssociative') ? $result->fetchAssociative() : $result->fetch();
			if (!$row) {
				break;
			}

			$uid = (string) $row['userid'];
			$key = (string) $row['configkey'];
			$value = (string) $row['configvalue'];

			if (!isset($accounts[$uid])) {
				$accounts[$uid] = [
					'uid' => $uid,
					'email' => '',
					'hasPassphrase' => false,
					'hasLegacyPassword' => false,
					'hasPassword' => false,
					'nextsnapmailExists' => false,
					'nextsnapmailEmailExists' => false,
					'nextsnapmailPassphraseExists' => false
				];
			}

			if ('snappymail-email' === $key) {
				$accounts[$uid]['email'] = $value;
			} else if ('passphrase' === $key && '' !== $value) {
				$accounts[$uid]['hasPassphrase'] = true;
			} else if ('snappymail-password' === $key && '' !== $value) {
				$accounts[$uid]['hasLegacyPassword'] = true;
			}
		}

		if (\method_exists($result, 'closeCursor')) {
			$result->closeCursor();
		} else if (\method_exists($result, 'free')) {
			$result->free();
		}

		foreach ($accounts as $uid => &$account) {
			$account['hasPassword'] = $account['hasPassphrase'] || $account['hasLegacyPassword'];
			$account['nextsnapmailEmailExists'] =
				'' !== $this->config->getUserValue($uid, 'nextsnapmail', 'nextsnapmail-email', '');
			$account['nextsnapmailPassphraseExists'] =
				'' !== $this->config->getUserValue($uid, 'nextsnapmail', 'passphrase', '');
			$account['nextsnapmailExists'] =
				$account['nextsnapmailEmailExists'] || $account['nextsnapmailPassphraseExists'];
		}
		unset($account);

		return $accounts;
	}

	private function getAppDataImportPaths(): array {
		$datadir = \rtrim(\trim($this->config->getSystemValue('datadirectory', '')), '\\/');

		return [
			'source' => $datadir . '/appdata_snappymail',
			'target' => $datadir . '/appdata_nextsnapmail'
		];
	}

	private function normalizePath(string $path): string {
		return \str_replace('\\', '/', \rtrim($path, '\\/'));
	}

	private function realDirectoryPath(string $path): ?string {
		$realPath = \realpath($path);
		if (!\is_string($realPath) || !\is_dir($realPath)) {
			return null;
		}

		return $this->normalizePath($realPath);
	}

	private function ensurePathIsInsideDirectory(string $path, string $baseDirectory): void {
		$normalizedPath = $this->normalizePath($path);
		$normalizedBase = $this->normalizePath($baseDirectory);

		if ($normalizedPath !== $normalizedBase && 0 !== \strpos($normalizedPath . '/', $normalizedBase . '/')) {
			throw new \RuntimeException($this->l->t('Refusing to access unexpected folder') . ': ' . $normalizedPath);
		}
	}

	private function safeJsonResponse(callable $callback): JSONResponse {
		try {
			return $callback();
		} catch (\Throwable $e) {
			\OC::$server->get(\Psr\Log\LoggerInterface::class)->error($e->getMessage(), [
				'app' => 'nextsnapmail',
				'exception' => $e
			]);

			return new JSONResponse([
				'status' => 'error',
				'Message' => $this->l->t('The requested operation failed. Please check the Nextcloud log for details.')
			]);
		}
	}

	private function scanOldSnappyMailAppData(): array {
		$paths = $this->getAppDataImportPaths();
		$scan = [
			'source' => $paths['source'],
			'target' => $paths['target'],
			'sourceExists' => \is_dir($paths['source']),
			'targetExists' => \is_dir($paths['target']),
			'files' => 0,
			'directories' => 0,
			'wouldCopy' => 0,
			'wouldSkip' => 0,
			'wouldCopyBytes' => 0
		];

		if (!$scan['sourceExists']) {
			return $scan;
		}

		$source = \str_replace('\\', '/', \rtrim($paths['source'], '\\/'));
		$target = \str_replace('\\', '/', \rtrim($paths['target'], '\\/'));

		$iterator = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS),
			\RecursiveIteratorIterator::SELF_FIRST
		);
		$prefixLength = \strlen($source) + 1;

		foreach ($iterator as $item) {
			if ($item->isLink()) {
				continue;
			}

			$relativePath = \str_replace('\\', '/', \substr($item->getPathname(), $prefixLength));
			$targetPath = $target . '/' . $relativePath;

			if ($item->isDir()) {
				++$scan['directories'];
				continue;
			}

			++$scan['files'];
			if (\is_file($targetPath)) {
				++$scan['wouldSkip'];
				continue;
			}

			++$scan['wouldCopy'];
			$scan['wouldCopyBytes'] += $item->getSize();
		}

		return $scan;
	}

	private function importOldSnappyMailAppData(): array {
		$paths = $this->getAppDataImportPaths();
		$source = $this->realDirectoryPath($paths['source']);
		$target = $this->normalizePath($paths['target']);

		$result = [
			'copiedFiles' => 0,
			'skippedFiles' => 0,
			'createdDirectories' => 0,
			'copiedBytes' => 0
		];

		if (null === $source) {
			return [$this->l->t('Old SnappyMail app data folder was not found.')];
		}

		if (!\is_dir($target) && !\mkdir($target, 0700, true) && !\is_dir($target)) {
			return [$this->l->t('Could not create NextSnapMail app data folder.') . ': ' . $target];
		}
		$target = $this->realDirectoryPath($target);
		if (null === $target) {
			return [$this->l->t('Could not create NextSnapMail app data folder.') . ': ' . $paths['target']];
		}

		$iterator = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS),
			\RecursiveIteratorIterator::SELF_FIRST
		);
		$prefixLength = \strlen($source) + 1;

		foreach ($iterator as $item) {
			if ($item->isLink()) {
				continue;
			}

			$relativePath = \str_replace('\\', '/', \substr($item->getPathname(), $prefixLength));
			$targetPath = $target . '/' . $relativePath;
			$this->ensurePathIsInsideDirectory($targetPath, $target);

			if ($item->isDir()) {
				if (!\is_dir($targetPath)) {
					if (!\mkdir($targetPath, $item->getPerms() & 0777, true) && !\is_dir($targetPath)) {
						throw new \RuntimeException($this->l->t('Could not create directory') . ': ' . $targetPath);
					}
					$realTargetPath = $this->realDirectoryPath($targetPath);
					if (null === $realTargetPath) {
						throw new \RuntimeException($this->l->t('Could not create directory') . ': ' . $targetPath);
					}
					$this->ensurePathIsInsideDirectory($realTargetPath, $target);
					++$result['createdDirectories'];
					@\touch($targetPath, $item->getMTime());
				} else {
					$realTargetPath = $this->realDirectoryPath($targetPath);
					if (null === $realTargetPath) {
						throw new \RuntimeException($this->l->t('Could not create directory') . ': ' . $targetPath);
					}
					$this->ensurePathIsInsideDirectory($realTargetPath, $target);
				}
				continue;
			}

			if (\is_file($targetPath)) {
				++$result['skippedFiles'];
				continue;
			}

			if (!\is_dir(\dirname($targetPath)) && !\mkdir(\dirname($targetPath), 0700, true) && !\is_dir(\dirname($targetPath))) {
				throw new \RuntimeException($this->l->t('Could not create directory') . ': ' . \dirname($targetPath));
			}
			$realTargetDirectory = $this->realDirectoryPath(\dirname($targetPath));
			if (null === $realTargetDirectory) {
				throw new \RuntimeException($this->l->t('Could not create directory') . ': ' . \dirname($targetPath));
			}
			$this->ensurePathIsInsideDirectory($realTargetDirectory, $target);

			if (!\copy($item->getPathname(), $targetPath)) {
				throw new \RuntimeException($this->l->t('Could not copy file') . ': ' . $relativePath);
			}

			@\chmod($targetPath, $item->getPerms() & 0777);
			@\touch($targetPath, $item->getMTime());
			++$result['copiedFiles'];
			$result['copiedBytes'] += $item->getSize();
		}

		return [
			$this->l->t('App data import completed.'),
			$this->l->t('Copied files') . ': ' . $result['copiedFiles'],
			$this->l->t('Skipped existing files') . ': ' . $result['skippedFiles'],
			$this->l->t('Created directories') . ': ' . $result['createdDirectories'],
			$this->l->t('Copied bytes') . ': ' . $result['copiedBytes'],
			$this->l->t('Existing NextSnapMail app data files were not overwritten.')
		];
	}

	private function decryptOldSnappyMailPassphrase(string $encryptedPassphrase, string $email): ?string {
		if ('' === $encryptedPassphrase || '' === $email) {
			return null;
		}

		SnappyMailHelper::loadApp();

		$oldSalt = $this->getOldSnappyMailAppSalt();
		if (!$oldSalt) {
			return null;
		}

		$parts = \explode('.', $encryptedPassphrase);
		if (3 !== \count($parts)) {
			return null;
		}

		$parts = \array_map('MailSo\\Base\\Utils::UrlSafeBase64Decode', $parts);
		if (!isset($parts[0], $parts[1], $parts[2]) || '' === $parts[0]) {
			return null;
		}

		$key = \md5($email);
		$json = $this->decryptSnappyMailValueWithSalt((string) $parts[0], (string) $parts[2], (string) $parts[1], $key, $oldSalt);
		if (!\is_string($json)) {
			return null;
		}

		try {
			$value = \json_decode($json, true, 512, JSON_THROW_ON_ERROR);
			return \is_string($value) ? $value : null;
		} catch (\Throwable $e) {
			return null;
		}
	}

	private function decryptSnappyMailUrlSafeWithSalt(string $encryptedValue, string $key, string $appSalt) {
		$parts = \explode('.', $encryptedValue);
		if (3 !== \count($parts)) {
			return null;
		}

		$parts = \array_map('MailSo\\Base\\Utils::UrlSafeBase64Decode', $parts);
		if (!isset($parts[0], $parts[1], $parts[2]) || '' === $parts[0]) {
			return null;
		}

		$json = $this->decryptSnappyMailValueWithSalt((string) $parts[0], (string) $parts[2], (string) $parts[1], $key, $appSalt);
		if (!\is_string($json)) {
			return null;
		}

		try {
			return \json_decode($json, true, 512, JSON_THROW_ON_ERROR);
		} catch (\Throwable $e) {
			return null;
		}
	}

	private function getOldSnappyMailAppSalt(): ?string {
		$paths = $this->getAppDataImportPaths();
		$saltFile = \rtrim($paths['source'], '\\/') . '/SALT.php';
		if (!\is_file($saltFile)) {
			return null;
		}

		$salt = \trim((string) \file_get_contents($saltFile));
		if ('' === $salt) {
			return null;
		}

		return \md5($salt . '_default_' . $salt);
	}

	private function getStorageFilePath(string $appDataRoot, string $email, string $key): string {
		SnappyMailHelper::loadApp();

		$emailParts = \explode('@', $email ?: 'nobody@unknown.tld');
		$domain = \trim(1 < \count($emailParts) ? \array_pop($emailParts) : '');
		$localPart = \implode('@', $emailParts);

		return \rtrim($appDataRoot, '\\/')
			. '/_data_/_default_/storage/'
			. \MailSo\Base\Utils::SecureFileName($domain ?: 'unknown.tld')
			. '/'
			. \MailSo\Base\Utils::SecureFileName($localPart ?: '.unknown')
			. '/'
			. \MailSo\Base\Utils::SecureFileName($key);
	}

	private function getOldMainAccountCryptKey(string $email, string $password, string $oldAppSalt): ?string {
		$paths = $this->getAppDataImportPaths();
		$cryptKeyFile = $this->getStorageFilePath($paths['source'], $email, '.cryptkey');

		if (\is_file($cryptKeyFile)) {
			$encryptedCryptKey = (string) \file_get_contents($cryptKeyFile);

			foreach ([$password, $email] as $key) {
				$cryptKeyHex = $this->decryptSnappyMailJsonWithSalt($encryptedCryptKey, $key, $oldAppSalt);
				if (\is_string($cryptKeyHex) && \ctype_xdigit($cryptKeyHex)) {
					$cryptKey = \hex2bin($cryptKeyHex);
					if (\is_string($cryptKey)) {
						return $cryptKey;
					}
				}
			}
		}

		$derived = \hex2bin(\sha1($password . $oldAppSalt));
		return \is_string($derived) ? $derived : null;
	}

	private function decryptSnappyMailJsonWithSalt(string $encryptedJson, string $key, string $appSalt) {
		try {
			$parts = \json_decode($encryptedJson, true, 512, JSON_THROW_ON_ERROR);
		} catch (\Throwable $e) {
			return null;
		}

		if (!\is_array($parts) || 3 !== \count($parts)) {
			return null;
		}

		$parts = \array_map('base64_decode', $parts);
		if (!isset($parts[0], $parts[1], $parts[2]) || '' === $parts[0]) {
			return null;
		}

		$json = $this->decryptSnappyMailValueWithSalt((string) $parts[0], (string) $parts[2], (string) $parts[1], $key, $appSalt);
		if (!\is_string($json)) {
			return null;
		}

		try {
			return \json_decode($json, true, 512, JSON_THROW_ON_ERROR);
		} catch (\Throwable $e) {
			return null;
		}
	}

	private function writeNextSnapMailMainCryptKey(string $email, string $password): void {
		SnappyMailHelper::loadApp();

		$paths = $this->getAppDataImportPaths();
		$targetFile = $this->getStorageFilePath($paths['target'], $email, '.cryptkey');
		$targetDirectory = \dirname($targetFile);
		if (!\is_dir($targetDirectory) && !\mkdir($targetDirectory, 0700, true) && !\is_dir($targetDirectory)) {
			throw new \RuntimeException($this->l->t('Could not create directory') . ': ' . $targetDirectory);
		}

		$encryptionKey = \RainLoop\Api::Config()->Get('security', 'insecure_cryptkey', false)
			? $email
			: $password;

		\RainLoop\Utils::saveFile(
			$targetFile,
			\SnappyMail\Crypt::EncryptToJSON(\sha1($password . APP_SALT), $encryptionKey)
		);
	}

	private function migrateAdditionalAccounts(string $email, string $password): array {
		SnappyMailHelper::loadApp();

		$oldAppSalt = $this->getOldSnappyMailAppSalt();
		if (!$oldAppSalt) {
			return [$this->l->t('Additional accounts skipped: old SnappyMail salt was not found.')];
		}

		$paths = $this->getAppDataImportPaths();
		$sourceFile = $this->getStorageFilePath($paths['source'], $email, 'additionalaccounts');
		if (!\is_file($sourceFile)) {
			return [$this->l->t('Additional accounts skipped: no old additional accounts file was found.')];
		}
		if (\filesize($sourceFile) > self::MAX_ADDITIONAL_ACCOUNTS_BYTES) {
			return [$this->l->t('Additional accounts skipped: old additional accounts file is too large.')];
		}

		$oldCryptKey = $this->getOldMainAccountCryptKey($email, $password, $oldAppSalt);
		if (!$oldCryptKey) {
			return [$this->l->t('Additional accounts skipped: old main account crypt key could not be read.')];
		}

		$additionalAccounts = \json_decode((string) \file_get_contents($sourceFile), true);
		if (!\is_array($additionalAccounts)) {
			return [$this->l->t('Additional accounts skipped: old additional accounts file is invalid.')];
		}

		$newCryptKey = \hex2bin(\sha1($password . APP_SALT));
		if (!\is_string($newCryptKey)) {
			return [$this->l->t('Additional accounts skipped: new main account crypt key could not be created.')];
		}

		$converted = 0;
		$skipped = 0;

		foreach ($additionalAccounts as $accountEmail => &$account) {
			if (!\is_array($account) || empty($account['pass'])) {
				++$skipped;
				continue;
			}

			$expectedHmac = \hash_hmac('sha1', (string) $account['pass'], $oldCryptKey);
			if (!empty($account['hmac']) && !\hash_equals((string) $account['hmac'], $expectedHmac)) {
				++$skipped;
				continue;
			}

			$plainPassword = $this->decryptSnappyMailUrlSafeWithSalt((string) $account['pass'], $oldCryptKey, $oldAppSalt);
			if (!\is_string($plainPassword)) {
				++$skipped;
				continue;
			}

			$account['pass'] = \SnappyMail\Crypt::EncryptUrlSafe($plainPassword, $newCryptKey);
			$account['hmac'] = \hash_hmac('sha1', $account['pass'], $newCryptKey);

			if (!empty($account['smtp']['pass'])) {
				$plainSmtpPassword = $this->decryptSnappyMailUrlSafeWithSalt((string) $account['smtp']['pass'], $oldCryptKey, $oldAppSalt);
				if (\is_string($plainSmtpPassword)) {
					$account['smtp']['pass'] = \SnappyMail\Crypt::EncryptUrlSafe($plainSmtpPassword, $newCryptKey);
				}
			}

			++$converted;
		}
		unset($account);

		$this->writeNextSnapMailMainCryptKey($email, $password);

		$targetFile = $this->getStorageFilePath($paths['target'], $email, 'additionalaccounts');
		$targetDirectory = \dirname($targetFile);
		if (!\is_dir($targetDirectory) && !\mkdir($targetDirectory, 0700, true) && !\is_dir($targetDirectory)) {
			throw new \RuntimeException($this->l->t('Could not create directory') . ': ' . $targetDirectory);
		}

		\RainLoop\Utils::saveFile($targetFile, \json_encode($additionalAccounts));

		return [
			$this->l->t('Additional accounts migration completed.'),
			$this->l->t('Converted additional accounts') . ': ' . $converted,
			$this->l->t('Skipped additional accounts') . ': ' . $skipped
		];
	}

	private function decryptSnappyMailValueWithSalt(string $method, string $data, string $nonceOrIv, string $key, string $appSalt): ?string {
		$passphrase = \sha1($key . $appSalt, true);

		try {
			if ('sodium' === $method) {
				if (!\is_callable('sodium_crypto_aead_xchacha20poly1305_ietf_decrypt')) {
					return null;
				}

				$result = \sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(
					$data,
					$appSalt,
					$nonceOrIv,
					\str_pad('', \SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_KEYBYTES, $passphrase)
				);

				return \is_string($result) ? $result : null;
			}

			if ('openssl' === $method) {
				if (!\is_callable('openssl_decrypt')) {
					return null;
				}

				$cipher = \RainLoop\Api::Config()->Get('security', 'encrypt_cipher', 'aes-256-cbc-hmac-sha1');
				$result = \openssl_decrypt($data, $cipher, $passphrase, OPENSSL_RAW_DATA, $nonceOrIv);

				return \is_string($result) ? $result : null;
			}

			if ('xxtea' === $method) {
				$xxteaKey = $nonceOrIv . $passphrase;
				$result = \is_callable('xxtea_decrypt')
					? \xxtea_decrypt($data, $xxteaKey)
					: \MailSo\Base\Xxtea::decrypt($data, $xxteaKey);

				return \is_string($result) ? $result : null;
			}
		} catch (\Throwable $e) {
			return null;
		}

		return null;
	}

	private function deleteNextSnapMailAccountForReimport(): array {
		$oldAccounts = $this->getOldSnappyMailAccounts();
		$uids = $_POST['nextsnapmail-delete-account-uid'] ?? [];
		if (!\is_array($uids)) {
			$uids = [$uids];
		}

		$uids = \array_values(\array_unique(\array_filter(\array_map('strval', $uids), static function ($uid) {
			return '' !== $uid;
		})));
		if (!$uids) {
			return [$this->l->t('No account was selected for deletion.')];
		}

		$lines = [];
		foreach ($uids as $uid) {
			if (!isset($oldAccounts[$uid])) {
				$lines[] = $this->l->t('Skipped unknown account') . ': ' . $uid;
				continue;
			}
			$this->config->deleteUserValue($uid, 'nextsnapmail', 'nextsnapmail-email');
			$this->config->deleteUserValue($uid, 'nextsnapmail', 'passphrase');
			$this->config->deleteUserValue($uid, 'nextsnapmail', 'nextsnapmail-password');
			$lines[] = $this->l->t('Deleted NextSnapMail account data for reimport') . ': ' . $uid;
		}

		return $lines;
	}

	private function deleteOldSnappyMailData(): array {
		$confirmation = (string) ($_POST['nextsnapmail-delete-old-snappymail-confirmation'] ?? '');
		if (!\hash_equals(self::DELETE_OLD_SNAPPYMAIL_CONFIRMATION, $confirmation)) {
			return [$this->l->t('Old SnappyMail data was not deleted because the confirmation code was missing or invalid.')];
		}

		$lines = [];
		$deletedPreferences = 0;

		$db = \OC::$server->get(\OCP\IDBConnection::class);
		$qb = $db->getQueryBuilder();
		$query = $qb->delete('preferences')
			->where($qb->expr()->eq('appid', $qb->createNamedParameter('snappymail')));
		$deletedPreferences = $query->executeStatement();

		$lines[] = $this->l->t('Deleted old SnappyMail database entries') . ': ' . $deletedPreferences;

		$paths = $this->getAppDataImportPaths();
		if (\is_dir($paths['source'])) {
			$this->deleteDirectory($paths['source']);
			$lines[] = $this->l->t('Deleted old SnappyMail app data folder') . ': ' . $paths['source'];
		} else {
			$lines[] = $this->l->t('Old SnappyMail app data folder was not found.');
		}

		return $lines;
	}

	private function deleteDirectory(string $directory): void {
		$directory = $this->realDirectoryPath($directory);
		$dataDirectory = $this->realDirectoryPath(\trim($this->config->getSystemValue('datadirectory', '')));
		if (null === $directory || null === $dataDirectory) {
			throw new \RuntimeException($this->l->t('Refusing to delete unexpected folder'));
		}

		$allowedDirectory = $this->normalizePath($dataDirectory . '/appdata_snappymail');
		$allowedDirectoryReal = $this->realDirectoryPath($allowedDirectory);

		if (null === $allowedDirectoryReal || $directory !== $allowedDirectoryReal) {
			throw new \RuntimeException($this->l->t('Refusing to delete unexpected folder') . ': ' . $directory);
		}

		$iterator = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator($directory, \FilesystemIterator::SKIP_DOTS),
			\RecursiveIteratorIterator::CHILD_FIRST
		);

		foreach ($iterator as $item) {
			if ($item->isDir() && !$item->isLink()) {
				if (!\rmdir($item->getPathname())) {
					throw new \RuntimeException($this->l->t('Could not delete directory') . ': ' . $item->getPathname());
				}
			} else if (!\unlink($item->getPathname())) {
				throw new \RuntimeException($this->l->t('Could not delete file') . ': ' . $item->getPathname());
			}
		}

		if (!\rmdir($directory)) {
			throw new \RuntimeException($this->l->t('Could not delete directory') . ': ' . $directory);
		}
	}

	private function importSelectedOldSnappyMailAccounts(): array {
		$selected = $_POST['nextsnapmail-selected-accounts'] ?? [];
		if (!\is_array($selected)) {
			$selected = [$selected];
		}

		$selected = \array_values(\array_unique(\array_filter(\array_map('strval', $selected), static function ($uid) {
			return '' !== $uid;
		})));
		$importAppData = !empty($_POST['nextsnapmail-import-appdata']);
		if (!$selected && !$importAppData) {
			return [$this->l->t('No accounts were selected for import.')];
		}

		$accounts = $this->getOldSnappyMailAccounts();
		$lines = [];

		foreach ($selected as $uid) {
			if (!isset($accounts[$uid])) {
				$lines[] = $this->l->t('Skipped unknown account') . ': ' . $uid;
				continue;
			}

			$account = $accounts[$uid];
			$changes = [];
			$skipped = [];

			if ('' !== $account['email']) {
				$emailExisted = '' !== $this->config->getUserValue($uid, 'nextsnapmail', 'nextsnapmail-email', '');
				$this->config->setUserValue($uid, 'nextsnapmail', 'nextsnapmail-email', $account['email']);
				$changes[] = $emailExisted
					? $this->l->t('email address overwritten')
					: $this->l->t('email address');
			} else {
				$skipped[] = $this->l->t('no email address found');
			}

			$passphraseExisted = '' !== $this->config->getUserValue($uid, 'nextsnapmail', 'passphrase', '');
			$passphrase = $this->config->getUserValue($uid, 'snappymail', 'passphrase', '');
			if ('' === $passphrase) {
				$passphrase = $this->config->getUserValue($uid, 'snappymail', 'snappymail-password', '');
			}

			if ('' !== $passphrase) {
				$password = $this->decryptOldSnappyMailPassphrase($passphrase, $account['email']);
				if (null !== $password) {
					$this->config->setUserValue($uid, 'nextsnapmail', 'passphrase',
						SnappyMailHelper::encodePassword($password, \md5($account['email'])));
					$changes[] = $passphraseExisted
						? $this->l->t('password/passphrase overwritten')
						: $this->l->t('password/passphrase');
					foreach ($this->migrateAdditionalAccounts($account['email'], $password) as $line) {
						$skipped[] = $line;
					}
				} else {
					$skipped[] = $this->l->t('password/passphrase could not be converted');
				}
			} else {
				$skipped[] = $this->l->t('no password/passphrase found');
			}

			if ($changes) {
				$lines[] = $this->l->t('Imported') . ' ' . $uid . ': ' . \implode(', ', $changes);
			} else {
				$lines[] = $this->l->t('No values imported for') . ' ' . $uid;
			}

			if ($skipped) {
				$lines[] = '  ' . $this->l->t('Skipped') . ': ' . \implode(', ', $skipped);
			}
		}

		$lines[] = '';
		$lines[] = $this->l->t('Selected existing NextSnapMail values were overwritten.');

		if ($importAppData) {
			$lines[] = '';
			foreach ($this->importOldSnappyMailAppData() as $line) {
				$lines[] = $line;
			}
		}

		return $lines;
	}

	/**
	 * @NoAdminRequired
	 */
	public function setPersonal(): JSONResponse {
		try {
			$sEmail = '';
			if (isset($_POST['appname'], $_POST['nextsnapmail-password'], $_POST['nextsnapmail-email']) && 'nextsnapmail' === $_POST['appname']) {
				$sUser = \OC::$server->get(\OCP\IUserSession::class)->getUser()->getUID();

				$sEmail = $_POST['nextsnapmail-email'];
				$this->config->setUserValue($sUser, 'nextsnapmail', 'nextsnapmail-email', $sEmail);

				$sPass = $_POST['nextsnapmail-password'];
				if ('******' !== $sPass) {
					$this->config->setUserValue($sUser, 'nextsnapmail', 'passphrase',
						$sPass ? SnappyMailHelper::encodePassword($sPass, \md5($sEmail)) : '');
				}
			} else {
				return new JSONResponse([
					'status' => 'error',
					'Message' => $this->l->t('Invalid argument(s)'),
					'Email' => $sEmail
				]);
			}

			// Logout as the credentials have changed
			SnappyMailHelper::loadApp();
			\RainLoop\Api::Actions()->DoLogout();

			return new JSONResponse([
				'status' => 'success',
				'Message' => $this->l->t('Saved successfully'),
				'Email' => $sEmail
			]);
		} catch (\Throwable $e) {
			// Logout as the credentials might have changed, as exception could be in one attribute
			// TODO: Handle both exceptions separately?
			SnappyMailHelper::loadApp();
			\RainLoop\Api::Actions()->DoLogout();

			return new JSONResponse([
				'status' => 'error',
				'Message' => $e->getMessage()
			]);
		}
	}
}
