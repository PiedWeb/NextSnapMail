<?php
declare(strict_types=1);

namespace OCA\PiedWebMailScheduler\Service;

use OCP\IConfig;
use OCP\IUserManager;

/* The mailboxes this server can open without a browser: the ones whose owner asked
 * NextSnapMail to remember the password. Nothing new is stored here, and a mailbox that
 * is not already remembered is simply not served. */
final class Mailboxes {
    public function __construct(private IConfig $config, private IUserManager $users) {}

    /** @return array<string, array{uid:string,email:string,password:\SnappyMail\SensitiveString}> */
    public function all(): array {
        if (!\class_exists(\OCA\NextSnapMail\Util\SnappyMailHelper::class)) {
            throw new \RuntimeException('NextSnapMail is not installed on this server');
        }
        // Loads the mail application, its constants and its own credential helper.
        \OCA\NextSnapMail\Util\SnappyMailHelper::loadApp();
        $found = [];
        $this->users->callForSeenUsers(function ($user) use (&$found) {
            $uid = $user->getUID();
            $email = \trim((string) $this->config->getUserValue($uid, 'nextsnapmail', 'nextsnapmail-email'));
            $stored = (string) ($this->config->getUserValue($uid, 'nextsnapmail', 'passphrase')
                ?: $this->config->getUserValue($uid, 'nextsnapmail', 'nextsnapmail-password'));
            if ($email === '' || $stored === '') return;
            // Two Nextcloud users can hold the same mailbox. Opening it twice in one run would
            // let two senders claim the same message.
            $key = \strtolower($email);
            if (isset($found[$key])) return;
            $password = \OCA\NextSnapMail\Util\SnappyMailHelper::decodePassword($stored, \md5($email));
            if (!$password) return;
            $found[$key] = ['uid' => $uid, 'email' => $email, 'password' => $password];
        });
        return $found;
    }
}
