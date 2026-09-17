<?php

final class PiedWebUnreadOrder
{
    public const SETTING = 'PiedWebUnreadOldestFirst';

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

        if ($actions->HasActionParam('enabled')) {
            $value = $actions->GetActionParam('enabled', '');
            if (!\in_array($value, [0, 1, '0', '1', false, true], true)) {
                throw new \RuntimeException('enabled');
            }
            $settings->SetConf(self::SETTING, (bool) $value);
            if (!$settings->save()) {
                throw new \RuntimeException('settings');
            }
        }

        return ['enabled' => (bool) $settings->GetConf(self::SETTING, false)];
    }
}
