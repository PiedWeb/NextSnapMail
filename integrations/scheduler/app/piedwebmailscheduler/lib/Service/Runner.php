<?php
declare(strict_types=1);

namespace OCA\PiedWebMailScheduler\Service;

use OCP\IConfig;
use Psr\Log\LoggerInterface;

/* One pass over every served mailbox.
 *
 * Opening a mailbox costs a login, so a mailbox is opened when its poll interval has
 * elapsed or when something is known to be due before then. The note that says so is
 * written by the browser when it schedules a message and by this pass when it finishes:
 * losing it delays a send to the next interval, it never drops one. */
final class Runner {
    public const APP_ID = 'piedwebmailscheduler';
    private const DEFAULT_INTERVAL = 300;

    public function __construct(
        private IConfig $config,
        private Mailboxes $mailboxes,
        private Sender $sender,
        private LoggerInterface $logger,
    ) {}

    public function run(int $now, bool $force = false, bool $dryRun = false, string $only = ''): array
    {
        $interval = \max(60, (int) $this->config->getAppValue(self::APP_ID, 'interval', (string) self::DEFAULT_INTERVAL));
        $results = [];
        $mailboxes = $this->mailboxes->all();
        // Say that a sender exists on this server, so the composer knows it may schedule.
        // Only after the mailboxes are read: that is what loads the application constants.
        $dryRun || $this->beat($now);
        foreach ($mailboxes as $key => $mailbox) {
            if ($only !== '' && 0 !== \strcasecmp($only, $mailbox['email'])) continue;
            $hash = \hash('sha256', $key);
            $hint = $this->readHint($hash);
            $last = (int) $this->config->getAppValue(self::APP_ID, 'poll-' . $hash, '0');
            if (!$force && $now - $last < $interval && !($hint !== null && $hint <= $now)) {
                $results[$key] = ['skipped' => true, 'next' => $hint];
                continue;
            }
            try {
                $report = $this->sender->mailbox($mailbox['email'], $mailbox['password'], $now, $dryRun);
            } catch (\Throwable $error) {
                // An unreachable or misconfigured mailbox waits for the next interval like any
                // other, instead of being logged into again on every pass.
                $dryRun || $this->config->setAppValue(self::APP_ID, 'poll-' . $hash, (string) $now);
                $this->logger->warning('Scheduled mail: mailbox unavailable', ['exception' => $error]);
                $results[$key] = ['error' => $error->getMessage()];
                continue;
            }
            if (!$dryRun) {
                $this->config->setAppValue(self::APP_ID, 'poll-' . $hash, (string) $now);
                $this->writeHint($hash, $report['next'], $now);
            }
            $results[$key] = $report;
        }
        return $results;
    }

    private function beat(int $now): void
    {
        $base = $this->directory();
        if (!$base) return;
        if (!\is_dir($base) && !@\mkdir($base, 0700, true) && !\is_dir($base)) return;
        @\file_put_contents($base . '/sender.json', (string) \json_encode(['at' => $now]), LOCK_EX);
    }

    private function directory(): string
    {
        return \defined('APP_PRIVATE_DATA') ? APP_PRIVATE_DATA . 'pied-web-ux/scheduled' : '';
    }

    private function readHint(string $hash): ?int
    {
        $base = $this->directory();
        if (!$base || !\is_file($base . '/' . $hash . '.json')) return null;
        $known = \json_decode((string) @\file_get_contents($base . '/' . $hash . '.json'), true);
        $due = isset($known['due']) ? (int) $known['due'] : 0;
        return $due > 0 ? $due : null;
    }

    private function writeHint(string $hash, ?int $next, int $now): void
    {
        $base = $this->directory();
        if (!$base) return;
        $file = $base . '/' . $hash . '.json';
        // The browser may have scheduled something earlier while this pass was running.
        $known = $this->readHint($hash);
        if ($known !== null && $known > $now && ($next === null || $known < $next)) return;
        if ($next === null) { @\unlink($file); return; }
        if (!\is_dir($base) && !@\mkdir($base, 0700, true) && !\is_dir($base)) return;
        @\file_put_contents($file, (string) \json_encode(['due' => $next]), LOCK_EX);
    }
}
