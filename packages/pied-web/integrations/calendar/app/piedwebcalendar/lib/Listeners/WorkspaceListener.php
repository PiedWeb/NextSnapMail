<?php
declare(strict_types=1);

namespace OCA\PiedWebCalendar\Listeners;

use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

final class WorkspaceListener implements IEventListener {
    public function handle(Event $event): void {
        if (!$event instanceof BeforeTemplateRenderedEvent || !$event->isLoggedIn()) { return; }
        if ($event->getResponse()->getApp() !== 'calendar') { return; }
        Util::addStyle('piedwebcalendar', 'workspace');
        Util::addScript('piedwebcalendar', 'workspace');
    }
}
