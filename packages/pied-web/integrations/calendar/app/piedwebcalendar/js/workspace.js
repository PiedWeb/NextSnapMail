/* SPDX-License-Identifier: AGPL-3.0-or-later */
(() => {
    'use strict';
    if (window.PiedWebCalendarWorkspace) return;
    const classes = ['pw-calendar-workspace', 'pw-calendar-navigation-closed'];
    let frame = 0;
    let navigation = null;
    let active = false;
    let menu = null;
    let origin = null;
    const root = document.documentElement;
    const navigationObserver = new MutationObserver(schedule);
    const treeObserver = new MutationObserver(schedule);
    const themeObserver = new MutationObserver(schedule);
    const preference = window.matchMedia('(prefers-color-scheme: dark)');

    function sync() {
        frame = 0;
        const content = document.querySelector('#content-vue.app-calendar');
        const nav = content?.querySelector('.app-navigation');
        const filter = nav?.querySelector('.app-navigation-header__filter input[type="search"]');
        const header = document.querySelector('#header');
        const launcher = (menu || header)?.querySelector('.app-menu__waffle');
        // Leave standard Nextcloud navigation intact if upstream markup changes.
        const next = !!(content && nav && filter && header && launcher);
        if (next) {
            if (!menu) {
                menu = launcher.closest('.app-menu');
                origin = document.createComment('Pied Web Calendar app-menu origin');
                menu.before(origin);
                menu.classList.add('pw-calendar-app-menu');
            }
            const slot = filter.closest('.app-navigation-header__filter');
            // Calendar's mobile drawer traps focus. Keep the actual native menu
            // inside that trap, retaining its Vue instance, bindings and popover.
            if (menu.parentElement !== slot) slot.prepend(menu);
        } else restoreMenu();
        if (next !== active) {
            active = next;
            root.classList.toggle(classes[0], active);
            // FullCalendar needs to recalculate its viewport after shell removal.
            window.dispatchEvent(new Event('resize'));
        }
        root.classList.toggle(classes[1], active && nav.classList.contains('app-navigation--closed'));
        if (nav !== navigation) {
            navigationObserver.disconnect();
            navigation = nav;
            if (nav) navigationObserver.observe(nav, { attributes: true, attributeFilter: ['class'] });
        }
        if (active) {
            // Nextcloud's header has white foreground tokens even in light mode.
            const theme = getComputedStyle(document.body);
            for (const [name, token] of Object.entries({ ink: '--color-main-text', hover: '--color-background-hover', focus: '--color-primary-element' })) {
                menu.style.setProperty(`--pw-calendar-${name}`, theme.getPropertyValue(token));
            }
        }
    }
    function restoreMenu() {
        if (!menu) return;
        if (origin?.parentNode) origin.replaceWith(menu);
        menu.classList.remove('pw-calendar-app-menu');
        for (const name of ['ink', 'hover', 'focus']) menu.style.removeProperty(`--pw-calendar-${name}`);
        menu = null;
        origin = null;
    }
    function schedule() {
        if (!frame) frame = requestAnimationFrame(sync);
    }
    function start() {
        treeObserver.observe(document.body, { childList: true, subtree: true });
        themeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-themes'] });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-themes'] });
        sync();
    }
    function stop() {
        treeObserver.disconnect();
        themeObserver.disconnect();
        navigationObserver.disconnect();
        cancelAnimationFrame(frame);
        frame = 0;
        navigation = null;
        active = false;
        restoreMenu();
        root.classList.remove(...classes);
    }
    window.PiedWebCalendarWorkspace = { version: '1.0.1', sync };
    preference.addEventListener('change', schedule);
    window.addEventListener('pageshow', start);
    window.addEventListener('pagehide', stop);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
