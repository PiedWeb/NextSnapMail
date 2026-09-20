<?php
/* Native parser/protocol contracts with fictional in-memory IMAP. No network. */
namespace RainLoop\Model {
    class AdditionalAccount {
        public static function NewInstanceFromTokenArray($actions, $token, $throw = false) { return $token['account'] ?? null; }
    }
}
namespace {
    spl_autoload_register(static function($class) {
        $root = getenv('NEXTSNAPMAIL_SOURCE') ?: __DIR__ . '/../../../apps/nextsnapmail';
        $path = $root . '/app/snappymail/v/2.38.2/app/libraries/' . str_replace('\\', '/', $class) . '.php';
        if (is_file($path)) require_once $path;
    });
    require __DIR__ . '/../plugin/pied-web-ux/Feed.php';
    require __DIR__ . '/../plugin/pied-web-ux/MailboxOperations.php';
    define('APP_PRIVATE_DATA', sys_get_temp_dir() . '/pw-mailbox-tests-' . bin2hex(random_bytes(8)) . '/');
    class BoxAccount {
        public function __construct(private string $hash) {}
        public function Hash() { return $this->hash; }
        public function Email() { return $this->hash . '@example.test'; }
    }
    class BoxSettings {
        public array $data = ['TrashFolder' => 'Trash', 'SpamFolder' => 'Junk', 'DraftsFolder' => 'Drafts'];
        public function GetConf($key, $default = null) { return $this->data[$key] ?? $default; }
    }
    class BoxFetch {
        public function __construct(private array $data) {}
        public function GetFetchValue($name) { return $this->data[$name] ?? null; }
    }
    class BoxImap extends \MailSo\Imap\ImapClient {
        public array $data = [], $validity = [], $calls = [], $capabilities = ['MOVE', 'UIDPLUS', 'MULTISEARCH'];
        public string $folder = '';
        public bool $failMove = false, $omitMapping = false, $failFlag = false;
        public bool $keywords = true;
        public int $sequence = 1000;
        public function __construct() {
            $this->Settings = (new \ReflectionClass(\MailSo\Imap\Settings::class))->newInstanceWithoutConstructor();
            foreach (['INBOX', 'Sent', 'Archive', 'Trash', 'Junk', 'Drafts', 'Reminders'] as $name) {
                $this->data[$name] = []; $this->validity[$name] = count($this->data) + 100;
            }
        }
        public function hasCapability(string $name): bool { return in_array($name, $this->capabilities, true); }
        protected function ids(string $raw): array {
            $ids = [];
            foreach (explode(',', $raw) as $part) {
                $parts = array_map('intval', explode(':', $part));
                $ids = array_merge($ids, range($parts[0], $parts[1] ?? $parts[0]));
            }
            return $ids;
        }
        public function FolderExamine(string $folder, bool $force = false): \MailSo\Imap\FolderInformation { return $this->FolderSelect($folder, $force); }
        public function FolderSelect(string $folder, bool $force = false): \MailSo\Imap\FolderInformation {
            if (!isset($this->data[$folder])) throw new \RuntimeException('folder missing');
            $this->folder = $folder; $this->calls[] = ['select', $folder];
            $info = new \MailSo\Imap\FolderInformation($folder, true);
            $info->UIDVALIDITY = $this->validity[$folder];
            $info->PermanentFlags = $this->keywords ? ['\\Seen', '\\*'] : ['\\Seen'];
            return $info;
        }
        public function FolderList(string $parent, string $pattern, bool $subscribed = false, bool $status = false): \MailSo\Imap\FolderCollection {
            $list = new \MailSo\Imap\FolderCollection;
            foreach (array_keys($this->data) as $name) $list->append(new \MailSo\Imap\Folder($name, '/'));
            $list->append(new \MailSo\Imap\Folder('Not selectable', '/', ['\\Noselect']));
            return $list;
        }
        public function FolderHierarchyDelimiter(string $folder = ''): ?string { return '/'; }
        public function FolderStatusList(string $parent, string $pattern): \MailSo\Imap\FolderCollection {
            $list = new \MailSo\Imap\FolderCollection;
            if (isset($this->data[$parent])) $list[$parent] = new \MailSo\Imap\Folder($parent, '/');
            return $list;
        }
        public function MessageSearch(string $criteria, bool $uid = true): array {
            $this->calls[] = ['search', $this->folder, $criteria, $uid];
            return array_keys(array_filter($this->data[$this->folder], static fn($row) =>
                !str_contains($criteria, '"needle"') || str_contains($row['subject'], 'needle')));
        }
        public function Fetch(array $items, string $range, bool $uid): array {
            $this->calls[] = ['fetch', $this->folder, $items, $range, $uid];
            $out = [];
            foreach ($this->ids($range) as $id) {
                if (!isset($this->data[$this->folder][$id])) continue;
                $row = $this->data[$this->folder][$id];
                $out[] = new BoxFetch(['UID' => $id, 'FLAGS' => $row['flags'], 'INTERNALDATE' => gmdate('d-M-Y H:i:s +0000', $row['dateTimestamp'])]);
            }
            return $out;
        }
        public function EscapeFolderName(string $folder): string { return '"' . $folder . '"'; }
        public function SendRequestGetResponse(string $command, array $params = []): \MailSo\Imap\ResponseCollection {
            $this->calls[] = [$command, $this->folder, $params];
            if ($this->failMove) throw new \RuntimeException('transport lost');
            if ($command !== 'UID MOVE') throw new \LogicException('Unexpected mutation');
            $to = trim($params[1], '"');
            $old = $this->ids($params[0]);
            $new = [];
            foreach ($old as $uid) {
                if (!isset($this->data[$this->folder][$uid])) throw new \RuntimeException('missing');
                $target = ++$this->sequence;
                $new[] = $target;
                $this->data[$to][$target] = $this->data[$this->folder][$uid];
                unset($this->data[$this->folder][$uid]);
            }
            $response = new \MailSo\Imap\Response;
            if (!$this->omitMapping) $response->OptionalResponse = ['COPYUID', (string) $this->validity[$to], implode(',', $old), implode(',', $new)];
            $collection = new \MailSo\Imap\ResponseCollection;
            $collection->append($response);
            return $collection;
        }
        public function MessageMove(string $from, string $to, \MailSo\Imap\SequenceSet $range): void {
            $this->FolderSelect($from); $this->SendRequestGetResponse('UID MOVE', [(string) $range, $this->EscapeFolderName($to)]);
        }
    }
    class HydrationImap extends BoxImap {
        public function FetchIterate(array $items, string $range, bool $uid): iterable {
            $this->calls[] = ['native-hydrate', $this->folder, $items, $range, $uid];
            foreach ($this->ids($range) as $id) {
                $row = $this->data[$this->folder][$id];
                $response = new \MailSo\Imap\Response;
                $response->ResponseList = ['*', $id, 'FETCH', ['UID', $id, 'FLAGS', $row['flags'],
                    'RFC822.SIZE', 256, 'INTERNALDATE', gmdate('d-M-Y H:i:s +0000', $row['dateTimestamp']),
                    'BODY[HEADER]', "From: Sender <sender@example.test>\r\nTo: Reader <reader@example.test>\r\nSubject: " . $row['subject'] . "\r\nDate: " . gmdate('r', $row['dateTimestamp']) . "\r\n"]];
                yield new \MailSo\Imap\FetchResponse($response);
            }
        }
    }
    class BoxMail {
        public array $calls = [];
        public function __construct(public BoxImap $imap) {}
        public function ImapClient() { return $this->imap; }
        public function MessageRowsByUids(string $folder, array $uids): array {
            $this->calls[] = [$folder, $uids];
            $out = [];
            foreach ($uids as $uid) {
                if (isset($this->imap->data[$folder][$uid])) $out[] = $this->imap->data[$folder][$uid] + ['uid' => $uid, 'folder' => $folder];
            }
            return $out;
        }
        public function MessageSetFlag(string $folder, \MailSo\Imap\SequenceSet $range, string $flag, bool $set, bool $skip): void {
            $this->imap->calls[] = ['flag', $folder, $range->getArrayCopy(), $flag, $set];
            if ($this->imap->failFlag) throw new \RuntimeException('transport lost');
            foreach ($range->getArrayCopy() as $uid) {
                $flags = &$this->imap->data[$folder][$uid]['flags'];
                $flags = array_values(array_filter($flags, static fn($current) => strcasecmp($current, $flag) !== 0));
                if ($set) $flags[] = $flag;
            }
        }
    }
    class BoxActions {
        public array $params = [], $accounts = [], $mails = [], $settings = [], $offline = [];
        public function __construct(public BoxAccount $main, public BoxAccount $active) {}
        public function getMainAccountFromToken() { return $this->main; }
        public function getAccountFromToken() { return $this->active; }
        public function GetAccounts($main) { return $this->accounts; }
        public function GetActionParam($key, $default = '') { return $this->params[$key] ?? $default; }
        public function HasActionParam($key) { return array_key_exists($key, $this->params); }
        public function SettingsProvider($local) { return $this; }
        public function Load($account) { return $this->settings[$account->Hash()] ??= new BoxSettings; }
        public function PiedWebFeedMailClient($account) {
            if (in_array($account->Hash(), $this->offline, true)) throw new \RuntimeException('offline');
            return $this->mails[$account->Hash()] ??= new BoxMail(new BoxImap);
        }
    }
    $checks = 0;
    function check($condition, $label): void {
        if (!$condition) throw new \RuntimeException($label);
        ++$GLOBALS['checks']; echo "PASS $label\n";
    }
    $main = new BoxAccount('main'); $work = new BoxAccount('work');
    $actions = new BoxActions($main, $main);
    $actions->accounts = ['work@example.test' => ['account' => $work, 'name' => 'Work']];
    $a = $actions->PiedWebFeedMailClient($main)->imap; $b = $actions->PiedWebFeedMailClient($work)->imap;
    $row = static fn($date, $flags = [], $subject = 'needle message') => ['dateTimestamp' => $date, 'flags' => $flags, 'subject' => $subject];
    $a->data['INBOX'] = [1 => $row(10), 2 => $row(30, ['\\Seen']), 3 => $row(40, [], 'other message')];
    $a->data['Archive'] = [1 => $row(50)]; $a->data['Trash'] = [1 => $row(99)]; $a->data['Junk'] = [1 => $row(98)];
    $b->data['INBOX'] = [1 => $row(20)]; $b->data['Sent'] = [1 => $row(60)];
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $call = static function(array $params) use ($actions): array {
        $actions->params = $params;
        try { return PiedWebFeed::handle($actions); }
        catch (\RuntimeException $error) { return ['error' => $error->getMessage()]; }
    };
    $mutations = static fn($imap) => count(array_filter($imap->calls, static fn($call) => in_array($call[0], ['UID MOVE', 'flag'], true)));
    try {
        $search = $call(['operation' => 'search', 'scope' => 'all', 'search' => 'subject:needle', 'limit' => 2]);
        check(($search['total'] ?? 0) === 5 && count($search['items']) === 2, 'Server search finds all matching accounts/folders, not the loaded Feed subset');
        check($search['items'][0]['folder'] === 'Sent' && $search['items'][1]['folder'] === 'Archive', 'Stable global arrival order spans accounts and folders');
        check($search['scope']['excludeSpecial'] === ['trash', 'spam'] && !$search['partial'], 'All-folder scope explicitly excludes configured Trash and Spam');
        check($search['items'][0]['_pwAccountHash'] === 'work' && $search['items'][0]['_pwUidValidity'] === $b->validity['Sent'], 'Every row carries source account, folder and UIDVALIDITY');
        check($mutations($a) + $mutations($b) === 0, 'Search and pagination do not mutate mailbox flags');
        $a->data['INBOX'][99] = $row(999);
        $page = $call(['operation' => 'search', 'searchToken' => $search['searchToken'], 'offset' => 2, 'limit' => 2]);
        check($page['total'] === 5 && $page['items'][0]['uid'] === 2 && $page['items'][1]['_pwAccountHash'] === 'work', 'Later arrivals do not shift a frozen search pagination window');
        $fullFetch = array_filter(array_merge($a->calls, $b->calls), static fn($call) => $call[0] === 'fetch');
        check(!array_filter($fullFetch, static fn($call) => array_diff($call[2], ['UID', 'INTERNALDATE'])), 'Full-result enumeration fetches only UID/date; envelopes belong to page fetch');
        check($call(['operation' => 'search', 'scope' => 'all', 'search' => ''])['error'] === 'scope', 'Empty all-mail scope requires narrowing rather than implicit entire-mailbox selection');
        check($call(['operation' => 'search', 'search' => 'needle', 'accountHashes' => '["foreign"]'])['error'] === 'scope', 'Unlinked opaque account identifiers are rejected');
        $actions->offline = ['work'];
        $partial = $call(['operation' => 'search', 'scope' => 'inbox', 'search' => 'subject:needle']);
        check($partial['partial'] && $partial['total'] === 3 && $partial['accounts'][1]['error'] === 'mail', 'Unavailable account is visible without losing successful account results');
        $actions->offline = [];

        $prepared = $call(['operation' => 'prepare', 'searchToken' => $search['searchToken']]);
        check($prepared['count'] === 5 && count($prepared['groups']) === 4 && $prepared['expires'] > time(), 'All result pages freeze actual message identity groups and expiry');
        $action = ['operation' => 'action', 'action' => 'read', 'token' => $prepared['token'], 'cursor' => 0, 'confirmed' => '1'];
        $first = $call($action); $before = $mutations($a) + $mutations($b);
        check($call($action) === $first && $mutations($a) + $mutations($b) === $before, 'Acknowledged batch replay does not repeat flags or moves');
        $result = $first;
        while (!$result['done']) $result = $call(array_replace($action, ['cursor' => $result['cursor']]));
        check($result['cursor'] === 5 && in_array('\\Seen', $b->data['Sent'][1]['flags'], true), 'Multi-account bulk read reaches every frozen result');
        check($result['successful'] === 5 && $result['failed'] === 0 && $result['remaining'] === 0 && $result['expires'] <= time() + 120,
            'Completed non-undoable actions report exact success counts and short replay retention');
        check(!in_array('\\Seen', $a->data['INBOX'][99]['flags'], true), 'New arrivals remain outside the prepared selection');
        check($call(array_replace($action, ['action' => 'trash']))['error'] === 'scope', 'A prepared action cannot silently change operation after starting');

        $a->data['INBOX'][1]['flags'] = []; $a->data['INBOX'][2]['flags'] = ['\\Seen'];
        $selects = static fn() => \count(\array_filter($a->calls, static fn($entry) => $entry[0] === 'select'));
        $beforeSelects = $selects();
        $native = $call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[1,2]', 'uidValidity' => $a->validity['INBOX']]);
        check($native['count'] === 2 && $native['groups'][0]['uidValidity'] === $a->validity['INBOX'], 'Native UID selection preserves the rendered server UIDVALIDITY before mutation');
        check($selects() - $beforeSelects === 1, 'Native prepare validates UIDVALIDITY and flags with one fresh IMAP examine');
        $trashAction = ['operation' => 'action', 'action' => 'trash', 'token' => $native['token'], 'cursor' => 0, 'confirmed' => '1'];
        check($call(array_replace($trashAction, ['confirmed' => '0']))['error'] === 'scope', 'Bulk mutation requires explicit confirmation');
        $beforeSelects = $selects();
        $trashed = $call($trashAction);
        check($trashed['done'] && $trashed['undoToken'] !== '' && !isset($a->data['INBOX'][1]) && count($a->data['Trash']) === 3, 'Trash records COPYUID mapping and exposes a reversible operation');
        check($selects() - $beforeSelects === 2, 'Trash uses one validated flag fetch and one final writable select before MOVE');
        $beforeSelects = $selects();
        $undo = $call(['operation' => 'undo', 'undoToken' => $trashed['undoToken'], 'cursor' => 0]);
        check($undo['done'] && $undo['count'] === 2 && count($a->data['Trash']) === 1, 'Undo moves precisely the mapped destination UIDs, not stale source UIDs');
        check($selects() - $beforeSelects === 3, 'Undo examines destination and source once, then selects once immediately before MOVE');
        $restored = array_filter($a->data['INBOX'], static fn($row) => in_array($row['dateTimestamp'], [10,30], true));
        check(count($restored) === 2 && !in_array('\\Seen', array_values($restored)[0]['flags'], true)
            && in_array('\\Seen', array_values($restored)[1]['flags'], true), 'Undo restores original read/unread state on newly allocated source UIDs');
        $before = $mutations($a);
        check($call(['operation' => 'undo', 'undoToken' => $trashed['undoToken'], 'cursor' => 0]) === $undo && $before === $mutations($a), 'Undo replay is idempotent');

        $empty = $call(['operation' => 'prepare', 'scope' => 'folder', 'folder' => 'INBOX', 'search' => '', 'accountHashes' => '["main"]']);
        check($empty['count'] === count($a->data['INBOX']), 'Explicit single-folder all-pages selection accepts empty query');
        $changed = $call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[3]', 'uidValidity' => $a->validity['INBOX']]);
        ++$a->validity['INBOX'];
        $blocked = $call(['operation' => 'action', 'action' => 'trash', 'token' => $changed['token'], 'cursor' => 0, 'confirmed' => '1']);
        check($blocked['done'] && $blocked['partial'] && $blocked['failures'][0]['error'] === 'changed' && isset($a->data['INBOX'][3]), 'UIDVALIDITY change prevents mutation and reports the failed group');
        check($blocked['successful'] === 0 && $blocked['failed'] === 1 && $blocked['remaining'] === 0, 'Failed rows advance progress but are never counted as successful');
        --$a->validity['INBOX'];
        $renderedValidity = $a->validity['INBOX'];
        ++$a->validity['INBOX'];
        check($call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[3]', 'uidValidity' => $renderedValidity])['error'] === 'changed',
            'A mailbox reset between native rendering and prepare rejects recycled UIDs');
        --$a->validity['INBOX'];
        check($call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[3]'])['error'] === 'scope',
            'Native UID selection may not omit its rendered UIDVALIDITY');
        check($call(['operation' => 'prepare', 'items' => [['accountHash' => 'main', 'folder' => 'INBOX', 'uid' => 3, 'uidValidity' => 0]]])['error'] === 'scope', 'Cross-account explicit identities may not omit UIDVALIDITY');
        foreach (['3garbage', -3, 3.5, '4294967296'] as $invalid) {
            check($call(['operation' => 'prepare', 'items' => [['accountHash' => 'main', 'folder' => 'INBOX', 'uid' => $invalid, 'uidValidity' => 101]]])['error'] === 'scope',
                'Malformed or out-of-range UID is rejected: ' . json_encode($invalid));
        }
        check($call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[123456]', 'uidValidity' => $a->validity['INBOX']])['error'] === 'missing', 'Missing UID is rejected at preparation rather than guessed');
        $permanent = $call(['operation' => 'prepare', 'folder' => 'Trash', 'uids' => '[1]', 'uidValidity' => $a->validity['Trash']]);
        $denied = $call(['operation' => 'action', 'action' => 'trash', 'token' => $permanent['token'], 'cursor' => 0, 'confirmed' => '1']);
        check($denied['partial'] && $denied['failures'][0]['error'] === 'trash' && isset($a->data['Trash'][1]), 'Reversible trash endpoint never permanently deletes a Trash message');
        $a->capabilities = ['UIDPLUS'];
        $nocap = $call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[3]', 'uidValidity' => $a->validity['INBOX']]);
        $denied = $call(['operation' => 'action', 'action' => 'trash', 'token' => $nocap['token'], 'cursor' => 0, 'confirmed' => '1']);
        check($denied['partial'] && $denied['failures'][0]['error'] === 'capability', 'No COPY plus broad EXPUNGE fallback without native MOVE');
        $a->capabilities = ['MOVE', 'UIDPLUS'];
        $uncertain = $call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[3]', 'uidValidity' => $a->validity['INBOX']]);
        $a->omitMapping = true;
        $uncertainAction = ['operation' => 'action', 'action' => 'trash', 'token' => $uncertain['token'], 'cursor' => 0, 'confirmed' => '1'];
        check($call($uncertainAction)['error'] === 'uncertain', 'Missing COPYUID after successful MOVE is not falsely reported as undoable');
        $before = $mutations($a);
        check($call($uncertainAction)['error'] === 'uncertain' && $before === $mutations($a), 'Uncertain batch is persisted and cannot be automatically replayed');
        $a->omitMapping = false;

        // Cross-account reminders reuse the existing scheduler heartbeat, keyword and rollback path.
        mkdir(APP_PRIVATE_DATA . 'pied-web-ux/scheduled', 0700, true);
        file_put_contents(APP_PRIVATE_DATA . 'pied-web-ux/scheduled/sender.json', json_encode(['at' => time()]));
        $a->data['INBOX'][700] = $row(700); $b->data['INBOX'][700] = $row(700, ['\\Seen']);
        $reminders = $call(['operation' => 'prepare', 'items' => [
            ['accountHash' => 'main', 'folder' => 'INBOX', 'uidValidity' => $a->validity['INBOX'], 'uid' => 700],
            ['accountHash' => 'work', 'folder' => 'INBOX', 'uidValidity' => $b->validity['INBOX'], 'uid' => 700]]]);
        $reminderAction = ['operation' => 'action', 'token' => $reminders['token'], 'action' => 'remind', 'cursor' => 0,
            'confirmed' => '1', 'remindAt' => gmdate('Y-m-d\TH:i:s\Z', time() + 3600)];
        $reminded = $call($reminderAction);
        while (!isset($reminded['error']) && !$reminded['done']) $reminded = $call(array_replace($reminderAction, ['cursor' => $reminded['cursor']]));
        check(!isset($reminded['error']) && !$reminded['partial'] && !isset($a->data['INBOX'][700]) && !isset($b->data['INBOX'][700]),
            'Multi-account reminder schedules the correct Inbox in each isolated client');
        check($actions->active === $main && count($a->data['Reminders']) === 1 && count($b->data['Reminders']) === 1,
            'Reminder batches do not switch current tab/session account');
        $pending = array_values($b->data['Reminders'])[0];
        check(in_array('\\Seen', $pending['flags'], true) && (bool) array_filter($pending['flags'], static fn($flag) => str_starts_with($flag, '$pwremind-')),
            'Scoped reminders reuse the existing read-state and IMAP due-keyword contract');
        $a->data['INBOX'][701] = $row(701);
        $stale = $call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[701]', 'uidValidity' => $a->validity['INBOX']]);
        file_put_contents(APP_PRIVATE_DATA . 'pied-web-ux/scheduled/sender.json', json_encode(['at' => time() - 1900]));
        $staleResult = $call(array_replace($reminderAction, ['token' => $stale['token']]));
        check($staleResult['partial'] && $staleResult['failures'][0]['error'] === 'sender' && isset($a->data['INBOX'][701]),
            'Stale scheduler fails before a multi-account reminder can hide mail');
        file_put_contents(APP_PRIVATE_DATA . 'pied-web-ux/scheduled/sender.json', json_encode(['at' => time()]));
        $noKeyword = $call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[701]', 'uidValidity' => $a->validity['INBOX']]);
        $a->keywords = false;
        $noKeywordResult = $call(array_replace($reminderAction, ['token' => $noKeyword['token']]));
        check($noKeywordResult['partial'] && $noKeywordResult['failures'][0]['error'] === 'keyword' && isset($a->data['INBOX'][701]),
            'Unsupported reminder keywords are detected before mutations start');
        $a->keywords = true;

        for ($i = 10000; $i < 10451; ++$i) $a->data['Archive'][$i] = $row($i);
        $big = $call(['operation' => 'prepare', 'folder' => 'Archive', 'uids' => json_encode(range(10000,10450)), 'uidValidity' => $a->validity['Archive']]);
        $bigAction = ['operation' => 'action', 'action' => 'unread', 'token' => $big['token'], 'cursor' => 0, 'confirmed' => '1'];
        $big1 = $call($bigAction); $big2 = $call(array_replace($bigAction, ['cursor' => $big1['cursor']]));
        $big3 = $call(array_replace($bigAction, ['cursor' => $big2['cursor']]));
        check($big1['cursor'] === 200 && $big2['cursor'] === 400 && $big3['cursor'] === 451 && $big3['done'],
            'Large selections run bounded 200-message batches with exact remaining progress');

        require __DIR__ . '/../plugin/pied-web-ux/MailboxMailClient.php';
        $hydration = new HydrationImap;
        $hydration->Settings->message_all_headers = true;
        $hydration->data['Archive'] = [20 => $row(time()), 7 => $row(time() - 60, ['\\Seen'])];
        $nativeMail = new PiedWebMailboxMailClient;
        $property = new \ReflectionProperty(\MailSo\Mail\MailClient::class, 'oImapClient');
        $property->setValue($nativeMail, $hydration);
        $nativeRows = $nativeMail->MessageRowsByUids('Archive', [20,7]);
        $serialized = array_map(static fn($message) => $message->jsonSerialize(), iterator_to_array($nativeRows));
        check(array_column($serialized, 'uid') === [20,7] && $serialized[0]['subject'] === 'needle message',
            'Snapshot page hydration uses the real native Message row parser and preserves UID order');
        $fetchCall = end($hydration->calls);
        check($fetchCall[0] === 'native-hydrate' && $fetchCall[3] === '20,7' && $fetchCall[4]
            && in_array('BODY.PEEK[HEADER]', $fetchCall[2], true),
            'Native hydration fetches only explicit UIDs and read-only headers, not unfiltered folder pages');

        $a->data['INBOX'][5000] = $row(5000);
        $foreign = $call(['operation' => 'prepare', 'folder' => 'INBOX', 'uids' => '[5000]', 'uidValidity' => $a->validity['INBOX']]);
        $actions->main = new BoxAccount('someone-else');
        check($call(['operation' => 'action', 'action' => 'read', 'token' => $foreign['token'], 'cursor' => 0, 'confirmed' => '1'])['error'] === 'expired', 'Selection tokens are isolated to authenticated main account storage');
        $actions->main = $main;
        $path = APP_PRIVATE_DATA . 'pied-web-ux/mailbox-snapshots/' . hash('sha256', 'main') . '/' . $foreign['token'] . '.json';
        $saved = file_get_contents($path);
        check((fileperms($path) & 0777) === 0600 && !str_contains($saved, 'example.test') && !str_contains($saved, 'needle'), 'Private snapshots contain no account email, subject or body');
        $queryPath = APP_PRIVATE_DATA . 'pied-web-ux/mailbox-snapshots/' . hash('sha256', 'main') . '/' . $search['searchToken'] . '.json';
        check(!str_contains(file_get_contents($queryPath), 'needle') && isset($search['scope']['queryHash']),
            'Search snapshot keeps only a digest of the user query, not typed text or addresses');
        for ($i = 0; $i < 205; ++$i) {
            $a->data['ZBudget-' . $i] = []; $a->validity['ZBudget-' . $i] = 500 + $i;
        }
        $budgeted = $call(['operation' => 'search', 'scope' => 'all', 'search' => 'subject:needle', 'accountHashes' => '["main"]']);
        check($budgeted['partial'] && (bool) array_filter($budgeted['failures'], static fn($failure) => $failure['error'] === 'limit'),
            'Large folder trees stop at a bounded scope and advertise incomplete results');
        for ($i = 0; $i < 205; ++$i) unset($a->data['ZBudget-' . $i], $a->validity['ZBudget-' . $i]);

        if (in_array('--benchmark', $argv, true)) {
            $a->data['Archive'] = $b->data['Archive'] = [];
            for ($i = 1; $i <= 20000; ++$i) {
                $a->data['Archive'][$i] = $row(1700000000 + $i);
                $b->data['Archive'][$i] = $row(1700000001 + $i);
            }
            $indexMs = $pageMs = [];
            for ($run = 0; $run < 5; ++$run) {
                $start = hrtime(true);
                $indexed = $call(['operation' => 'search', 'scope' => 'folder', 'folder' => 'Archive', 'search' => 'subject:needle', 'limit' => 50]);
                $indexMs[] = (hrtime(true) - $start) / 1e6;
                if (($indexed['total'] ?? 0) !== 40000) throw new \RuntimeException('benchmark index incomplete');
                $searchCount = count(array_filter(array_merge($a->calls, $b->calls), static fn($call) => $call[0] === 'search'));
                $start = hrtime(true);
                $page = $call(['operation' => 'search', 'searchToken' => $indexed['searchToken'], 'offset' => 20000, 'limit' => 50]);
                $pageMs[] = (hrtime(true) - $start) / 1e6;
                if (count($page['items']) !== 50 || $searchCount !== count(array_filter(array_merge($a->calls, $b->calls), static fn($call) => $call[0] === 'search'))) {
                    throw new \RuntimeException('pagination must not rerun IMAP search');
                }
            }
            sort($indexMs); sort($pageMs);
            echo json_encode(['benchmark' => 'mocked-IMAP CPU/storage only, no network latency', 'rows' => 40000, 'accounts' => 2,
                'runs' => 5, 'indexMedianMs' => round($indexMs[2], 2), 'pageMedianMs' => round($pageMs[2], 2),
                'peakMemoryMiB' => round(memory_get_peak_usage(true) / 1048576, 2)], JSON_UNESCAPED_SLASHES) . "\n";
        }
        $saved = json_decode($saved, true); $saved['expires'] = time() - 1; file_put_contents($path, json_encode($saved));
        check($call(['operation' => 'action', 'action' => 'read', 'token' => $foreign['token'], 'cursor' => 0, 'confirmed' => '1'])['error'] === 'expired', 'Expired actions are rejected');
        $_SERVER['REQUEST_METHOD'] = 'GET';
        check($call(['operation' => 'search', 'search' => 'needle'])['error'] === 'POST required', 'Search and mutations retain the authenticated POST dispatcher contract');
        echo "$checks checks passed with native parser/protocol classes and mocked IMAP; no real mailbox accessed.\n";
    } finally {
        if (is_dir(APP_PRIVATE_DATA)) {
            $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(APP_PRIVATE_DATA, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
            foreach ($files as $file) $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
            rmdir(APP_PRIVATE_DATA);
        }
    }
}
