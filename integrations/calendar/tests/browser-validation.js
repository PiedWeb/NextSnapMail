// Run with: dev-browser --connect < integrations/calendar/tests/browser-validation.js
// Uses an owned tab; does not create/edit events or change account preferences.
const p = await browser.getPage('calendar-shell-check');
await p.bringToFront();
const results = [];
function check(name, ok, evidence) {
    results.push({ name, ok: !!ok, evidence });
    if (!ok) throw new Error(name + ': ' + JSON.stringify(evidence));
}
async function geometry() {
    return await p.evaluate(() => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
        return {
            version: window.PiedWebCalendarWorkspace?.version,
            header: rect('#header'), content: rect('#content-vue'),
            grid: rect('.fc-col-header'), calendar: rect('.calendar-wrapper'),
            launcher: rect('.app-menu__waffle'), filter: rect('.app-navigation-header__filter input'),
            closed: document.documentElement.classList.contains('pw-calendar-navigation-closed'),
            scrollWidth: document.documentElement.scrollWidth, width: innerWidth, height: innerHeight,
            drawerBackground: getComputedStyle(document.querySelector('#content-vue > .app-navigation')).backgroundColor,
            buttonColor: getComputedStyle(document.querySelector('.app-menu__waffle')).color,
            buttonHit: document.elementFromPoint(30, 30)?.closest('button')?.classList.contains('app-menu__waffle'),
        };
    });
}
async function menu(name) {
    await p.locator('.app-menu__waffle').focus();
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => [...document.querySelectorAll('.app-menu__popover-base')].some(e => getComputedStyle(e).opacity === '1'), {}, { timeout: 5000 });
    const native = await p.evaluate(() => {
        const links = [...document.querySelectorAll('.app-menu__grid a')];
        const popup = document.querySelector('.app-menu__popover-base').getBoundingClientRect();
        return { count: links.length, files: links.some(a => a.pathname.startsWith('/apps/files')), expanded: document.querySelector('.app-menu__waffle').getAttribute('aria-expanded'), fits: popup.left >= -1 && popup.right <= innerWidth + 1 };
    });
    check(name + ' native menu opens with Enter', native.count > 5 && native.files && native.expanded === 'true' && native.fits, native);
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.querySelector('.app-menu__waffle').getAttribute('aria-expanded') === 'false', {}, { timeout: 5000 });
    await p.waitForFunction(() => document.activeElement === document.querySelector('.app-menu__waffle'), {}, { timeout: 3000 });
    check(name + ' Escape restores launcher focus', await p.locator('.app-menu__waffle').evaluate(e => e === document.activeElement));
}
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto('https://nc.robin-d.fr/apps/calendar/dayGridMonth/now', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.PiedWebCalendarWorkspace?.version === '1.0.1' && document.querySelector('.fc-col-header'), {}, { timeout: 15000 });
await p.waitForFunction(() => document.querySelector('.fc-col-header').getBoundingClientRect().width > 1000, {}, { timeout: 5000 });
const desktop = await geometry();
check('Installed web version', desktop.version === '1.0.1', desktop.version);
check('Desktop full viewport, no surrounding frame', desktop.content.x === 0 && desktop.content.y === 0 && desktop.content.width === 1440 && desktop.content.height === 900 && desktop.header.height === 0, desktop.content);
check('Grid immediately before filter, centered and clickable', desktop.buttonHit && desktop.launcher.right <= desktop.filter.left && Math.abs((desktop.launcher.y + 22) - (desktop.filter.y + desktop.filter.height / 2)) < 1, { launcher: desktop.launcher, filter: desktop.filter });
await menu('Desktop');
await p.locator('button.app-navigation-toggle').click();
await p.waitForFunction(() => document.documentElement.classList.contains('pw-calendar-navigation-closed'));
check('Collapsed desktop retains native drawer access', await p.locator('button.app-navigation-toggle').isVisible() && await p.locator('.app-menu__waffle').evaluate(e => !!e.closest('[inert]')));
await p.locator('button.app-navigation-toggle').click();
await p.waitForFunction(() => !document.documentElement.classList.contains('pw-calendar-navigation-closed'));
for (const width of [390, 320]) {
    await p.setViewportSize({ width, height: 844 });
    if (!await p.evaluate(() => document.documentElement.classList.contains('pw-calendar-navigation-closed'))) await p.locator('button.app-navigation-toggle').click();
    await p.waitForFunction(() => document.documentElement.classList.contains('pw-calendar-navigation-closed') && document.querySelector('.fc-col-header').getBoundingClientRect().width <= innerWidth, {}, { timeout: 5000 });
    const closed = await geometry();
    check(width + 'px full viewport, responsive grid, no extra toolbar', closed.content.x === 0 && closed.content.y === 0 && closed.content.height === 844 && closed.scrollWidth === width && closed.grid.width <= width && closed.header.height === 0, { content: closed.content, grid: closed.grid, scrollWidth: closed.scrollWidth });
    await p.locator('button.app-navigation-toggle').click();
    await p.waitForFunction(() => !document.documentElement.classList.contains('pw-calendar-navigation-closed') && Math.abs(document.querySelector('#content-vue > .app-navigation').getBoundingClientRect().left) < 1, {}, { timeout: 5000 });
    const open = await geometry();
    check(width + 'px drawer keeps grid beside filter on opaque background', open.buttonHit && open.filter.left >= open.launcher.right && open.filter.right <= width && !['rgba(0, 0, 0, 0)', 'transparent'].includes(open.drawerBackground), { launcher: open.launcher, filter: open.filter, background: open.drawerBackground });
    await menu(width + 'px');
}
console.log(JSON.stringify(results, null, 2));
console.log(await writeFile('calendar-shell-validation.json', JSON.stringify(results, null, 2)));
