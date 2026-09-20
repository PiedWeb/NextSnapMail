<?php

/** Private, expiring UID snapshots. No mailbox passwords or message bodies. */
final class PiedWebFilteredSelection
{
    const TTL = 1800, BATCH = 200;
    private string $directory;

    public function __construct(string $root, string $accountId)
    {
        $this->directory = $root . '/' . hash('sha256', $accountId);
        if (!is_dir($this->directory) && !mkdir($this->directory, 0700, true) && !is_dir($this->directory)) {
            throw new RuntimeException('storage');
        }
    }

    public function prepare(string $folder, string $search, int $validity, array $uids, string $trash): array
    {
        if (!$folder || $validity < 1) throw new RuntimeException('scope');
        if (!$trash || $trash === '__UNUSE__') throw new RuntimeException('trash');
        $uids = array_values(array_unique(array_filter(array_map('intval', $uids), fn($uid) => $uid > 0)));
        sort($uids, SORT_NUMERIC);
        // Keep temporary storage bounded even if a user repeatedly prepares selections.
        $files = glob($this->directory . '/*.json') ?: [];
        foreach ($files as $file) {
            if (filemtime($file) < time() - self::TTL) @unlink($file);
        }
        if (count(glob($this->directory . '/*.json') ?: []) >= 30) throw new RuntimeException('limit');
        $token = bin2hex(random_bytes(24));
        $state = compact('folder', 'search', 'validity', 'uids', 'trash') + [
            'expires' => time() + self::TTL, 'cursor' => 0, 'pending' => false
        ];
        $file = fopen($this->directory . '/' . $token . '.json', 'x+');
        if (!$file) throw new RuntimeException('storage');
        try {
            chmod($this->directory . '/' . $token . '.json', 0600);
            $this->write($file, $state);
        } finally { fclose($file); }
        return $this->result($state) + ['token' => $token];
    }

    private function result(array $state): array
    {
        return ['count' => count($state['uids']), 'cursor' => $state['cursor'], 'trash' => $state['trash'],
            'done' => $state['cursor'] >= count($state['uids']),
            'permanent' => $state['folder'] === $state['trash']];
    }

    private function write($file, array $state): void
    {
        $json = json_encode($state, JSON_THROW_ON_ERROR);
        rewind($file);
        if (fwrite($file, $json) !== strlen($json) || !ftruncate($file, strlen($json)) || !fflush($file)) {
            throw new RuntimeException('storage');
        }
    }

    /** Reuse the private, expiring snapshot store for cross-account search/selection.
     * The caller scopes this instance to the authenticated MAIN account. Only opaque
     * account hashes, mailbox names and UID metadata belong in these records. */
    public function createSnapshot(array $state): array
    {
        // Serialize quota admission across concurrent browser tabs. This lock never
        // surrounds IMAP and therefore cannot serialize unrelated mailbox work.
        $quotaPath = $this->directory . '/.quota.lock';
        $quota = fopen($quotaPath, 'c+');
        if (!$quota) throw new RuntimeException('storage');
        try {
            if (!chmod($quotaPath, 0600) || !flock($quota, LOCK_EX)) throw new RuntimeException('storage');
            foreach (glob($this->directory . '/*.json') ?: [] as $path) {
                if (filemtime($path) >= time() - self::TTL) continue;
                $expired = @fopen($path, 'r+');
                if (!$expired) continue;
                try {
                    // An action may have started just before expiry. Never remove
                    // its replay/uncertainty record while it holds the IMAP lock.
                    if (flock($expired, LOCK_EX | LOCK_NB)) {
                        clearstatcache(true, $path);
                        if (filemtime($path) < time() - self::TTL) @unlink($path);
                        flock($expired, LOCK_UN);
                    }
                } finally { fclose($expired); }
            }
            $files = glob($this->directory . '/*.json') ?: [];
            // Quick row actions also create snapshots; thirty per half-hour was too low.
            // Bound both count and incoming bytes without evicting undoable operations.
            $state['expires'] = time() + self::TTL;
            $bytes = strlen(json_encode($state, JSON_THROW_ON_ERROR));
            if (count($files) >= 512 || $bytes + array_sum(array_map('filesize', $files)) > 64 * 1024 * 1024) {
                throw new RuntimeException('limit');
            }
            $token = bin2hex(random_bytes(24));
            $path = $this->directory . '/' . $token . '.json';
            $file = fopen($path, 'x+');
            if (!$file) throw new RuntimeException('storage');
            try {
                if (!chmod($path, 0600)) throw new RuntimeException('storage');
                $this->write($file, $state);
            } finally { fclose($file); }
            return ['token' => $token, 'expires' => $state['expires']];
        } finally { flock($quota, LOCK_UN); fclose($quota); }
    }

    public function readSnapshot(string $token, string $kind): array
    {
        return $this->withSnapshot($token, $kind, static fn(array &$state, $persist) => $state);
    }

    /** Hold the lock across a mutation. persist() MUST record pending before IMAP. */
    public function withSnapshot(string $token, string $kind, callable $callback): array
    {
        if (!preg_match('/^[a-f0-9]{48}$/D', $token)) throw new RuntimeException('expired');
        $file = @fopen($this->directory . '/' . $token . '.json', 'r+');
        if (!$file) throw new RuntimeException('expired');
        try {
            if (!flock($file, LOCK_EX)) throw new RuntimeException('storage');
            $state = json_decode(stream_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            if (($state['expires'] ?? 0) < time()) throw new RuntimeException('expired');
            if (($state['kind'] ?? '') !== $kind) throw new RuntimeException('scope');
            $persist = function() use ($file, &$state): void {
                $this->write($file, $state);
                // Cleanup uses mtime + TTL, including shortened completed-action TTLs.
                $metadata = stream_get_meta_data($file);
                if (!touch($metadata['uri'], $state['expires'] - self::TTL)) throw new RuntimeException('storage');
            };
            return $callback($state, $persist);
        } finally { flock($file, LOCK_UN); fclose($file); }
    }

    public function batch(string $token, int $cursor, string $folder, string $search, string $trash, $imap): array
    {
        if (!preg_match('/^[a-f0-9]{48}$/D', $token)) throw new RuntimeException('expired');
        $file = @fopen($this->directory . '/' . $token . '.json', 'r+');
        if (!$file) throw new RuntimeException('expired');
        try {
            if (!flock($file, LOCK_EX)) throw new RuntimeException('storage');
            $state = json_decode(stream_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            if ($state['expires'] < time()) throw new RuntimeException('expired');
            if ($folder !== $state['folder'] || $search !== $state['search'] || $trash !== $state['trash']) {
                throw new RuntimeException('scope');
            }
            // A lost response must never automatically repeat an uncertain IMAP operation.
            if ($state['pending']) throw new RuntimeException('uncertain');
            if ($cursor < 0 || $cursor > $state['cursor']) throw new RuntimeException('scope');
            if ($cursor < $state['cursor'] || $this->result($state)['done']) return $this->result($state);
            $permanent = $folder === $trash;
            if (!$imap->hasCapability($permanent ? 'UIDPLUS' : 'MOVE')) throw new RuntimeException('capability');
            $info = $imap->FolderSelect($folder, true);
            if ((int) $info->UIDVALIDITY !== $state['validity']) throw new RuntimeException('changed');
            $uids = array_slice($state['uids'], $cursor, self::BATCH);
            $range = new \MailSo\Imap\SequenceSet($uids, true);
            $state['pending'] = true;
            $this->write($file, $state);
            // Finish recording this one batch if the browser closes mid-request.
            ignore_user_abort(true);
            if ($permanent) {
                // false + UIDPLUS guarantees UID EXPUNGE, never folder-wide EXPUNGE.
                $imap->MessageDelete($folder, $range, false);
            } else {
                // MOVE is required: avoid COPY + folder-wide EXPUNGE fallbacks.
                $imap->MessageMove($folder, $trash, $range);
            }
            $state['cursor'] += count($uids);
            $state['pending'] = false;
            $this->write($file, $state);
            return $this->result($state);
        } finally { flock($file, LOCK_UN); fclose($file); }
    }
}
