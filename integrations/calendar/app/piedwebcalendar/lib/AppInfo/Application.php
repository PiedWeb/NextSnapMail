<?php
declare(strict_types=1);

namespace OCA\PiedWebCalendar\AppInfo;

use OCA\PiedWebCalendar\Listeners\WorkspaceListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;

final class Application extends App implements IBootstrap {
    public function __construct() { parent::__construct('piedwebcalendar'); }
    public function register(IRegistrationContext $context): void {
        $context->registerEventListener(BeforeTemplateRenderedEvent::class, WorkspaceListener::class);
    }
    public function boot(IBootContext $context): void {}
}
