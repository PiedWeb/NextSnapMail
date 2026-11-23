<?php
// Native folder actions with fictional accounts and an in-memory IMAP transport.
namespace RainLoop\Model {
    final class Account {
        public function __construct(public string $name) {}
    }
}

namespace {
    use MailSo\Imap\Folder;
    use MailSo\Imap\FolderCollection;
    use MailSo\Imap\NamespaceResult;
    use MailSo\Imap\Response;
    use RainLoop\Model\Account;
    use RainLoop\Settings;

    spl_autoload_register(static function (string $class): void {
        require __DIR__ . '/../app/snappymail/v/2.38.2/app/libraries/' . str_replace('\\', '/', $class) . '.php';
    });

    final class TestSettings implements \RainLoop\Providers\Settings\ISettings {
        public array $data = [], $writes = [];
        public bool $refuse = false;
        public function Load(Account $account): array {
            return $this->data[$account->name] ?? [];
        }
        public function Save(Account $account, Settings $settings): bool {
            if ($this->refuse) return false;
            $this->data[$account->name] = $settings->toArray();
            $this->writes[] = $account->name;
            return true;
        }
        public function Delete(Account $account): bool { throw new LogicException('Unexpected settings removal'); }
    }

    final class TestFolders {
        use \RainLoop\Actions\Folders;
        public Account $account;
        public array $mailboxes = [], $params = [];
        public bool $acl = true;
        public ?NamespaceResult $namespaces;

        public function __construct(private string $directory, private TestSettings $driver) {
            $response = new Response;
            $response->ResponseList = [2 => [['', '/']], 3 => [['users/', '/']], 4 => [['shared/', '/']]];
            $this->namespaces = new NamespaceResult($response);
        }
        public function getAccountFromToken(): Account { return $this->account; }
        public function initMailClientConnection(): Account { return $this->getAccountFromToken(); }
        public function SettingsProvider(bool $local): \RainLoop\Providers\Settings {
            expect($local, 'Folder settings must be account-scoped');
            return new \RainLoop\Providers\Settings($this->driver);
        }
        public function LocalStorageProvider(): self { return $this; }
        public function GenerateFilePath(Account $account, int $type, bool $mkdir): string {
            $path = $this->directory . '/' . $account->name;
            if (!is_dir($path)) mkdir($path, 0700);
            return $path;
        }
        public function MailClient(): self { return $this; }
        public function ImapClient(): self { return $this; }
        public function GetNamespaces(): ?NamespaceResult { return $this->namespaces; }
        public function QuotaRoot(): array { return [0, 0]; }
        public function Capability(): array { return $this->acl ? ['ACL'] : []; }
        public function hasCapability(string $capability): bool { return in_array($capability, $this->Capability(), true); }
        public function GetActionParam(string $name, mixed $default): mixed { return $this->params[$name] ?? $default; }
        public function DefaultResponse(mixed $result): array { return ['Result' => $result]; }

        public function Folders(string $prefix, string $pattern, bool $subscribed): FolderCollection {
            $folders = new FolderCollection;
            foreach ($this->mailboxes[$this->account->name] as $name => $flags) {
                if (str_starts_with($name, $prefix)) $folders[$name] = new Folder($name, '/', $flags);
            }
            return $folders;
        }
    }

    function expect(bool $condition, string $message): void {
        if (!$condition) throw new RuntimeException($message);
    }

    $path = sys_get_temp_dir() . '/nextsnapmail-folders-' . bin2hex(random_bytes(8));
    mkdir($path, 0700);
    try {
        $settings = new TestSettings;
        $settings->data['first'] = ['SentFolder' => 'Personal sent', 'JunkFolder' => '__UNUSE__', 'OtherPreference' => true];
        $app = new TestFolders($path, $settings);
        $app->mailboxes = [
            'first' => ['INBOX' => [], 'Sent' => ['\\Sent'], 'Drafts' => ['\\Drafts'], 'Trash' => ['\\Trash'],
                'Shared junk' => ['\\Junk'], 'shared/Drafts' => ['\\Drafts'], 'users/bob/Trash' => ['\\Trash'],
                'Unavailable trash' => ['\\Trash', '\\Noselect'], 'Archive one' => ['\\Archive'], 'Archive two' => ['\\Archive']],
            'second' => ['INBOX' => [], 'Brouillons' => ['\\Drafts'], 'Corbeille' => ['\\Trash']],
        ];
        $app->account = new Account('first');
        $first = $app->DoFolders()['Result']['systemFolders'];
        expect($first === ['sent' => 'Personal sent', 'drafts' => 'Drafts', 'junk' => '__UNUSE__', 'trash' => 'Trash', 'archive' => ''],
            'Partial settings must be completed without using shared, unavailable, or ambiguous folders');
        expect($settings->data['first']['OtherPreference'] === true && $settings->data['first']['DraftsFolder'] === 'Drafts',
            'Drafts must be persisted without changing unrelated preferences');
        expect($app->DoFolders()['Result']['systemFolders'] === $first && $settings->writes === ['first'], 'Repeated discovery must not write again');

        $app->account = new Account('second');
        $app->namespaces = null;
        expect($app->DoFolders()['Result']['systemFolders']['trash'] === '', 'An ACL server without namespaces must not be guessed');
        $app->acl = false;
        $settings->refuse = true;
        expect($app->DoFolders()['Result']['systemFolders']['drafts'] === '', 'A failed write must not be reported as configured');
        $settings->refuse = false;
        $second = $app->DoFolders()['Result']['systemFolders'];
        expect($second['drafts'] === 'Brouillons' && $second['trash'] === 'Corbeille', 'Retry must resolve folders for the active linked account');

        $app->params = [...$second, 'trash' => '__UNUSE__', 'drafts' => 'My drafts'];
        expect($app->DoSystemFoldersUpdate()['Result'] === true, 'Explicit folder updates must still save');
        $updated = $app->DoFolders()['Result']['systemFolders'];
        expect($updated['trash'] === '__UNUSE__' && $updated['drafts'] === 'My drafts', 'Discovery must respect explicit and disabled folders');
        $app->account = new Account('first');
        expect($app->DoFolders()['Result']['systemFolders'] === $first, 'A linked account must not change another account');
        echo "System folders with partial, linked, ambiguous and explicit settings: passed.\n";
    } finally {
        foreach (glob($path . '/*/system-folders.lock') as $lock) unlink($lock);
        foreach (glob($path . '/*', GLOB_ONLYDIR) as $directory) rmdir($directory);
        rmdir($path);
    }
}
