<?php

final class PiedWebUnreadOrder
{
    public const SETTING = 'PiedWebUnreadOldestFirst';
    public const BEHAVIOR_SETTING = 'PiedWebUnreadOrderReadBehavior';

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

        $hasEnabled = $actions->HasActionParam('enabled');
        $hasBehavior = $actions->HasActionParam('behavior');
        $enabled = $hasEnabled ? $actions->GetActionParam('enabled', '') : null;
        $behavior = $hasBehavior ? $actions->GetActionParam('behavior', '') : null;
        if ($hasEnabled && !\in_array($enabled, [0, 1, '0', '1', false, true], true)) {
            throw new \RuntimeException('enabled');
        }
        if ($hasBehavior && !\in_array($behavior, [1, 2, '1', '2'], true)) {
            throw new \RuntimeException('behavior');
        }
        if ($hasEnabled || $hasBehavior) {
            if ($hasEnabled) $settings->SetConf(self::SETTING, (bool) $enabled);
            if ($hasBehavior) $settings->SetConf(self::BEHAVIOR_SETTING, (int) $behavior);
            if (!$settings->save()) {
                throw new \RuntimeException('settings');
            }
        }

        $behavior = (int) $settings->GetConf(self::BEHAVIOR_SETTING, 1);
        return [
            'enabled' => (bool) $settings->GetConf(self::SETTING, false),
            'behavior' => \in_array($behavior, [1, 2], true) ? $behavior : 1,
        ];
    }
}
