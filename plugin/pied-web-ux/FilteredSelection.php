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
        if (!$folder || !trim($search) || $validity < 1) throw new RuntimeException('scope');
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
