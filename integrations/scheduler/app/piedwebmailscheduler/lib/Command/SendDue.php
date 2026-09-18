<?php
declare(strict_types=1);

namespace OCA\PiedWebMailScheduler\Command;

use OCA\PiedWebMailScheduler\Service\Runner;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

final class SendDue extends Command {
    public function __construct(private Runner $runner) { parent::__construct(); }

    protected function configure(): void
    {
        $this->setName('piedweb:mail:send-scheduled')
            ->setDescription('Send due scheduled messages and wake due mail reminders')
            ->addOption('force', null, InputOption::VALUE_NONE, 'Open every mailbox, ignoring the poll interval')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Report what is due without changing mail')
            ->addOption('mailbox', null, InputOption::VALUE_REQUIRED, 'Only this mail address', '');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $results = $this->runner->run(\time(), (bool) $input->getOption('force'),
            (bool) $input->getOption('dry-run'), (string) $input->getOption('mailbox'));
        $failed = false;
        foreach ($results as $email => $report) {
            if (isset($report['skipped'])) {
                $output->writeln("<comment>{$email}</comment>: not due for a poll", OutputInterface::VERBOSITY_VERBOSE);
                continue;
            }
            if (isset($report['error'])) {
                $failed = true;
                $output->writeln("<error>{$email}</error>: " . $report['error']);
                continue;
            }
            $next = $report['next'] ? \date('c', $report['next']) : 'none';
            $output->writeln("<info>{$email}</info>: sent {$report['sent']}, pending {$report['pending']}, "
                . "held {$report['held']}, abandoned {$report['failed']}, reminders {$report['reminded']}, "
                . "reminder pending {$report['reminderPending']}, next {$next}");
            foreach ($report['notes'] as $note) $output->writeln('  ' . $note);
            $failed = $failed || $report['failed'] > 0;
        }
        return $failed ? 1 : 0;
    }
}
