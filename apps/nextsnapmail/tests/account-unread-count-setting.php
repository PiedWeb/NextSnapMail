<?php
// Run with: php tests/account-unread-count-setting.php
// The unread counter switch is one shared setting, on by default, so it no longer
// depends on which linked account happens to be active.
// In-memory doubles: no live mail server, credentials, or user data.
namespace MailSo\Base {
    class Utils { public static function SecureFileName(string $name): string { return \preg_replace('#[|\\\\?*<":>+\\[\\]/&\\pC]#su', '-', $name); } }
}
namespace MailSo\Log {
    trait Inherit { public function Logger() { return null; } public function SetLogger($logger): void {} }
}
namespace RainLoop\Model {
    class Account {
        public function __construct(protected string $sEmail) {}
        public function Email(): string { return $this->sEmail; }
        public function Hash(): string { return \sha1($this->sEmail); }
    }
    class MainAccount extends Account {}
    class AdditionalAccount extends Account {
        public function __construct(string $sEmail, private string $sParentEmail) { parent::__construct($sEmail); }
        public function ParentEmail(): string { return $this->sParentEmail; }
    }
}
namespace RainLoop {
    // Doubles for the two settings objects, recording what each one is asked to store.
    class Settings {
        public array $written = [];
        public function __construct(private array $aData) {}
        public function GetConf(string $sName, $mDefault = null) { return $this->aData[$sName] ?? $mDefault; }
        public function SetConf(string $sName, $mValue): void { $this->written[$sName] = $mValue; }
        public function save(): bool { return true; }
    }
    class Api {
        public static $oActions;
        public static function Actions() { return static::$oActions; }
    }
}
namespace {
    $sRoot = __DIR__ . '/../app/snappymail/v/2.38.2/app/libraries/';
    require $sRoot . 'RainLoop/Providers/Storage/Enumerations/StorageType.php';
    require $sRoot . 'RainLoop/Providers/Storage/IStorage.php';
    require $sRoot . 'RainLoop/Providers/Storage/FileStorage.php';
    require $sRoot . 'RainLoop/Enumerations/Capa.php';
    foreach (\glob($sRoot . 'RainLoop/Actions/*.php') as $sFile) {
        require_once $sFile;
    }

    use RainLoop\Providers\Storage\Enumerations\StorageType;

    function assertSame($mExpected, $mActual, string $sMessage): void {
        if ($mExpected !== $mActual) {
            throw new \RuntimeException($sMessage . ': expected ' . \var_export($mExpected, true) . ', got ' . \var_export($mActual, true));
        }
    }

    // 1. Why the shared settings file works: only the local storage splits an
    //    additional account into its own subfolder.
    $oMain = new \RainLoop\Model\MainAccount('robin@example.test');
    $oOther = new \RainLoop\Model\AdditionalAccount('robin@other.test', 'robin@example.test');
    $oShared = new \RainLoop\Providers\Storage\FileStorage('/data/storage', false);
    $oLocal = new \RainLoop\Providers\Storage\FileStorage('/data/storage', true);
    assertSame(
        $oShared->GenerateFilePath($oMain, StorageType::CONFIG),
        $oShared->GenerateFilePath($oOther, StorageType::CONFIG),
        'Shared settings must resolve to the main account folder'
    );
    assertSame(
        '/data/storage/example.test/robin/robin@other.test/',
        $oLocal->GenerateFilePath($oOther, StorageType::CONFIG),
        'Local settings must stay in a per-account subfolder'
    );

    class SettingsHarness {
        use \RainLoop\Actions\User;

        public array $params = [];
        public \RainLoop\Settings $oShared;
        public \RainLoop\Settings $oLocal;

        public function __construct(array $aShared = [], array $aLocal = []) {
            $this->oShared = new \RainLoop\Settings($aShared);
            $this->oLocal = new \RainLoop\Settings($aLocal);
        }
        public function Config() { return new class { public function Get($section, $key, $default = null) { return $default; } }; }
        public function SettingsProvider(bool $bLocal = false) {
            $oSettings = $bLocal ? $this->oLocal : $this->oShared;
            return new class($oSettings) { public function __construct(private $o) {} public function Load($oAccount) { return $this->o; } };
        }
        public function AddressBookProvider($oAccount = null, bool $bForceEnable = false) { return new class { public function IsActive(): bool { return false; } }; }
        public function GetCapa(string $sCapa): bool { return false; }
        public function HasActionParam(string $sName): bool { return \array_key_exists($sName, $this->params); }
        public function GetActionParam(string $sName, $mDefault = null) { return $this->params[$sName] ?? $mDefault; }
        public function getAccountFromToken(bool $bThrow = true) { return new \RainLoop\Model\AdditionalAccount('robin@other.test', 'robin@example.test'); }
        public function getMainAccountFromToken(bool $bThrow = true) { return new \RainLoop\Model\MainAccount('robin@example.test'); }
        public function DefaultResponse($mResult): array { return ['Result' => $mResult]; }
    }

    \RainLoop\Api::$oActions = new class { public function getMainAccountFromToken() { return new \RainLoop\Model\MainAccount('robin@example.test'); } };

    // 2. A stale per-account value can no longer switch the counters off, and the
    //    setting now defaults to on. HideDeleted proves the local block still runs.
    $oTest = new SettingsHarness([], ['ShowUnreadCount' => false, 'HideDeleted' => false]);
    $aData = $oTest->getAccountData(new \RainLoop\Model\AdditionalAccount('robin@other.test', 'robin@example.test'));
    assertSame(true, $aData['ShowUnreadCount'], 'The counter must be on by default');
    assertSame(false, $aData['HideDeleted'], 'Other local settings must still be read');

    // 3. Saving the switch writes it to the shared settings, never the local ones.
    $oTest = new SettingsHarness;
    $oTest->params = ['ShowUnreadCount' => true];
    $oTest->DoSettingsUpdate();
    assertSame(['ShowUnreadCount' => true], $oTest->oShared->written, 'The switch must be saved as a shared setting');
    assertSame([], $oTest->oLocal->written, 'The switch must not be saved per account');

    // 4. AppData() is too entangled to drive from a harness, so check its source:
    //    the value handed to the browser must come from the shared settings only.
    $sAppData = \file_get_contents($sRoot . 'RainLoop/Actions.php');
    assertSame(
        1,
        \preg_match_all("/\\\$aResult\\['ShowUnreadCount'\\] = \\(bool\\)\\\$oSettings->GetConf\\('ShowUnreadCount'/", $sAppData),
        'AppData must read the counter from the shared settings'
    );
    foreach (['RainLoop/Actions.php', 'RainLoop/Actions/Accounts.php', 'RainLoop/Actions/User.php'] as $sFile) {
        assertSame(
            0,
            \preg_match_all("/oSettingsLocal[^\\n]*ShowUnreadCount/", \file_get_contents($sRoot . $sFile)),
            "No per-account read or write of the counter may come back in {$sFile}"
        );
    }

    echo "Shared storage scope, default-on counter, shared read and save paths: passed.\n";
}
