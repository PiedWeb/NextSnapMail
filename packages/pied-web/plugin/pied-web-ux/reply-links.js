/* Native compose commands with browser links and a one-shot startup intent. */
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
    const commands = {reply:'replyCommand', 'reply-all':'replyAllCommand', forward:'forwardCommand', compose:'composeClick'};
    const messageIntent = location.hash.match(/^(#\/mailbox\/([a-z0-9._-]+)\/m([1-9][0-9]*))\/pw-(reply|reply-all|forward)$/i);
    const composeIntent = location.hash.match(/^(#\/mailbox\/([a-z0-9._-]+))\/pw-compose$/i);
    const intent = messageIntent || composeIntent;
    let pending = intent && {hash:intent[1], uid:messageIntent?.[3], mode:messageIntent?.[4] || 'compose', account:account()};
    let retry = () => {}, accountRows;
    const links = api.replyLinks = {opening:false};
    const enabled = command => typeof command === 'function'
        && (command.canExecute === undefined || !!value(command.canExecute));

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
    addEventListener('hashchange', () => {
        // Native startup may announce the already-normalized route. Only a
        // different destination cancels the intent; the same one can retry.
        if (pending && location.hash !== pending.hash) pending = null;
        else retry();
    });

    const href = (vm, mode) => {
        // A blank composition does not need to load or mark a source message.
        const target = mode === 'compose' ? '/mailbox/' + (findFolder('INBOX')?.fullNameHash || 'INBOX') : route(vm.message?.());
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
            node.dataset.pwComposeMode = accessor().mode;
            const available = () => enabled(accessor().command) && !node.inert && node.getAttribute('aria-disabled') !== 'true';
            node.addEventListener('click', event => {
                if (!available()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
                if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
                    // The existing KO click/command binding cancels every click.
                    // Keep it for plain activation; bypass it for browser links.
                    if (accessor().native) event.stopImmediatePropagation();
                    return;
                }
                if (accessor().native) return;
                event.preventDefault();
                accessor().command.call(vm, vm, event);
            }, !!accessor().native);
            node.addEventListener('auxclick', event => { if (!available()) event.preventDefault(); });
            node.addEventListener('keydown', event => {
                if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault(); node.click();
                }
            });
        },
        update(node, accessor, _all, vm) {
            const {command, mode} = accessor(), available = enabled(command);
            const target = available && href(vm, mode);
            if (target) node.setAttribute('href', target);
            else node.removeAttribute('href');
            node.classList.toggle('disabled', !available);
            node.setAttribute('aria-disabled', String(!available));
            node.tabIndex = available ? 0 : -1;
        }
    };
    const enhanceExisting = (node, vm, command, mode) => {
        if (node.dataset.pwComposeMode || typeof vm[command] !== 'function') return;
        const accessor = () => ({command:vm[command], mode, native:true});
        ko.bindingHandlers.pwReply.init(node, accessor, null, vm);
        ko.computed(() => ko.bindingHandlers.pwReply.update(node, accessor, null, vm), {disposeWhenNodeIsRemoved:node});
    };
    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'SystemDropDown') accountRows = vm.accounts;
        const dom = vm.viewModelDom, reader = vm.viewModelTemplateID === 'MailMessageView';
        if (['MailFolderList','MailMessageList'].includes(vm.viewModelTemplateID)) {
            dom?.querySelectorAll('.buttonCompose').forEach(node => enhanceExisting(node, vm, 'composeClick', 'compose'));
        }
        if (reader) dom?.querySelectorAll('.dropdown-menu a[data-bind]').forEach(node => {
            for (const [mode, command] of Object.entries(commands)) {
                if (mode !== 'compose' && new RegExp('\\bcommand:\\s*' + command + '\\b').test(node.dataset.bind))
                    enhanceExisting(node, vm, command, mode);
            }
        });
        if (!pending || (pending.mode === 'compose' ? vm.viewModelTemplateID !== 'MailMessageList' : !reader)) return;
        const start = () => {
            const message = vm.message?.(), command = vm[commands[pending?.mode]];
            const matches = () => pending && account() === pending.account && location.hash === pending.hash
                // AccountsAndIdentities fills this native account observable,
                // then the identities in the same callback. The microtask below
                // runs after both; constructing Compose earlier throws.
                && value(accountRows)?.length && enabled(command) && (pending.mode === 'compose' || (vm.canBeRepliedOrForwarded?.()
                    && message?.body && String(message.uid) === pending.uid && '#' + route(message) === pending.hash));
            if (!matches()) return;
            queueMicrotask(() => {
                if (!matches() || (pending.mode !== 'compose' && vm.message?.() !== message)) return;
                pending = null;
                links.opening = true;
                try { command.call(vm); }
                finally { links.opening = false; }
            });
        };
        retry = start;
        ko.computed(start, {disposeWhenNodeIsRemoved:dom});
    });
})();
