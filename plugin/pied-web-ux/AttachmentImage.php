<?php

final class PiedWebAttachmentImage
{
    public static function read($provider, $account, string $key): array
    {
        // No filesystem paths. FileStorage hashes this opaque key inside the current account's .files directory.
        if (!$key || strlen($key) > 256 || !preg_match('/^[a-zA-Z0-9_-]+$/D', $key)) {
            throw new \RuntimeException('key');
        }
        $limit = 20 * 1024 * 1024;
        $size = $provider->FileSize($account, $key);
        if (!$size || $size > $limit) throw new \RuntimeException('size');
        $stream = $provider->GetFile($account, $key, 'rb');
        if (!is_resource($stream)) throw new \RuntimeException('file');
        try {
            $bytes = stream_get_contents($stream, $limit + 1);
        } finally {
            fclose($stream);
        }
        if ($bytes === false || strlen($bytes) !== $size) throw new \RuntimeException('size');
        $info = @getimagesizefromstring($bytes);
        if (!$info || !in_array($info['mime'], ['image/jpeg', 'image/png', 'image/webp'], true)) {
            throw new \RuntimeException('type');
        }
        return ['data' => 'data:' . $info['mime'] . ';base64,' . base64_encode($bytes)];
    }
}
