/* Keep native bindings and delegated click commands; only improve their presentation. */
(() => {
    'use strict';
    const mounted = new WeakSet();
    const mount = dom => {
        if (!dom || mounted.has(dom)) return;
        mounted.add(dom);
        dom.dataset.pwMetadataVersion = '1.7.14';
        let frame;
        const desktop = matchMedia('(min-width: 1200px)');
        const originals = new WeakMap(), attributes = ['title','role','tabindex','aria-label','aria-pressed'];
        const remember = control => {
            if (!originals.has(control)) originals.set(control,attributes.map(name => control.getAttribute(name)));
        };
        const active = () => getComputedStyle(dom).getPropertyValue('--pw-list-metadata-version').trim() === '1.7.14';
        const removeReadButtons = () => dom.querySelectorAll('.pw-read-toggle').forEach(button => button.remove());
        const updateReadButtons = fr => {
            if (!desktop.matches) { removeReadButtons(); return; }
            const list = window.rl?.app?.messageList;
            const listed = typeof list === 'function' ? list() : [];
            dom.querySelectorAll('.messageListItem').forEach(row => {
                const message = ko.dataFor(row);
                let button = row.querySelector(':scope > .pw-read-toggle');
                if (!message?.uid || !message.folder || typeof message.isUnseen !== 'function' || !listed.includes(message)) {
                    button?.remove(); return;
                }
                if (!button) {
                    button = document.createElement('button');
                    button.type = 'button'; button.className = 'pw-read-toggle';
                    row.insertBefore(button, row.firstChild);
                }
                const unread = !!message.isUnseen();
                const label = unread ? (fr ? 'Marquer comme lu' : 'Mark as read')
                    : (fr ? 'Marquer comme non lu' : 'Mark as unread');
                button.dataset.unread = unread ? '1' : '0';
                button.title = label;
                button.setAttribute('aria-label',label);
            });
        };
        const update = () => {
            frame = 0;
            if (!active()) {
                removeReadButtons();
                dom.querySelectorAll('.messageListItem .threads-len,.messageListItem .flagParent').forEach(control => {
                    const values = originals.get(control);
                    if (!values) return;
                    attributes.forEach((name,i) => values[i] === null ? control.removeAttribute(name) : control.setAttribute(name,values[i]));
                    delete control.dataset.pwTotal; delete control.dataset.pwUnread; originals.delete(control);
                });
                return;
            }
            const fr = (document.documentElement.lang || 'fr').startsWith('fr');
            updateReadButtons(fr);
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
        desktop.addEventListener('change',schedule);
        const observer = new MutationObserver(schedule);
        observer.observe(dom,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-unseen']});
        const theme = new MutationObserver(schedule);
        theme.observe(document.documentElement,{attributes:true,attributeFilter:['class','lang','data-theme','data-themes']});
        const themeStyle = document.getElementById('app-theme-style');
        if (themeStyle) theme.observe(themeStyle,{attributes:true,childList:true,characterData:true,subtree:true});
        const readClick = event => {
            const button = event.target instanceof Element && event.target.closest('.pw-read-toggle');
            if (!button || !dom.contains(button)) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (!active() || !desktop.matches) return;
            const row = button.closest('.messageListItem'), message = ko.dataFor(row);
            const list = window.rl?.app?.messageList;
            if (!message?.uid || !message.folder || typeof message.isUnseen !== 'function'
                || typeof list?.setAction !== 'function' || !list()?.includes(message)) return;
            // SnappyMail 2.38.2: MessageSetAction.SetSeen = 0, UnsetSeen = 1.
            // The native method updates the model/folder count and sends MessageSetSeen.
            list.setAction(message.folder,message.isUnseen() ? 0 : 1,[message]);
            schedule();
        };
        dom.addEventListener('click',readClick,true);
        const keyboard = event => {
            if (!active() || !['Enter',' '].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const control = event.target.closest('.messageListItem .pw-read-toggle,.messageListItem .flagParent,.messageListItem .threads-len');
            if (!control || event.target !== control) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (!event.repeat) control.click();
        };
        dom.addEventListener('keydown',keyboard,true); schedule();
        ko.utils.domNodeDisposal.addDisposeCallback(dom,() => {
            observer.disconnect(); theme.disconnect(); desktop.removeEventListener('change',schedule);
            cancelAnimationFrame(frame); removeReadButtons();
            dom.removeEventListener('click',readClick,true); dom.removeEventListener('keydown',keyboard,true);
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
