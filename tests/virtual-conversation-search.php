<?php

spl_autoload_register(function ($class) {
    $path = getenv('NEXTSNAPMAIL_SOURCE') . '/app/snappymail/v/2.38.2/app/libraries/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($path)) require_once $path;
});

class ConversationReadOnlyImap extends \MailSo\Imap\ImapClient
{
    public function __construct()
    {
        $this->Settings = (new \ReflectionClass(\MailSo\Imap\Settings::class))->newInstanceWithoutConstructor();
    }

    public function hasCapability(string $name): bool { return false; }
}

$imap = new ConversationReadOnlyImap;
$cases = [
    ['header=References+%3Croot%40example.test%3E', 'HEADER "References" "<root@example.test>" UNDELETED'],
    ['header=In-Reply-To+%3Croot%40example.test%3E', 'HEADER "In-Reply-To" "<root@example.test>" UNDELETED'],
    ['header=References+%3Croot%26tag%40example.test%3E', 'HEADER "References" "<root&tag@example.test>" UNDELETED'],
];
foreach ($cases as [$query, $expected]) {
    $cache = false;
    $actual = (string) \MailSo\Imap\SearchCriterias::fromString($imap, 'Sent', $query, true, $cache);
    if ($actual !== $expected) throw new \RuntimeException("Native search contract changed: {$actual}");
}
echo count($cases) . " native read-only header-search checks passed\n";
