/* Inbox-only mixed order: unread roots, unread conversations, then read rows. */
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
    const unreadRank = message => {
        if (value(message?.isUnseen)) return 2;
        const thread = value(message?.threadUnseen);
        return Array.isArray(thread) && thread.length > 0 ? 1 : 0;
    };
    const messageKey = message => {
        const folder = String(value(message?.folder) || ''), uid = value(message?.uid);
        if (folder && uid !== undefined && uid !== null && uid !== '') return folder + '\u0000' + uid;
        return String(value(message?.hash) || '');
    };
    const compareDate = (left, right, ascending) => {
        const a = timestamp(left), b = timestamp(right);
        if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
        return ascending ? a - b : b - a;
    };

    let enabled = false, behavior = 1, ready = false, loading = false, generation = 0;
    let currentAccount = '', listView, button, group, error, sorting = false, frame = 0, pendingAnchor = null;
    let settingsSelect, settingsStatus, messageSubscriptions = [], readerSubscription;
    let activeMessageKey = '', heldMessageKey = '', heldIndex = -1, listScope = '';
    let injectedScope = '', injectedUnread = new Set(), receivedGlobal = false;

    const rawRows = collection => collection?.['@Collection'];
    const rawKey = (message, folder) => String(message?.folder || folder || '') + '\u0000' + String(message?.uid || '');
    const responseScope = result => {
        const folder = result?.folder;
        return JSON.stringify([
            account(), folder?.name || '', folder?.etag || '', folder?.uidValidity || '',
            folder?.uidNext || '', folder?.unreadEmails ?? '', null !== result?.totalThreads
        ]);
    };
    const clearInjected = () => {
        injectedScope = ''; injectedUnread = new Set(); receivedGlobal = false;
    };
    const mergeUnreadResponse = data => {
        const result = data?.Result, folder = result?.folder, rows = rawRows(result);
        if (!active() || !result || !Array.isArray(rows) || !isInbox(folder?.name)
            || (result.search || '').trim() || Number(result.threadUid || 0)) return;
        const offset = Number(result.offset || 0), extra = rawRows(data?.PiedWebUnreadOrder);
        if (!offset) {
            clearInjected();
            if (!Array.isArray(extra)) return;
            const keys = new Set(extra.map(message => rawKey(message, folder.name)));
            result['@Collection'] = [...extra, ...rows.filter(message => !keys.has(rawKey(message, folder.name)))];
            injectedUnread = keys;
            injectedScope = responseScope(result);
            receivedGlobal = true;
        } else if (injectedUnread.size && injectedScope === responseScope(result)) {
            result['@Collection'] = rows.filter(message => !injectedUnread.has(rawKey(message, folder.name)));
        }
    };

    // Read the optional collection before SnappyMail revives the native response.
    // Both collections came from the same MessageList request and become the same
    // native MessageModel objects used by selection, flags, moves and the reader.
    const remote = window.rl?.app?.Remote;
    if (remote?.request && !remote.pwUnreadOrder) {
        const nativeRequest = remote.request;
        remote.request = function(action, callback, params, timeout, path) {
            const wrapped = action === 'MessageList' && typeof callback === 'function'
                ? function(...args) {
                    if (!args[0]) mergeUnreadResponse(args[1]);
                    return callback.apply(this, args);
                } : callback;
            return nativeRequest.call(this, action, wrapped, params, timeout, path);
        };
        remote.pwUnreadOrder = true;
    }

    const baseFeed = list => {
        const collection = list?.();
        return active() && isInbox(collection?.folder)
            && !(collection?.search || '').trim() && !list.threadUid?.();
    };
    const scope = list => {
        const collection = list?.();
        return JSON.stringify([
            account(), String(collection?.folder || ''), Number(list?.page?.() || 1),
            String(collection?.search || ''), Number(list?.threadUid?.() || 0)
        ]);
    };
    const clearHeld = () => { heldMessageKey = ''; heldIndex = -1; };
    const disposeMessageSubscriptions = () => {
        messageSubscriptions.forEach(subscription => subscription.dispose?.());
        messageSubscriptions = [];
    };
    const rowFor = key => key && listView?.viewModelDom
        ? [...listView.viewModelDom.querySelectorAll('.messageListItem')]
            .find(row => messageKey(ko.dataFor(row)) === key)
        : null;
    const captureAnchor = key => {
        const row = rowFor(key), scroller = listView?.viewModelDom?.querySelector('.messageList > .b-content');
        return row && scroller ? {key, top:row.getBoundingClientRect().top, scroller, scope:listScope} : null;
    };
    const restoreAnchor = anchor => {
        if (!anchor || anchor.scope !== listScope) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const row = rowFor(anchor.key);
                if (row && anchor.scroller.isConnected && anchor.scope === listScope) {
                    anchor.scroller.scrollTo({
                        top:anchor.scroller.scrollTop + row.getBoundingClientRect().top - anchor.top,
                        behavior:'instant'
                    });
                }
            });
        });
    };
    const watchMessages = list => {
        disposeMessageSubscriptions();
        (list?.() || []).forEach(message => {
            const unreadChanged = () => {
                if (behavior === 1) return;
                const key = messageKey(message);
                if (key && key === activeMessageKey) {
                    heldMessageKey = key;
                    heldIndex = (list?.() || []).indexOf(message);
                }
                schedule();
            };
            if (message?.isUnseen?.subscribe) {
                messageSubscriptions.push(message.isUnseen.subscribe(unreadChanged));
            }
            if (message?.threadUnseen?.subscribe) {
                messageSubscriptions.push(message.threadUnseen.subscribe(unreadChanged));
            }
            if (message?.dateTimestamp?.subscribe) {
                messageSubscriptions.push(message.dateTimestamp.subscribe(() => schedule()));
            }
        });
    };
    const orderedMessages = collection => {
        const positions = new Map(collection.map((message, index) => [message, index]));
        const pinned = behavior === 2 && heldMessageKey
            ? collection.find(message => messageKey(message) === heldMessageKey) : null;
        const ordered = collection.filter(message => message !== pinned).sort((left, right) => {
            const leftRank = unreadRank(left), rightRank = unreadRank(right);
            if (leftRank !== rightRank) return rightRank - leftRank;
            return compareDate(left, right, leftRank > 0) || positions.get(left) - positions.get(right);
        });
        if (pinned) ordered.splice(Math.max(0, Math.min(heldIndex, ordered.length)), 0, pinned);
        return ordered;
    };
    const sort = () => {
        frame = 0;
        const anchor = pendingAnchor;
        pendingAnchor = null;
        const list = listView?.messageList, collection = list?.();
        watchMessages(list);
        if (!enabled || !baseFeed(list) || list.loading?.() || !Array.isArray(collection) || collection.length < 2) return;
        const ordered = orderedMessages(Array.from(collection));
        if (ordered.every((message, index) => message === collection[index])) return;
        sorting = true;
        ordered.forEach((message, index) => { collection[index] = message; });
        list.valueHasMutated?.();
        sorting = false;
        restoreAnchor(anchor);
    };
    function schedule() {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(sort);
    }
    const setActiveMessage = message => {
        const next = messageKey(message);
        if (heldMessageKey && next !== heldMessageKey) {
            pendingAnchor = captureAnchor(next);
            clearHeld();
            schedule();
        }
        activeMessageKey = next;
    };

    const updateSettings = () => {
        if (!settingsSelect?.isConnected) return;
        settingsSelect.value = String(behavior);
        settingsSelect.disabled = loading;
        settingsSelect.setAttribute('aria-busy', String(loading));
    };
    const update = () => {
        updateSettings();
        if (!button || !listView) return;
        const visible = baseFeed(listView.messageList);
        button.hidden = !visible;
        button.disabled = loading;
        button.setAttribute('aria-busy', String(loading));
        button.setAttribute('aria-pressed', String(enabled));
        button.textContent = t('Non lus : anciens d’abord', 'Unread: oldest first');
        button.title = enabled
            ? t('Rétablir l’ordre natif des messages', 'Restore the native message order')
            : t('Afficher d’abord les messages non lus, puis les conversations avec un ancien message non lu, et enfin les messages lus',
                'Show unread messages first, then conversations with an older unread member, and finally read messages');
        error.hidden = !visible || !error.textContent;
        const threads = group?.querySelector('.pw-threads');
        if (group) group.hidden = button.hidden && (!threads || threads.hidden);
    };
    const changed = (draftOrderChanged = false) => {
        update();
        schedule();
        if (draftOrderChanged) {
            dispatchEvent(new CustomEvent('pw-unread-order-changed', {detail:{enabled}}));
        }
    };
    const request = (params, callback) => {
        if (!window.rl?.pluginRemoteRequest) return callback(new Error('remote'));
        window.rl.pluginRemoteRequest((code, data) => {
            const result = data?.Result, validBehavior = result?.behavior === 1 || result?.behavior === 2;
            if (code || !result || result.error || typeof result.enabled !== 'boolean' || !validBehavior) {
                callback(new Error('settings'));
            } else callback(null, result);
        }, 'PiedWebUnreadOrder', params, 60000);
    };
    const load = () => {
        const version = ++generation, snapshot = account();
        currentAccount = snapshot; loading = true;
        if (error) error.textContent = '';
        if (settingsStatus) settingsStatus.textContent = '';
        update();
        request({}, (failure, state) => {
            if (version !== generation || snapshot !== account()) return;
            loading = false;
            if (failure) {
                ready = false;
                if (error) error.textContent = t('Ordre des non-lus indisponible. Réessayez.', 'Unread order unavailable. Try again.');
                if (settingsStatus) settingsStatus.textContent = t('Réglage indisponible. Réessayez.', 'Setting unavailable. Try again.');
            } else {
                ready = true; enabled = state.enabled; behavior = state.behavior;
                if (enabled && !receivedGlobal && baseFeed(listView?.messageList)) {
                    listView?.messageList?.reload?.(true, true);
                }
            }
            changed(true);
        });
    };
    const saveEnabled = state => {
        const version = ++generation, snapshot = account();
        loading = true; error.textContent = ''; update();
        request({enabled:state ? 1 : 0}, (failure, saved) => {
            if (version !== generation || snapshot !== account()) return;
            loading = false;
            if (failure) {
                error.textContent = t('Impossible d’enregistrer l’ordre des non-lus. Réessayez.', 'Could not save the unread order. Try again.');
            } else {
                ready = true; enabled = saved.enabled; behavior = saved.behavior;
                clearInjected();
                if (!enabled) clearHeld();
                if (listView?.messageList?.reload) listView.messageList.reload(enabled, true);
                else listView?.reload?.();
            }
            changed(true);
        });
    };
    const saveBehavior = state => {
        const previous = behavior, version = ++generation, snapshot = account();
        loading = true; behavior = state; settingsStatus.textContent = ''; update();
        request({behavior:state}, (failure, saved) => {
            if (version !== generation || snapshot !== account()) return;
            loading = false;
            if (failure) {
                behavior = previous;
                settingsStatus.textContent = t('Impossible d’enregistrer ce choix. Réessayez.', 'Could not save this choice. Try again.');
            } else {
                ready = true; enabled = saved.enabled; behavior = saved.behavior;
                if (behavior === 1) clearHeld();
            }
            update();
        });
    };
    const mountSettings = () => {
        const general = document.getElementById('V-Settings-General');
        if (!general || general.querySelector('.pw-unread-order-setting')) return;
        const form = general.matches('.form-horizontal') ? general
            : general.querySelector('.form-horizontal') || general;
        const control = document.createElement('div');
        control.className = 'control-group pw-unread-order-setting';
        const id = 'pw-unread-order-read-behavior';
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = t('Quand un message devient lu', 'When a message becomes read');
        const field = document.createElement('div');
        settingsSelect = document.createElement('select');
        settingsSelect.id = id;
        settingsSelect.innerHTML = `<option value="1">${t('Garder sa place jusqu’au rafraîchissement', 'Keep its place until refresh')}</option><option value="2">${t('Reclasser après avoir quitté le message', 'Reorder after leaving the message')}</option>`;
        const help = document.createElement('small');
        help.className = 'pw-unread-order-setting-help';
        help.textContent = t('S’applique à « Non lus : anciens d’abord ».', 'Applies to “Unread: oldest first”.');
        settingsStatus = document.createElement('span');
        settingsStatus.className = 'pw-unread-order-setting-status';
        settingsStatus.setAttribute('role', 'status');
        settingsStatus.setAttribute('aria-live', 'polite');
        field.append(settingsSelect, help, settingsStatus);
        control.append(label, field);
        const messageViewLegend = form.querySelectorAll('.legend')[2];
        if (messageViewLegend) messageViewLegend.before(control);
        else form.append(control);
        settingsSelect.addEventListener('change', () => saveBehavior(Number(settingsSelect.value)));
        updateSettings();
        if (!ready && !loading) load();
    };

    api.unreadOrder = {
        enabled: () => enabled,
        behavior: () => behavior,
        ready: () => ready,
        apply: schedule
    };

    addEventListener('rl-view-model', ({detail:vm}) => {
        mountSettings();
        if (vm.viewModelTemplateID === 'MailMessageView' && !vm.pwUnreadOrderReader) {
            vm.pwUnreadOrderReader = true;
            readerSubscription?.dispose?.();
            setActiveMessage(vm.message?.());
            readerSubscription = vm.message?.subscribe?.(setActiveMessage);
            ko.utils.domNodeDisposal.addDisposeCallback(vm.viewModelDom, () => {
                readerSubscription?.dispose?.(); readerSubscription = null;
                setActiveMessage(null);
            });
        }
        if (vm.viewModelTemplateID !== 'MailMessageList' || vm.pwUnreadOrder) return;
        const dom = vm.viewModelDom, threads = dom?.querySelector('.pw-threads');
        const toolbar = dom?.querySelector(':scope > .btn-toolbar');
        if (!dom || !toolbar || !threads) return;
        vm.pwUnreadOrder = true; listView = vm; listScope = scope(vm.messageList);
        group = document.createElement('div'); group.className = 'btn-group pw-feed-settings onCheckedHide';
        button = document.createElement('button'); button.type = 'button';
        button.className = 'btn pw-unread-order';
        error = document.createElement('span'); error.className = 'pw-unread-order-error';
        error.setAttribute('role', 'alert'); error.hidden = true;
        threads.before(group); group.append(button, threads); group.after(error);
        button.addEventListener('click', () => ready ? saveEnabled(!enabled) : load());

        const onList = () => {
            if (sorting) return;
            const nextScope = scope(vm.messageList);
            if (nextScope !== listScope || vm.messageList.loading?.()) {
                listScope = nextScope; clearHeld();
            }
            if (account() !== currentAccount) { clearInjected(); load(); }
            else { update(); schedule(); }
        };
        const subscriptions = [vm.messageList, vm.messageList.loading, vm.messageList.page, vm.messageList.threadUid]
            .filter(observable => observable?.subscribe).map(observable => observable.subscribe(onList));
        const theme = new MutationObserver(() => { update(); schedule(); });
        theme.observe(document.documentElement, {attributes:true, attributeFilter:['class']});
        ko.utils.domNodeDisposal.addDisposeCallback(dom, () => {
            ++generation; cancelAnimationFrame(frame); frame = 0; theme.disconnect();
            pendingAnchor = null;
            clearHeld(); clearInjected(); disposeMessageSubscriptions();
            subscriptions.forEach(subscription => subscription.dispose());
        });
        update();
        if (!ready && !loading) load();
        else schedule();
    });
    queueMicrotask(mountSettings);
})();
