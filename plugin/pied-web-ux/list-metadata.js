/* Keep native bindings and delegated click commands; only improve their presentation. */
(() => {
    'use strict';
    const mounted = new WeakSet();
    const mount = dom => {
        if (!dom || mounted.has(dom)) return;
        mounted.add(dom);
        dom.dataset.pwMetadataVersion = '1.7.2';
        let frame;
        const originals = new WeakMap(), attributes = ['title','role','tabindex','aria-label','aria-pressed'];
        const remember = control => {
            if (!originals.has(control)) originals.set(control,attributes.map(name => control.getAttribute(name)));
        };
        const active = () => getComputedStyle(dom).getPropertyValue('--pw-list-metadata-version').trim() === '1.7.2';
        const update = () => {
            frame = 0;
            if (!active()) {
                dom.querySelectorAll('.messageListItem .threads-len,.messageListItem .flagParent').forEach(control => {
                    const values = originals.get(control);
                    if (!values) return;
                    attributes.forEach((name,i) => values[i] === null ? control.removeAttribute(name) : control.setAttribute(name,values[i]));
                    delete control.dataset.pwTotal; delete control.dataset.pwUnread; originals.delete(control);
                });
                return;
            }
            const fr = (document.documentElement.lang || 'fr').startsWith('fr');
            dom.querySelectorAll('.messageListItem .threads-len').forEach(control => {
                // KO owns textContent. Read its native total/unread format without replacing children.
                const match = control.textContent.trim().match(/^(\d+)(?:\/(\d+))?$/);
                if (!match) return;
                remember(control);
                const total = Number(match[1]), unread = Number(control.dataset.unseen) || 0;
                control.dataset.pwTotal = total;
                control.dataset.pwUnread = unread ? (fr ? unread + ' non lu' + (unread > 1 ? 's' : '') : unread + ' unread') : '';
                control.title = fr ? `Ouvrir la conversation : ${total} messages${unread ? ', dont ' + unread + ' non lu' + (unread > 1 ? 's' : '') : ''}`
                    : `Open conversation: ${total} messages${unread ? ', ' + unread + ' unread' : ''}`;
                control.setAttribute('aria-label',control.title);
                control.setAttribute('role','button'); control.tabIndex = 0;
            });
            dom.querySelectorAll('.messageListItem .flagParent').forEach(control => {
                remember(control);
                const row = control.closest('.messageListItem'), flagged = row.classList.contains('msgflag-\\flagged');
                control.title = flagged ? (fr ? 'Retirer le suivi' : 'Remove star') : (fr ? 'Suivre ce message' : 'Star message');
                if (!flagged && row.classList.contains('hasFlaggedSubMessage')) control.title += fr ? ' (un message de la conversation est déjà suivi)' : ' (a message in this conversation is already starred)';
                control.setAttribute('aria-label',control.title); control.setAttribute('aria-pressed',String(flagged));
                control.setAttribute('role','button'); control.tabIndex = 0;
            });
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
        const observer = new MutationObserver(schedule);
        observer.observe(dom,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-unseen']});
        const theme = new MutationObserver(schedule);
        theme.observe(document.documentElement,{attributes:true,attributeFilter:['class','lang','data-theme','data-themes']});
        const themeStyle = document.getElementById('app-theme-style');
        if (themeStyle) theme.observe(themeStyle,{attributes:true,childList:true,characterData:true,subtree:true});
        const keyboard = event => {
            if (!active() || !['Enter',' '].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const control = event.target.closest('.messageListItem .flagParent,.messageListItem .threads-len');
            if (!control || event.target !== control) return;
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat) control.click();
        };
        dom.addEventListener('keydown',keyboard,true); schedule();
        ko.utils.domNodeDisposal.addDisposeCallback(dom,() => {
            observer.disconnect(); theme.disconnect(); cancelAnimationFrame(frame); dom.removeEventListener('keydown',keyboard,true);
        });
    };
    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'MailMessageList') mount(vm.viewModelDom);
    });
    // Also mount when the plugin is loaded after the native view event.
    const discover = () => mount(document.getElementById('V-MailMessageList'));
    if (document.getElementById('V-MailMessageList')) discover();
    else {
        const discovery = new MutationObserver(() => {
            if (document.getElementById('V-MailMessageList')) { discover(); discovery.disconnect(); }
        });
        discovery.observe(document.documentElement,{childList:true,subtree:true});
    }
})();
