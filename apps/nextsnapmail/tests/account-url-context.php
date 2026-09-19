<?php
// Run with: php tests/account-url-context.php
// In-memory account doubles: no credentials, mail server or user data.
namespace RainLoop\Enumerations {
    class Capa { public const ADDITIONAL_ACCOUNTS = 'additional-accounts'; }
}
namespace RainLoop\Exceptions {
    class ClientException extends \Exception {
        public function __construct(int $code) { parent::__construct('', $code); }
    }
}
namespace RainLoop {
    class Notifications { public const AccountDoesNotExist = 802; }
}
namespace SnappyMail {
    class Cookies {
        public static array $values = [];
        public static function getSecure(string $key) { return static::$values[$key] ?? null; }
        public static function setSecure(string $key, $value): void { static::$values[$key] = $value; }
        public static function clear(string $key): void { unset(static::$values[$key]); }
    }
}
namespace RainLoop\Model {
    class Account {
        public function __construct(private string $email, private string $hash) {}
        public function Email(): string { return $this->email; }
        public function Hash(): string { return $this->hash; }
    }
    class MainAccount extends Account {}
    class AdditionalAccount extends Account {
        public static function NewInstanceFromTokenArray(
            \RainLoop\Actions $actions,
            array $data,
            bool $throw = false
        ): ?Account {
            if (!isset($data['email'], $data['hash'])) {
                if ($throw) throw new \RuntimeException('Invalid account token');
                return null;
            }
            return new static($data['email'], $data['hash']);
        }
    }
}
namespace RainLoop {
    require __DIR__ . '/../app/snappymail/v/2.38.2/app/libraries/RainLoop/Actions/UserAuth.php';

    class Actions {
        use \RainLoop\Actions\UserAuth;

        public const AUTH_ADDITIONAL_TOKEN_KEY = 'smadditional';
        public const AUTH_SPEC_TOKEN_KEY = 'smauth';
        public const AUTH_SIGN_ME_TOKEN_KEY = 'smsignme';

        public array $accounts = [];
        public function GetCapa(string $capa): bool { return true; }
        public function GetAccounts(Model\MainAccount $account): array { return $this->accounts; }
    }

    function assertSame($expected, $actual, string $message): void {
        if ($expected !== $actual) {
            throw new \RuntimeException($message . ': expected ' . \var_export($expected, true)
                . ', got ' . \var_export($actual, true));
        }
    }

    $mainHash = \str_repeat('a', 40);
    $personalHash = \str_repeat('b', 40);
    $workHash = \str_repeat('c', 40);
    $accounts = [
        ['email' => 'personal@example.test', 'hash' => $personalHash],
        ['email' => 'work@example.test', 'hash' => $workHash],
    ];
    $_COOKIE[Actions::AUTH_ADDITIONAL_TOKEN_KEY] = 'present';
    \SnappyMail\Cookies::$values[Actions::AUTH_ADDITIONAL_TOKEN_KEY] = $accounts[0];

    $newActions = static function () use ($mainHash, $accounts): Actions {
        $actions = new Actions();
        $actions->accounts = $accounts;
        $actions->SetMainAuthAccount(new Model\MainAccount('main@example.test', $mainHash));
        return $actions;
    };

    $firstTab = $newActions();
    $firstTab->SetAccountContext($personalHash);
    assertSame('personal@example.test', $firstTab->getAccountFromToken()->Email(), 'First tab context');

    $secondTab = $newActions();
    $secondTab->SetAccountContext($workHash);
    assertSame('work@example.test', $secondTab->getAccountFromToken()->Email(), 'Second tab context');
    assertSame('personal@example.test', $firstTab->getAccountFromToken()->Email(), 'First tab stays independent');

    $mainTab = $newActions();
    $mainTab->SetAccountContext('main');
    assertSame('main@example.test', $mainTab->getAccountFromToken()->Email(), 'Main alias');
    $mainTab->SetAccountContext($mainHash);
    assertSame('main@example.test', $mainTab->getAccountFromToken()->Email(), 'Main account hash');

    $legacyClient = $newActions();
    $legacyClient->SetAccountContext('0');
    assertSame('personal@example.test', $legacyClient->getAccountFromToken()->Email(), 'Legacy cookie fallback');

    $unknown = $newActions();
    $unknown->SetAccountContext(\str_repeat('d', 40));
    assertSame(null, $unknown->getAccountFromToken(false), 'Unknown explicit context fails closed');
    try {
        $unknown->getAccountFromToken();
        throw new \RuntimeException('Unknown context did not throw');
    } catch (Exceptions\ClientException $exception) {
        assertSame(Notifications::AccountDoesNotExist, $exception->getCode(), 'Unknown context error');
    }

    echo "Per-request account URL context and legacy fallback: passed.\n";
}
