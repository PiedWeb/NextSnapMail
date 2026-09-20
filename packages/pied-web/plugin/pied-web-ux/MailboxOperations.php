<?php

/** Account-safe server search and frozen, explicit message selections.
 * No passwords, message headers, bodies or addresses are stored in snapshots. */
final class PiedWebMailboxOperations
{
    private const MAX_RESULTS = 100000, FETCH_BATCH = 1000, PAGE_LIMIT = 100;
    private const MAX_FOLDERS = 200, SEARCH_SECONDS = 20;
    private $actions;
    private $main;
    private array $accounts = [], $clients = [];
    private PiedWebFilteredSelection $store;

    public function __construct($actions, $main)
    {
        require_once __DIR__ . '/FilteredSelection.php';
        $this->actions = $actions;
        $this->main = $main;
        foreach (PiedWebFeed::accounts($actions, $main) as $entry) {
            $this->accounts[$entry['account']->Hash()] = $entry;
        }
        $this->store = new PiedWebFilteredSelection(APP_PRIVATE_DATA . 'pied-web-ux/mailbox-snapshots', $main->Hash());
    }

    public function handle(string $operation): array
    {
        if ($operation === 'search') return $this->search();
        if ($operation === 'prepare') return $this->prepare();
        if ($operation === 'action') return $this->action();
        if ($operation === 'undo') return $this->undo();
        throw new \RuntimeException('scope');
    }

    private function param(string $name, $default = '') { return $this->actions->GetActionParam($name, $default); }

    private function arrayParam(string $name): array
    {
        $value = $this->param($name, []);
        if (\is_string($value)) {
            if (\strlen($value) > 1024 * 1024) throw new \RuntimeException('limit');
            try { $value = \json_decode($value, true, 16, JSON_THROW_ON_ERROR); }
            catch (\Throwable $error) { throw new \RuntimeException('scope'); }
        }
        if (!\is_array($value) || !\array_is_list($value)) throw new \RuntimeException('scope');
        return $value;
    }

    private function mail(string $hash)
    {
        if (!isset($this->accounts[$hash])) throw new \RuntimeException('scope');
        return $this->clients[$hash] ??= PiedWebFeed::mailClient($this->actions, $this->accounts[$hash]['account']);
    }

    private function settings(string $hash)
    {
        if (!isset($this->accounts[$hash])) throw new \RuntimeException('scope');
        $settings = $this->actions->SettingsProvider(true)->Load($this->accounts[$hash]['account']);
        if (!$settings) throw new \RuntimeException('settings');
        return $settings;
    }

    private static function folder(string $folder): string
    {
        if ($folder === '' || \strlen($folder) > 1024 || \preg_match('/[\x00-\x1f\x7f]/', $folder)) {
            throw new \RuntimeException('scope');
        }
        return $folder;
    }

    private static function uid($value): int
    {
        if ((!\is_int($value) && !\is_string($value)) || !\preg_match('/^[1-9]\d*$/D', (string) $value)
            || (float) $value > 4294967295) throw new \RuntimeException('scope');
        return (int) $value;
    }

    private function hashes(bool $native = false): array
    {
        if (!$this->actions->HasActionParam('accountHashes')) {
            if ($native) return [(string) $this->actions->getAccountFromToken()->Hash()];
            return \array_values(\array_filter(\array_keys($this->accounts),
                fn($hash) => (bool) $this->settings($hash)->GetConf(PiedWebFeed::INCLUDE_GLOBAL_SETTING, true)));
        }
        $hashes = $this->arrayParam('accountHashes');
        if (!$hashes || \count($hashes) > 100) throw new \RuntimeException('scope');
        foreach ($hashes as $hash) {
            if (!\is_string($hash) || !isset($this->accounts[$hash])) throw new \RuntimeException('scope');
        }
        return \array_values(\array_unique($hashes));
    }

    private static function key(array $row): string
    {
        return $row['accountHash'] . "\0" . $row['folder'] . "\0" . $row['uidValidity'] . "\0" . $row['uid'];
    }

    private static function groupKey(array $row): string
    {
        return $row['accountHash'] . "\0" . $row['folder'] . "\0" . $row['uidValidity'];
    }

    private static function error(\Throwable $error): string
    {
        return \in_array($error->getMessage(), ['changed', 'missing', 'capability', 'trash', 'scope', 'sender', 'time', 'keyword'], true)
            ? $error->getMessage() : 'mail';
    }

    private function scope(): array
    {
        $scope = (string) $this->param('scope', 'all');
        if (!\in_array($scope, ['all', 'inbox', 'folder'], true)) throw new \RuntimeException('scope');
        $search = \trim((string) $this->param('search'));
        if (\strlen($search) > 8192 || ($scope === 'all' && $search === '')) throw new \RuntimeException('scope');
        return ['scope' => $scope, 'queryHash' => \hash('sha256', $search),
            'folder' => $scope === 'folder' ? self::folder((string) $this->param('folder')) : '',
            'accountHashes' => $this->hashes(), 'excludeSpecial' => $scope === 'all' ? ['trash', 'spam'] : [],
            'unit' => 'messages', 'sort' => 'arrival-desc'];
    }

    private function folders($imap, $settings, array $scope): array
    {
        if ($scope['scope'] === 'inbox') return ['INBOX'];
        if ($scope['scope'] === 'folder') return [$scope['folder']];
        $excluded = \array_filter([(string) $settings->GetConf('TrashFolder', ''), (string) $settings->GetConf('SpamFolder', '')]);
        $folders = [];
        foreach ($imap->FolderList('', '*') as $folder) {
            if ($folder->Selectable() && !\in_array($folder->FullName, $excluded, true)) $folders[] = $folder->FullName;
        }
        \sort($folders, SORT_STRING);
        return \array_values(\array_unique($folders));
    }

    private function buildSearch(): array
    {
        $scope = $this->scope();
        $search = \trim((string) $this->param('search'));
        $deadline = \microtime(true) + self::SEARCH_SECONDS;
        $visitedFolders = 0;
        $rows = $failures = [];
        foreach ($scope['accountHashes'] as $hash) {
            if ($visitedFolders >= self::MAX_FOLDERS || \microtime(true) > $deadline) {
                $failures[] = ['accountHash' => $hash, 'folder' => '', 'error' => 'limit'];
                continue;
            }
            try {
                $mail = $this->mail($hash);
                $imap = $mail->ImapClient();
                $settings = $this->settings($hash);
                $folders = $this->folders($imap, $settings, $scope);
            } catch (\Throwable $error) {
                $failures[] = ['accountHash' => $hash, 'folder' => '', 'error' => self::error($error)];
                continue;
            }
            foreach ($folders as $folder) {
                if ($visitedFolders >= self::MAX_FOLDERS || \microtime(true) > $deadline) {
                    $failures[] = ['accountHash' => $hash, 'folder' => '', 'error' => 'limit'];
                    break;
                }
                ++$visitedFolders;
                try {
                    $cache = false;
                    $criteria = (string) \MailSo\Imap\SearchCriterias::fromString($imap, $folder, $search,
                        (bool) $settings->GetConf('HideDeleted', true), $cache);
                    // Each result must carry one real folder: never flatten MULTISEARCH.
                    if (\str_starts_with($criteria, 'IN (')) throw new \RuntimeException('scope');
                    $info = $imap->FolderExamine($folder, true);
                    $validity = (int) $info->UIDVALIDITY;
                    if ($validity < 1) throw new \RuntimeException('changed');
                    $uids = \array_values(\array_unique(\array_map('intval', $imap->MessageSearch($criteria, true))));
                    if (\count($uids) + \count($rows) > self::MAX_RESULTS) throw new \RuntimeException('limit');
                    // Only UID and date, not envelopes/bodies, are fetched for the full result set.
                    foreach (\array_chunk($uids, self::FETCH_BATCH) as $chunk) {
                        if (\microtime(true) > $deadline) throw new \RuntimeException('budget');
                        foreach ($imap->Fetch(['UID', 'INTERNALDATE'], \implode(',', $chunk), true) as $response) {
                            $uid = (int) $response->GetFetchValue('UID');
                            if ($uid < 1) continue;
                            $rows[] = ['accountHash' => $hash, 'folder' => $folder, 'uidValidity' => $validity, 'uid' => $uid,
                                'date' => (int) \strtotime((string) $response->GetFetchValue('INTERNALDATE'))];
                        }
                    }
                } catch (\Throwable $error) {
                    if ($error->getMessage() === 'limit') throw $error;
                    // Do not represent a partially fetched folder as a complete selection.
                    $rows = \array_values(\array_filter($rows, static fn($row) => $row['accountHash'] !== $hash || $row['folder'] !== $folder));
                    $failures[] = ['accountHash' => $hash, 'folder' => $folder,
                        'error' => $error->getMessage() === 'budget' ? 'limit' : self::error($error)];
                }
            }
        }
        \usort($rows, static fn($a, $b) => ($b['date'] <=> $a['date']) ?: \strcmp(self::key($a), self::key($b)));
        return ['kind' => 'search', 'rows' => $rows, 'scope' => $scope, 'failures' => $failures, 'createdAt' => \time()];
    }

    private function publicAccounts(array $scope, array $failures): array
    {
        $accounts = [];
        foreach ($scope['accountHashes'] as $hash) {
            if (!isset($this->accounts[$hash])) throw new \RuntimeException('scope');
            $entry = $this->accounts[$hash];
            $errors = \array_values(\array_filter($failures, static fn($failure) => $failure['accountHash'] === $hash));
            $accounts[] = ['hash' => $hash, 'email' => $entry['email'], 'name' => $entry['name'],
                'error' => $errors ? $errors[0]['error'] : '', 'failures' => $errors];
        }
        return $accounts;
    }

    private function search(): array
    {
        $token = (string) $this->param('searchToken');
        if ($token !== '') {
            $state = $this->store->readSnapshot($token, 'search');
        } else {
            $state = $this->buildSearch();
            $created = $this->store->createSnapshot($state);
            $token = $created['token'];
            $state['expires'] = $created['expires'];
        }
        $offset = \max(0, (int) $this->param('offset', 0));
        $limit = \min(self::PAGE_LIMIT, \max(1, (int) $this->param('limit', 50)));
        $page = \array_slice($state['rows'], $offset, $limit);
        $groups = [];
        foreach ($page as $row) $groups[self::groupKey($row)][] = $row;
        $items = [];
        $failures = $state['failures'];
        foreach ($groups as $group) {
            $first = $group[0];
            $hash = $first['accountHash'];
            try {
                $mail = $this->mail($hash);
                $info = $mail->ImapClient()->FolderExamine($first['folder'], true);
                if ((int) $info->UIDVALIDITY !== $first['uidValidity']) throw new \RuntimeException('changed');
                foreach ($mail->MessageRowsByUids($first['folder'], \array_column($group, 'uid')) as $message) {
                    $row = $message instanceof \JsonSerializable ? $message->jsonSerialize() : (array) $message;
                    $identity = $first;
                    $identity['uid'] = (int) ($row['uid'] ?? 0);
                    $row['_pwAccountHash'] = $hash;
                    $row['_pwAccountEmail'] = $this->accounts[$hash]['email'];
                    $row['_pwAccountName'] = $this->accounts[$hash]['name'];
                    $row['_pwUidValidity'] = $first['uidValidity'];
                    $row['uidValidity'] = $first['uidValidity'];
                    $row['_pwKind'] = $first['folder'] === $this->settings($hash)->GetConf('DraftsFolder', '') ? 'draft' : 'message';
                    $items[self::key($identity)] = $row;
                }
            } catch (\Throwable $error) {
                $failures[] = ['accountHash' => $hash, 'folder' => $first['folder'], 'error' => self::error($error)];
            }
        }
        $ordered = [];
        foreach ($page as $row) if (isset($items[self::key($row)])) $ordered[] = $items[self::key($row)];
        return ['items' => $ordered, 'accounts' => $this->publicAccounts($state['scope'], $failures),
            'total' => \count($state['rows']), 'offset' => $offset, 'limit' => $limit,
            'searchToken' => $token, 'expires' => $state['expires'], 'scope' => $state['scope'],
            'partial' => (bool) $failures, 'failures' => $failures, 'missing' => \count($page) - \count($ordered)];
    }

    /** Force one fresh mailbox snapshot, validate it, then fetch in bounded chunks. */
    private function fetchFlags($imap, string $folder, array $uids, ?int $expectedValidity = null): array
    {
        $validity = (int) $imap->FolderExamine($folder, true)->UIDVALIDITY;
        if ($validity < 1 || ($expectedValidity !== null && $validity !== $expectedValidity)) {
            throw new \RuntimeException('changed');
        }
        $found = [];
        foreach (\array_chunk($uids, self::FETCH_BATCH) as $chunk) {
            foreach ($imap->Fetch(['UID', 'FLAGS'], \implode(',', $chunk), true) as $response) {
                $uid = (int) $response->GetFetchValue('UID');
                if ($uid > 0) $found[$uid] = (array) $response->GetFetchValue('FLAGS');
            }
        }
        if (\count($found) !== \count($uids) || \array_diff($uids, \array_keys($found))) throw new \RuntimeException('missing');
        return ['uidValidity' => $validity, 'flags' => $found];
    }

    private function prepare(): array
    {
        $searchToken = (string) $this->param('searchToken');
        if ($searchToken !== '') {
            $source = $this->store->readSnapshot($searchToken, 'search');
        } elseif ($this->actions->HasActionParam('items') || $this->actions->HasActionParam('uids')) {
            $rows = [];
            if ($this->actions->HasActionParam('items')) {
                foreach ($this->arrayParam('items') as $item) {
                    if (!\is_array($item)) throw new \RuntimeException('scope');
                    $hash = (string) ($item['accountHash'] ?? '');
                    if (!isset($this->accounts[$hash])) throw new \RuntimeException('scope');
                    $row = ['accountHash' => $hash, 'folder' => self::folder((string) ($item['folder'] ?? '')),
                        'uidValidity' => self::uid($item['uidValidity'] ?? 0), 'uid' => self::uid($item['uid'] ?? 0)];
                    $rows[self::key($row)] = $row;
                }
            } else {
                $hashes = $this->hashes(true);
                if (\count($hashes) !== 1) throw new \RuntimeException('scope');
                $hash = $hashes[0];
                $folder = self::folder((string) $this->param('folder'));
                // The native list response carries the mailbox generation it
                // rendered. Never resolve this only at click time: recycled UIDs
                // after a mailbox reset could otherwise address different mail.
                $validity = self::uid($this->param('uidValidity'));
                foreach ($this->arrayParam('uids') as $uid) {
                    $row = ['accountHash' => $hash, 'folder' => $folder, 'uidValidity' => $validity, 'uid' => self::uid($uid)];
                    $rows[self::key($row)] = $row;
                }
            }
            if (!$rows || \count($rows) > 2000) throw new \RuntimeException('limit');
            $groups = [];
            foreach ($rows as $row) $groups[self::groupKey($row)][] = $row;
            foreach ($groups as $group) {
                $first = $group[0];
                $imap = $this->mail($first['accountHash'])->ImapClient();
                $this->fetchFlags($imap, $first['folder'], \array_column($group, 'uid'), $first['uidValidity']);
            }
            $source = ['rows' => \array_values($rows), 'failures' => [], 'scope' => ['scope' => 'items', 'unit' => 'messages',
                'accountHashes' => \array_values(\array_unique(\array_column($rows, 'accountHash')))]];
        } else {
            $source = $this->buildSearch();
        }
        // Revalidate membership even for snapshots prepared before a linked account was removed.
        $this->publicAccounts($source['scope'], $source['failures']);
        $rows = \array_map(static fn($row) => \array_intersect_key($row, \array_flip(['accountHash', 'folder', 'uidValidity', 'uid'])), $source['rows']);
        \usort($rows, static fn($a, $b) => \strcmp(self::groupKey($a), self::groupKey($b)) ?: ($a['uid'] <=> $b['uid']));
        $state = ['kind' => 'selection', 'rows' => $rows, 'scope' => $source['scope'], 'failures' => $source['failures'],
            'cursor' => 0, 'pending' => false, 'action' => '', 'undo' => [], 'undoCursor' => 0, 'undoPending' => false];
        $created = $this->store->createSnapshot($state);
        return \array_replace($this->result($state, $created['token']), $created);
    }

    private function result(array $state, string $token): array
    {
        $groups = [];
        foreach ($state['rows'] as $row) {
            $key = self::groupKey($row);
            if (!isset($groups[$key])) $groups[$key] = ['accountHash' => $row['accountHash'], 'folder' => $row['folder'], 'uidValidity' => $row['uidValidity'], 'count' => 0];
            ++$groups[$key]['count'];
        }
        $failed = (int) \array_sum(\array_column($state['failures'], 'count'));
        return ['count' => \count($state['rows']), 'cursor' => $state['cursor'], 'done' => $state['cursor'] >= \count($state['rows']),
            'successful' => $state['cursor'] - $failed, 'failed' => $failed, 'remaining' => \count($state['rows']) - $state['cursor'],
            'groups' => \array_values($groups), 'scope' => $state['scope'], 'partial' => (bool) $state['failures'], 'failures' => $state['failures'],
            'undoToken' => $state['undo'] && $state['cursor'] >= \count($state['rows']) ? $token : '', 'expires' => $state['expires'] ?? 0];
    }

    private function batchRows(array $rows, int $cursor): array
    {
        $batch = [];
        $key = null;
        foreach (\array_slice($rows, $cursor, PiedWebFilteredSelection::BATCH) as $row) {
            $next = self::groupKey($row);
            if ($key !== null && $key !== $next) break;
            $key = $next;
            $batch[] = $row;
        }
        return $batch;
    }

    private function action(): array
    {
        if ((string) $this->param('confirmed') !== '1') throw new \RuntimeException('scope');
        $token = (string) $this->param('token');
        $action = (string) $this->param('action');
        if (!\in_array($action, ['read', 'unread', 'flag', 'unflag', 'trash', 'remind'], true)) throw new \RuntimeException('scope');
        return $this->store->withSnapshot($token, 'selection', function(array &$state, $persist) use ($token, $action): array {
            $cursor = (int) $this->param('cursor', -1);
            if ($state['pending'] || $state['undoPending']) throw new \RuntimeException('uncertain');
            if ($state['undoCursor'] || ($state['action'] !== '' && $state['action'] !== $action)) throw new \RuntimeException('scope');
            if ($cursor < 0 || $cursor > $state['cursor']) throw new \RuntimeException('scope');
            if ($cursor < $state['cursor'] || $state['cursor'] >= \count($state['rows'])) return $this->result($state, $token);
            $batch = $this->batchRows($state['rows'], $cursor);
            $first = $batch[0];
            $hash = $first['accountHash'];
            $uids = \array_column($batch, 'uid');
            $state['action'] = $action;
            $remindAt = (string) $this->param('remindAt');
            if ($action === 'remind') {
                require_once __DIR__ . '/Reminders.php';
                PiedWebReminders::parse($remindAt);
                if (isset($state['remindAt']) && $state['remindAt'] !== $remindAt) throw new \RuntimeException('scope');
                $state['remindAt'] = $remindAt;
            }
            try {
                $mail = $this->mail($hash);
                $imap = $mail->ImapClient();
                $flags = $this->fetchFlags($imap, $first['folder'], $uids, $first['uidValidity'])['flags'];
                $trash = (string) $this->settings($hash)->GetConf('TrashFolder', '');
                if ($action === 'trash') {
                    if (!$trash || $trash === '__UNUSE__' || $trash === $first['folder']) throw new \RuntimeException('trash');
                    if (!$imap->hasCapability('MOVE') || !$imap->hasCapability('UIDPLUS')) throw new \RuntimeException('capability');
                }
                if ($action === 'remind') {
                    if (\strcasecmp($first['folder'], 'INBOX') !== 0) throw new \RuntimeException('scope');
                    PiedWebReminders::validateScoped($this->actions, $this->accounts[$hash]['account'], $mail, $remindAt);
                }
            } catch (\Throwable $error) {
                // Failure before mutation is certain and can safely advance this group.
                $state['failures'][] = ['accountHash' => $hash, 'folder' => $first['folder'], 'error' => self::error($error), 'count' => \count($batch)];
                $state['cursor'] += \count($batch);
                $persist();
                return $this->result($state, $token);
            }
            $state['pending'] = true;
            $persist();
            \ignore_user_abort(true);
            try {
                $range = new \MailSo\Imap\SequenceSet($uids, true);
                if ($action === 'trash') {
                    $mapping = self::moveMapped($imap, $first['folder'], $trash, $uids, $first['uidValidity']);
                    foreach ($mapping['uids'] as $old => $new) {
                        $state['undo'][] = ['accountHash' => $hash, 'folder' => $trash, 'uidValidity' => $mapping['uidValidity'], 'uid' => $new,
                            'sourceFolder' => $first['folder'], 'sourceValidity' => $first['uidValidity'],
                            'seen' => (bool) \array_filter($flags[$old], static fn($flag) => \strcasecmp((string) $flag, '\\Seen') === 0)];
                    }
                } elseif ($action === 'remind') {
                    PiedWebReminders::applyScoped($this->actions, $this->accounts[$hash]['account'], $mail, $uids, $remindAt);
                } else {
                    $flag = \in_array($action, ['flag', 'unflag'], true) ? '\\Flagged' : '\\Seen';
                    $mail->MessageSetFlag($first['folder'], $range, $flag, \in_array($action, ['read', 'flag'], true), false);
                }
            } catch (\Throwable $error) {
                // A transport failure after issuing UID MOVE must never be replayed.
                throw new \RuntimeException('uncertain');
            }
            $state['cursor'] += \count($batch);
            $state['pending'] = false;
            if ($state['cursor'] >= \count($state['rows']) && !$state['undo']) {
                // Keep replay protection briefly, without accumulating half an hour
                // of already completed read/unread/reminder row-action snapshots.
                $state['expires'] = \min($state['expires'], \time() + 120);
            }
            $persist();
            return $this->result($state, $token);
        });
    }

    /** UID MOVE's COPYUID is the authoritative mapping; do not guess from UIDNEXT. */
    public static function moveMapped($imap, string $from, string $to, array $uids, ?int $expectedValidity = null): array
    {
        if (!$imap->hasCapability('MOVE') || !$imap->hasCapability('UIDPLUS')) throw new \RuntimeException('capability');
        $info = $imap->FolderSelect($from, true);
        if ($expectedValidity !== null && (int) $info->UIDVALIDITY !== $expectedValidity) throw new \RuntimeException('changed');
        $responses = $imap->SendRequestGetResponse('UID MOVE', [(string) new \MailSo\Imap\SequenceSet($uids, true), $imap->EscapeFolderName($to)]);
        foreach ($responses as $response) {
            $optional = $response->OptionalResponse;
            if (!\is_array($optional) || \strtoupper((string) ($optional[0] ?? '')) !== 'COPYUID' || \count($optional) !== 4) continue;
            $validity = (int) $optional[1];
            $old = self::expandSequence((string) $optional[2], \count($uids));
            $new = self::expandSequence((string) $optional[3], \count($uids));
            if ($validity < 1 || \count($old) !== \count($uids) || \count($new) !== \count($old)
                || \array_diff($uids, $old) || \count(\array_unique($new)) !== \count($new)) throw new \RuntimeException('uncertain');
            return ['uidValidity' => $validity, 'uids' => \array_combine($old, $new)];
        }
        throw new \RuntimeException('uncertain');
    }

    private static function expandSequence(string $sequence, int $limit): array
    {
        if (!\preg_match('/^[1-9]\d*(?::[1-9]\d*)?(?:,[1-9]\d*(?::[1-9]\d*)?)*$/D', $sequence)) throw new \RuntimeException('uncertain');
        $values = [];
        foreach (\explode(',', $sequence) as $part) {
            $range = \explode(':', $part);
            $first = (int) $range[0];
            $last = (int) ($range[1] ?? $first);
            if (\abs($last - $first) + 1 + \count($values) > $limit) throw new \RuntimeException('uncertain');
            foreach (\range($first, $last) as $uid) $values[] = $uid;
        }
        return $values;
    }

    private function undo(): array
    {
        $token = (string) $this->param('undoToken');
        return $this->store->withSnapshot($token, 'selection', function(array &$state, $persist) use ($token): array {
            $cursor = (int) $this->param('cursor', -1);
            if ($state['pending'] || $state['undoPending']) throw new \RuntimeException('uncertain');
            if ($state['action'] !== 'trash' || $state['cursor'] < \count($state['rows']) || !$state['undo']) throw new \RuntimeException('scope');
            if ($cursor < 0 || $cursor > $state['undoCursor']) throw new \RuntimeException('scope');
            $result = static fn() => ['count' => \count($state['undo']), 'cursor' => $state['undoCursor'],
                'done' => $state['undoCursor'] >= \count($state['undo']), 'undoToken' => $token];
            if ($cursor < $state['undoCursor'] || $state['undoCursor'] >= \count($state['undo'])) return $result();
            // Source folder is part of the undo batch key even if several sources used one Trash.
            $batch = [];
            foreach ($this->batchRows($state['undo'], $cursor) as $row) {
                if ($batch && ($batch[0]['sourceFolder'] !== $row['sourceFolder'] || $batch[0]['sourceValidity'] !== $row['sourceValidity'])) break;
                $batch[] = $row;
            }
            $first = $batch[0];
            $mail = $this->mail($first['accountHash']);
            $imap = $mail->ImapClient();
            if ((int) $imap->FolderExamine($first['sourceFolder'], true)->UIDVALIDITY !== $first['sourceValidity']) throw new \RuntimeException('changed');
            $uids = \array_column($batch, 'uid');
            $this->fetchFlags($imap, $first['folder'], $uids, $first['uidValidity']);
            $state['undoPending'] = true;
            $persist();
            \ignore_user_abort(true);
            try {
                $mapping = self::moveMapped($imap, $first['folder'], $first['sourceFolder'], $uids, $first['uidValidity']);
                if ($mapping['uidValidity'] !== $first['sourceValidity']) throw new \RuntimeException('uncertain');
                foreach ([true, false] as $seen) {
                    $restore = [];
                    foreach ($batch as $row) if ($row['seen'] === $seen) $restore[] = $mapping['uids'][$row['uid']];
                    if ($restore) $mail->MessageSetFlag($first['sourceFolder'], new \MailSo\Imap\SequenceSet($restore, true), '\\Seen', $seen, false);
                }
            } catch (\Throwable $error) { throw new \RuntimeException('uncertain'); }
            $state['undoCursor'] += \count($batch);
            $state['undoPending'] = false;
            $persist();
            // Arrow closures capture arrays by value, so construct the final result now.
            return ['count' => \count($state['undo']), 'cursor' => $state['undoCursor'],
                'done' => $state['undoCursor'] >= \count($state['undo']), 'undoToken' => $token];
        });
    }
}
