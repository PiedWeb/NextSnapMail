<?php
declare(strict_types=1);

namespace OCA\PiedWebMailScheduler\BackgroundJob;

use OCA\PiedWebMailScheduler\Service\Runner;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

/* Nextcloud's own cron carries scheduled sends and reminders in one mailbox pass.
 * A mailbox that needs the minute it was promised gets the occ command on its own line
 * in crontab; the two use the same pass and the same claim, so they cannot collide. */
final class SendDueJob extends TimedJob {
    public function __construct(
        ITimeFactory $time,
        private Runner $runner,
        private LoggerInterface $logger,
    ) {
        parent::__construct($time);
        $this->setInterval(60);
        $this->setTimeSensitivity(self::TIME_SENSITIVE);
    }

    protected function run($argument): void
    {
        try {
            $this->runner->run($this->time->getTime());
        } catch (\Throwable $error) {
            $this->logger->warning('Mail scheduler pass failed', ['exception' => $error]);
        }
    }
}
