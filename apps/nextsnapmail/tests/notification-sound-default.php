<?php
// Run with: php tests/notification-sound-default.php
// Static contract check: no account, credential or mailbox is required.

$actions = file_get_contents(
    __DIR__ . '/../app/snappymail/v/2.38.2/app/libraries/RainLoop/Actions.php'
);
$userActions = file_get_contents(
    __DIR__ . '/../app/snappymail/v/2.38.2/app/libraries/RainLoop/Actions/User.php'
);

function assertOccurrences(int $expected, string $needle, string $subject, string $message): void
{
    $actual = substr_count($subject, $needle);
    if ($actual !== $expected) {
        throw new RuntimeException("{$message}: expected {$expected}, got {$actual}");
    }
}

assertOccurrences(
    1,
    "'SoundNotification' => false,",
    $actions,
    'Sound notifications must be disabled by default'
);
assertOccurrences(
    1,
    "GetConf('SoundNotification', \$aResult['SoundNotification'])",
    $actions,
    'An explicit stored user choice must still override the default'
);
assertOccurrences(
    1,
    "setSettingsFromParams(\$oSettings, 'SoundNotification', 'bool')",
    $userActions,
    'General settings must still save the user choice'
);

echo "Quiet notification default and reversible user setting: passed.\n";
