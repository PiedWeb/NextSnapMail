<?php

final class PiedWebFolderOrder
{
    public const SETTING = 'PiedWebFolderOrderV1';

    private const MAX_ITEMS = 256;
    private const MAX_ITEM_LENGTH = 1024;
    private const MAX_PAYLOAD_LENGTH = 131072;

    public static function handle($actions): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            throw new \RuntimeException('POST required');
        }
        $account = $actions->getAccountFromToken();
        if (!$account) {
            throw new \RuntimeException('Login required');
        }
        $settings = $actions->SettingsProvider(true)->Load($account);
        if (!$settings) {
            throw new \RuntimeException('settings');
        }

        if ($actions->HasActionParam('order')) {
            $raw = $actions->GetActionParam('order', '');
            if (!\is_string($raw) || \strlen($raw) > self::MAX_PAYLOAD_LENGTH) {
                throw new \RuntimeException('order');
            }
            try {
                $decoded = \json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
            } catch (\Throwable $error) {
                throw new \RuntimeException('order');
            }
            $order = self::validate($decoded);
            $encoded = \json_encode($order, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($encoded === false) {
                throw new \RuntimeException('order');
            }
            $settings->SetConf(self::SETTING, $encoded);
            if (!$settings->save()) {
                throw new \RuntimeException('settings');
            }
        } else {
            $order = self::stored($settings->GetConf(self::SETTING, '[]'));
        }

        return ['order' => $order];
    }

    private static function stored($raw): array
    {
        if (!\is_string($raw) || $raw === '' || \strlen($raw) > self::MAX_PAYLOAD_LENGTH) {
            return [];
        }
        try {
            return self::validate(\json_decode($raw, true, 16, JSON_THROW_ON_ERROR));
        } catch (\Throwable $error) {
            // A damaged optional preference must never hide or break the native folders.
            return [];
        }
    }

    private static function validate($candidate): array
    {
        if (!\is_array($candidate) || !\array_is_list($candidate) || \count($candidate) > self::MAX_ITEMS) {
            throw new \RuntimeException('order');
        }
        $seen = [];
        foreach ($candidate as $item) {
            if (!\is_string($item) || $item === '' || \strlen($item) > self::MAX_ITEM_LENGTH
                || \preg_match('/[\x00-\x1F\x7F]/', $item) || isset($seen[$item])) {
                throw new \RuntimeException('order');
            }
            $seen[$item] = true;
        }
        return \array_keys($seen);
    }
}
