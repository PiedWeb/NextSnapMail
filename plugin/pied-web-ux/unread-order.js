/* Inbox-only mixed order: unread oldest-first, then read newest-first. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const active = () => document.documentElement.classList.contains('pw-theme');
    const french = () => (document.documentElement.lang || 'fr').startsWith('fr');
    const t = (fr, en) => french() ? fr : en;
    const value = candidate => typeof candidate === 'function' ? candidate() : candidate;
    const isInbox = folder => api.inboxConversations?.isInbox
        ? api.inboxConversations.isInbox(folder) : String(folder || '').toUpperCase() === 'INBOX';
    const account = () => String(window.rl?.settings?.get?.('accountHash') || '');
    const timestamp = message => {
        const stamp = Number(value(message?.dateTimestamp));
        return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
    };
    const unread = message => !!value(message?.isUnseen);
    const compareDate = (left, right, ascending) => {
        const a = timestamp(left), b = timestamp(right);
        if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
        return ascending ? a - b : b - a;
    };

    let enabled = false, ready = false, loading = false, generation = 0;
    let currentAccount = '', listView, button, group, error, sorting = false, frame = 0;
    let messageSubscriptions = [];
    const baseFeed = list => {
        const collection = list?.();
        return active() && isInbox(collection?.folder)
            && !(collection?.search || '').trim() && !list.threadUid?.();
    };
    const disposeMessageSubscriptions = () => {
        messageSubscriptions.forEach(subscription => subscription.dispose?.());
        messageSubscriptions = [];
    };
    const watchMessages = list => {
        disposeMessageSubscriptions();
        (list?.() || []).forEach(message => {
            for (const observable of [message?.isUnseen, message?.dateTimestamp]) {
                if (observable?.subscribe) messageSubscriptions.push(observable.subscribe(schedule));
            }
        });
    };
    const sort = () => {
        frame = 0;
        const list = listView?.messageList, collection = list?.();
        watchMessages(list);
        if (!enabled || !baseFeed(list) || list.loading?.() || !Array.isArray(collection) || collection.length < 2) return;
        const positions = new Map(collection.map((message, index) => [message, index]));
        const ordered = Array.from(collection).sort((left, right) => {
            const leftUnread = unread(left), rightUnread = unread(right);
            if (leftUnread !== rightUnread) return leftUnread ? -1 : 1;
            return compareDate(left, right, leftUnread) || positions.get(left) - positions.get(right);
        });
        if (ordered.every((message, index) => message === collection[index])) return;
        sorting = true;
        ordered.forEach((message, index) => { collection[index] = message; });
        list.valueHasMutated?.();
        sorting = false;
    };
    function schedule() {
        if (!frame) frame = requestAnimationFrame(sort);
    }
    const update = () => {
        if (!button || !listView) return;
        const visible = baseFeed(listView.messageList);
        button.hidden = !visible;
        button.disabled = loading;
        button.setAttribute('aria-busy', String(loading));
        button.setAttribute('aria-pressed', String(enabled));
        button.textContent = t('Non lus : anciens d’abord', 'Unread: oldest first');
        button.title = enabled
            ? t('Rétablir l’ordre natif des messages', 'Restore the native message order')
            : t('Afficher les non-lus du plus ancien au plus récent, puis les lus du plus récent au plus ancien',
                'Show unread messages oldest first, then read messages newest first');
        error.hidden = !visible || !error.textContent;
        const threads = group?.querySelector('.pw-threads');
        if (group) group.hidden = button.hidden && (!threads || threads.hidden);
    };
    const changed = () => {
        update();
        schedule();
        dispatchEvent(new CustomEvent('pw-unread-order-changed', {detail:{enabled}}));
    };
    const request = (params, callback) => {
        if (!window.rl?.pluginRemoteRequest) return callback(new Error('remote'));
        window.rl.pluginRemoteRequest((code, data) => {
            const result = data?.Result;
            if (code || !result || result.error || typeof result.enabled !== 'boolean') callback(new Error('settings'));
            else callback(null, result.enabled);
        }, 'PiedWebUnreadOrder', params, 60000);
    };
    const load = () => {
        const version = ++generation, snapshot = account();
        currentAccount = snapshot; loading = true; error.textContent = ''; update();
        request({}, (failure, state) => {
            if (version !== generation || snapshot !== account()) return;
            loading = false;
            if (failure) {
                ready = false;
                error.textContent = t('Ordre des non-lus indisponible. Réessayez.', 'Unread order unavailable. Try again.');
            } else {
                ready = true; enabled = state;
            }
            changed();
        });
    };
    const save = state => {
        const version = ++generation, snapshot = account();
        loading = true; error.textContent = ''; update();
        request({enabled:state ? 1 : 0}, (failure, saved) => {
            if (version !== generation || snapshot !== account()) return;
            loading = false;
            if (failure) {
                error.textContent = t('Impossible d’enregistrer l’ordre des non-lus. Réessayez.', 'Could not save the unread order. Try again.');
            } else {
                ready = true; enabled = saved;
                if (!enabled) listView?.reload?.();
            }
            changed();
        });
    };
    api.unreadOrder = {
        enabled: () => enabled,
        ready: () => ready,
        apply: schedule
    };

    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID !== 'MailMessageList' || vm.pwUnreadOrder) return;
        const dom = vm.viewModelDom, threads = dom?.querySelector('.pw-threads');
        const toolbar = dom?.querySelector(':scope > .btn-toolbar');
        if (!dom || !toolbar || !threads) return;
        vm.pwUnreadOrder = true; listView = vm;
        group = document.createElement('div'); group.className = 'btn-group pw-feed-settings onCheckedHide';
        button = document.createElement('button'); button.type = 'button';
        button.className = 'btn pw-unread-order';
        error = document.createElement('span'); error.className = 'pw-unread-order-error';
        error.setAttribute('role', 'alert'); error.hidden = true;
        threads.before(group); group.append(button, threads); group.after(error);
        button.addEventListener('click', () => ready ? save(!enabled) : load());

        const onList = () => {
            if (sorting) return;
            if (account() !== currentAccount) load();
            else { update(); schedule(); }
        };
        const subscriptions = [vm.messageList, vm.messageList.loading, vm.messageList.page, vm.messageList.threadUid]
            .filter(observable => observable?.subscribe).map(observable => observable.subscribe(onList));
        const theme = new MutationObserver(() => { update(); schedule(); });
        theme.observe(document.documentElement, {attributes:true, attributeFilter:['class']});
        ko.utils.domNodeDisposal.addDisposeCallback(dom, () => {
            ++generation; cancelAnimationFrame(frame); frame = 0; theme.disconnect();
            disposeMessageSubscriptions(); subscriptions.forEach(subscription => subscription.dispose());
        });
        update(); load();
    });
})();
