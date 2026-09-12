/* Keep Nextcloud's real app launcher and its Vue/keyboard behavior; remove the surrounding chrome. */
(() => {
    'use strict';
    let host;
    try {
        host = parent === window ? document : parent.document;
        if (host !== document && host.getElementById('rliframe')?.contentWindow !== window) return;
    } catch { return; }
    const header = host.getElementById('header');
    if (!header || !host.querySelector('#content.app-nextsnapmail')) return;
    const style = host.createElement('style'); style.id = 'pied-web-integration-style';
    style.textContent = `
body.pw-mail-shell {--header-height:0px;--body-container-margin:0px;}
body.pw-mail-shell #content.app-nextsnapmail {margin:0!important;width:100%!important;height:100dvh!important;border-radius:0!important;max-height:none;}
body.pw-mail-shell #content.app-nextsnapmail #rliframe {display:block;height:100%!important;width:100%;border:0;}
body.pw-mail-shell #header {position:fixed!important;z-index:2000!important;inset:0 auto auto 0!important;width:0!important;height:0!important;min-height:0!important;padding:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important;pointer-events:none;}
body.pw-mail-shell #header :is(#nextcloud,.header-end,.app-menu__current-app) {display:none!important;}
body.pw-mail-shell #header .header-start {margin:0!important;padding:0!important;}
body.pw-mail-shell #header .app-menu {position:fixed!important;inset:6px auto auto 8px!important;display:flex!important;width:44px!important;min-width:44px!important;max-width:44px!important;height:44px!important;margin:0!important;padding:0!important;pointer-events:auto;color:var(--pw-shell-ink);}
body.pw-mail-shell #header .app-menu__waffle {width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;padding:0!important;border:0!important;border-radius:6px!important;color:var(--pw-shell-ink)!important;background:transparent;}
body.pw-mail-shell #header .app-menu__waffle:is(:hover,[aria-expanded="true"]) {background:var(--pw-shell-hover)!important;}
body.pw-mail-shell #header .app-menu__waffle:focus-visible {outline:2px solid var(--pw-shell-focus)!important;outline-offset:-2px;}
body.pw-mail-shell #header .app-menu__waffle svg {width:22px;height:22px;}
@media(max-width:799px){body.pw-mail-shell #header .app-menu {top:10px!important;}}
`;
    // An earlier iframe-only integration can exist during a live upgrade.
    host.getElementById(style.id)?.remove(); host.head.append(style);
    let frame = 0;
    const sync = () => {
        frame = 0;
        const active = document.documentElement.classList.contains('pw-theme')
            && !!host.querySelector('#content.app-nextsnapmail') && !!header.querySelector('.app-menu__waffle')
            && !!document.getElementById('V-MailFolderList');
        host.body.classList.toggle('pw-mail-shell',active);
        if (document.documentElement.classList.contains('pw-mail-shell') !== active) {
            document.documentElement.classList.toggle('pw-mail-shell',active);
            dispatchEvent(new Event('resize')); // Existing account/search layout follows the new available space.
        }
        if (active) {
            const colors = getComputedStyle(document.getElementById('rl-app'));
            header.style.setProperty('--pw-shell-ink',colors.getPropertyValue('--nc-color-main-text'));
            header.style.setProperty('--pw-shell-hover',colors.getPropertyValue('--pw-selected'));
            header.style.setProperty('--pw-shell-focus',colors.getPropertyValue('--nc-color-primary-element'));
        } else ['--pw-shell-ink','--pw-shell-hover','--pw-shell-focus'].forEach(key=>header.style.removeProperty(key));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    const observer = new MutationObserver(schedule);
    const watch = () => {
        observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','data-themes']});
        observer.observe(header,{childList:true,subtree:true});
        observer.observe(host.querySelector('#content.app-nextsnapmail').parentElement,{childList:true});
        const themeStyle = document.getElementById('app-theme-style');
        if (themeStyle) observer.observe(themeStyle,{attributes:true,childList:true,subtree:true,characterData:true});
    };
    watch();
    addEventListener('rl-view-model',schedule);
    const dark = matchMedia('(prefers-color-scheme:dark)'); dark.addEventListener('change',schedule);
    addEventListener('pagehide',()=>{
        observer.disconnect(); cancelAnimationFrame(frame); dark.removeEventListener('change',schedule);
        host.body.classList.remove('pw-mail-shell'); style.remove();
        ['--pw-shell-ink','--pw-shell-hover','--pw-shell-focus'].forEach(key=>header.style.removeProperty(key));
    });
    addEventListener('pageshow',event=>{
        if (event.persisted) { host.head.append(style); watch(); dark.addEventListener('change',schedule); schedule(); }
    });
    schedule();
})();
