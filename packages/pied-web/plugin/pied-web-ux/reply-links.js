/* Native reader commands with browser links and a one-shot reply intent. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const account = () => String(window.rl?.settings?.get?.('accountHash') || '');
    const value = candidate => typeof candidate === 'function' ? candidate() : candidate;
    const findFolder = (name, folders = value(window.rl?.app?.folderList) || []) => {
        for (const folder of folders) {
            if (folder.fullName === name) return folder;
            const child = findFolder(name, value(folder.subFolders) || []);
            if (child) return child;
        }
        return null;
    };
    const route = message => {
        const folder = message && findFolder(message.folder);
        return folder && /^[1-9][0-9]*$/.test(String(message.uid))
            ? '/mailbox/' + folder.fullNameHash + '/m' + message.uid : '';
    };
    const intent = location.hash.match(/^(#\/mailbox\/([a-z0-9.~_-]+)\/m([1-9][0-9]*))\/pw-(reply|reply-all)$/i);
    let pending = intent && {hash:intent[1], uid:intent[3], mode:intent[4], account:account()};
    const links = api.replyLinks = {opening:false};

    // Strip the intent before the native router starts. Reloading a draft must
    // never open another composer, including through Nextcloud's iframe target.
    if (intent) {
        history.replaceState(history.state, '', location.pathname + location.search + intent[1]);
        if (parent !== window) {
            const outer = new URL(parent.location.href);
            outer.searchParams.set('target', intent[1].slice(1));
            outer.hash = intent[1];
            parent.history.replaceState(parent.history.state, '', outer.href);
        }
    }
    addEventListener('hashchange', () => { pending = null; });

    const href = (vm, mode) => {
        const target = route(vm.message?.());
        if (!target || !account()) return null;
        const embedded = parent !== window;
        const url = new URL(embedded ? parent.location.href : location.href);
        if (embedded) url.search = '';
        url.searchParams.set('account', account());
        url.hash = '#' + target + '/pw-' + mode;
        if (embedded) url.searchParams.set('target', url.hash.slice(1));
        return url.href;
    };
    ko.bindingHandlers.pwReply = {
        init(node, accessor, _all, vm) {
            const enabled = () => !!value(accessor().command.canExecute) && node.getAttribute('aria-disabled') !== 'true';
            node.addEventListener('click', event => {
                if (!enabled()) { event.preventDefault(); return; }
                if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                accessor().command.call(vm, vm, event);
            });
            node.addEventListener('auxclick', event => { if (!enabled()) event.preventDefault(); });
            node.addEventListener('keydown', event => {
                if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault(); node.click();
                }
            });
        },
        update(node, accessor, _all, vm) {
            const {command, mode} = accessor(), enabled = !!value(command.canExecute);
            const target = enabled && href(vm, mode);
            if (target) node.setAttribute('href', target);
            else node.removeAttribute('href');
            node.classList.toggle('disabled', !enabled);
            node.setAttribute('aria-disabled', String(!enabled));
            node.tabIndex = enabled ? 0 : -1;
        }
    };
    addEventListener('rl-view-model', ({detail:vm}) => {
        if (!pending || vm.viewModelTemplateID !== 'MailMessageView') return;
        ko.computed(() => {
            const message = vm.message?.(), command = pending?.mode === 'reply-all' ? vm.replyAllCommand : vm.replyCommand;
            if (!pending || !vm.canBeRepliedOrForwarded?.() || !value(command?.canExecute)
                || !message?.body || String(message.uid) !== pending.uid
                || '#' + route(message) !== pending.hash || account() !== pending.account) return;
            queueMicrotask(() => {
                if (!pending || vm.message?.() !== message || !value(command.canExecute)) return;
                pending = null;
                links.opening = true;
                try { command.call(vm); }
                finally { links.opening = false; }
            });
        });
    });
})();
