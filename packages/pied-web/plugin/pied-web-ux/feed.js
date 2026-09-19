/* A virtual working feed beside the untouched native Inbox, plus an account-safe overview. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const active = () => document.documentElement.classList.contains('pw-theme');
    const french = () => (document.documentElement.lang || 'fr').startsWith('fr');
    const t = (fr, en) => french() ? fr : en;
    const value = candidate => typeof candidate === 'function' ? candidate() : candidate;
    const accountHash = () => String(window.rl?.settings?.get?.('accountHash') || 'default');
    const isInbox = folder => String(value(folder) || '').toUpperCase() === 'INBOX';
    const stateKey = () => 'pw-mail-view:' + accountHash();
    const pendingKey = 'pw-mail-feed-open';
    const getSession = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
    const setSession = (key, next) => { try { next === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, next); } catch {} };
    const validMode = candidate => ['feed', 'global', 'inbox'].includes(candidate) ? candidate : '';

    let mode = validMode(getSession(stateKey())) || 'feed';
    let settings = {defaultView:'auto', showDrafts:true, showRead:true, includeGlobal:true, accountCount:1};
    let settingsReady = false, settingsLoading = false, settingsGeneration = 0;
    let listView, folderView, systemView, globalSection, globalStatus, globalRows, globalRefresh;
    let feedLink, feedItem, globalLink, globalItem, nativeInbox, accountSubscription, accountCount = 1;
    let globalGeneration = 0, globalLoading = false, globalReloadPending = false, globalItems = [], globalAccounts = [];

    const currentEmail = () => String(value(systemView?.accountEmail) || window.rl?.settings?.get?.('Email') || '');
    const currentFolder = () => String(value(listView?.messageList)?.folder || value(folderView?.currentFolder)?.fullName || '');
    const accountFeed = folder => active() && mode === 'feed' && isInbox(folder === undefined ? currentFolder() : folder);
    const globalFeed = () => active() && mode === 'global' && accountCount > 1;
    const notify = () => dispatchEvent(new CustomEvent('pw-feed-mode-changed', {
        detail:{mode, showDrafts:settings.showDrafts, showRead:settings.showRead, accountCount}
    }));

    const decode = candidate => {
        let encoded = String(candidate || '').replace(/-/g, '+').replace(/_/g, '/');
        encoded += '='.repeat((4 - encoded.length % 4) % 4);
        const binary = atob(encoded), bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
    };
    const encode = candidate => {
        const bytes = new TextEncoder().encode(JSON.stringify(candidate));
        let binary = '';
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const markPath = (action, path) => {
        if (action !== 'MessageList' || !path) return path;
        const separator = path.lastIndexOf('/');
        if (separator < 0) return path;
        try {
            const request = decode(path.slice(separator + 1));
            if (!request || Array.isArray(request) || !isInbox(request.folder)) return path;
            if (accountFeed(request.folder)) request.PiedWebFeed = '1';
            else delete request.PiedWebFeed;
            return path.slice(0, separator + 1) + encode(request);
        } catch {
            return path;
        }
    };

    // The server enriches Inbox only for the virtual Feed. The very same Inbox
    // request without this marker remains native.
    const remote = window.rl?.app?.Remote;
    if (remote?.request && !remote.pwFeedScope) {
        const request = remote.request;
        remote.request = function(action, callback, params, timeout, path) {
            let scoped = params;
            if (action === 'MessageList' && params?.folder && isInbox(params.folder)) {
                scoped = {...params};
                if (accountFeed(params.folder)) scoped.PiedWebFeed = '1';
                else delete scoped.PiedWebFeed;
            }
            return request.call(this, action, callback, scoped, timeout, markPath(action, path));
        };
        remote.pwFeedScope = true;
    }

    const requestPlugin = (params, callback) => {
        if (!window.rl?.pluginRemoteRequest) return callback(new Error('remote'));
        window.rl.pluginRemoteRequest((code, data) => {
            const result = data?.Result;
            code || !result || result.error ? callback(new Error(result?.error || 'feed')) : callback(null, result);
        }, 'PiedWebFeed', params, 120000);
    };

    const resolvedDefault = () => {
        const preferred = settings.defaultView;
        if ((preferred === 'global' || preferred === 'auto') && accountCount > 1) return 'global';
        if (preferred === 'inbox') return 'inbox';
        return 'feed';
    };
    const setMode = (next, persist = true) => {
        next = validMode(next) || 'feed';
        if (next === 'global' && accountCount < 2) next = 'feed';
        const changed = next !== mode;
        mode = next;
        if (persist) setSession(stateKey(), mode);
        updateNavigation();
        renderGlobal();
        if (changed) notify();
    };

    const reloadList = () => {
        const list = listView?.messageList;
        if (list?.reload) list.reload(true, true);
        else listView?.reload?.();
    };
    const selectView = next => {
        setMode(next);
        if (!isInbox(currentFolder())) {
            const href = nativeInbox?.href;
            if (href) location.href = href;
            return;
        }
        if (next === 'global') renderGlobal(true);
        else reloadList();
    };

    const linkLabel = (link, label, icon) => {
        link.href = '#';
        link.className = 'selectable pw-feed-link';
        link.dataset.pwFeed = icon;
        link.title = label;
        link.setAttribute('aria-label', label);
        const glyph = document.createElement('span');
        glyph.className = 'pw-feed-nav-icon'; glyph.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span'); text.className = 'pw-feed-nav-label'; text.textContent = label;
        link.append(glyph, text);
    };
    const updateNavigation = () => {
        const inboxActive = isInbox(currentFolder());
        const globalVisible = accountCount > 1;
        if (globalItem) globalItem.hidden = !globalVisible;
        if (mode === 'global' && !globalVisible) mode = 'feed';
        feedLink?.classList.toggle('selected', inboxActive && mode === 'feed');
        globalLink?.classList.toggle('selected', inboxActive && mode === 'global');
        nativeInbox?.classList.toggle('selected', inboxActive && mode === 'inbox');
        feedLink?.setAttribute('aria-current', inboxActive && mode === 'feed' ? 'page' : 'false');
        globalLink?.setAttribute('aria-current', inboxActive && mode === 'global' ? 'page' : 'false');
        if (listView?.viewModelDom) {
            listView.viewModelDom.classList.toggle('pw-global-active', globalFeed());
            listView.viewModelDom.classList.toggle('pw-account-feed-active', accountFeed());
        }
    };

    const folderName = link => {
        const folder = window.ko?.dataFor?.(link);
        return String(value(folder?.fullName) || value(folder?.name) || '');
    };
    const mountNavigation = vm => {
        const root = vm.viewModelDom, list = root?.querySelector('.b-folders-system');
        if (!list || root.querySelector('.pw-feed-nav')) return;
        folderView = vm;
        nativeInbox = [...list.querySelectorAll('a.selectable')].find(link => isInbox(folderName(link)))
            || list.querySelector('a.selectable');
        if (!nativeInbox) return;

        const feedNav = document.createElement('li'); feedNav.className = 'pw-feed-nav';
        feedLink = document.createElement('a'); linkLabel(feedLink, t('Flux', 'Feed'), 'account');
        feedNav.append(feedLink); feedItem = feedNav;
        const globalNav = document.createElement('li'); globalNav.className = 'pw-feed-nav pw-global-nav';
        globalLink = document.createElement('a'); linkLabel(globalLink, t('Tous les comptes', 'All accounts'), 'global');
        globalNav.append(globalLink); globalItem = globalNav;
        list.prepend(globalNav, feedNav);

        feedLink.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); selectView('feed'); });
        globalLink.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); selectView('global'); });
        root.addEventListener('click', event => {
            const link = event.target.closest?.('a.selectable');
            if (!link || link === feedLink || link === globalLink) return;
            setMode('inbox');
        }, true);
        vm.currentFolder?.subscribe?.(updateNavigation);
        updateNavigation();
    };

    const addressText = (item, property) => {
        const source = item?.[property]?.['@Collection'] || item?.[property] || [];
        return (Array.isArray(source) ? source : []).map(address => address?.name || address?.email).filter(Boolean).join(', ');
    };
    const stamp = item => {
        const time = Number(item?.dateTimestamp || 0);
        return Number.isFinite(time) && time > 0 ? time : 0;
    };
    const unseen = item => !(item?.flags || []).some(flag => String(flag).toLowerCase() === '\\seen');
    const rank = item => item?._pwKind === 'draft' ? 3 : unseen(item) ? 2 : (item?.threadUnseen || []).length ? 1 : 0;
    const sortedGlobal = () => globalItems.slice().sort((left, right) => {
        const difference = rank(right) - rank(left);
        if (difference) return difference;
        return rank(left) > 0 ? stamp(left) - stamp(right) : stamp(right) - stamp(left);
    });
    const sectionTitle = itemRank => ({
        3:t('Brouillons non lus', 'Unread drafts'),
        2:t('Messages non lus', 'Unread messages'),
        1:t('Conversations avec un ancien non-lu', 'Conversations with an older unread message'),
        0:t('Messages lus', 'Read messages')
    })[itemRank];
    const dateText = item => {
        const date = new Date(stamp(item) * 1000);
        if (!stamp(item) || !Number.isFinite(date.getTime())) return '';
        return date.toLocaleString(document.documentElement.lang || 'fr', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
    };
    const accountText = item => item._pwAccountName
        ? item._pwAccountName + ' · ' + item._pwAccountEmail : item._pwAccountEmail;

    const pending = item => ({
        email:String(item._pwAccountEmail || ''), folder:String(item.folder || ''),
        uid:Number(item.uid || 0), kind:String(item._pwKind || 'message'),
        accountHash:String(item._pwAccountHash || '')
    });
    const switchAccountContext = accountHash => {
        if (!/^[a-f0-9]{40}$/i.test(accountHash)) return false;
        const url = new URL(location.href);
        url.searchParams.set('account', accountHash.toLowerCase());
        location.assign(url.href);
        return true;
    };
    const nativeMessageHref = item => {
        const base = nativeInbox?.href || location.href;
        const url = new URL(base, location.href);
        url.hash = '#/mailbox/' + encodeURIComponent(String(item.folder || 'INBOX')) + '/m' + Number(item.uid);
        return url.href;
    };
    const openDraft = async target => {
        const collection = listView?.messageList?.(), CollectionModel = collection?.constructor;
        if (!CollectionModel || typeof CollectionModel.reviveFromJson !== 'function') throw new Error('model');
        const response = await window.rl.app.Remote.post('Message', null, {folder:target.folder, uid:target.uid}, 60000);
        const data = response?.Result;
        if (data?.folder !== target.folder || Number(data.uid) !== target.uid) throw new Error('message');
        const draft = CollectionModel.reviveFromJson([data])[0];
        if (!draft?.bodyAsHTML || !draft.revivePropertiesFromJson || draft.encrypted?.()) throw new Error('message');
        draft.isHtml(!!draft.html());
        window.rl.app.showMessageComposer([5, draft]);
    };
    const consumePending = async target => {
        if (!target?.email || target.email !== currentEmail() || !target.folder || !target.uid) return false;
        setSession(pendingKey, null);
        setMode('feed');
        if (target.kind === 'draft') {
            try { await openDraft(target); }
            catch { globalStatus && (globalStatus.textContent = t('Impossible d’ouvrir ce brouillon.', 'Could not open this draft.')); }
        } else {
            location.href = nativeMessageHref(target);
        }
        return true;
    };
    const openGlobalItem = item => {
        const target = pending(item);
        if (!target.email || !target.folder || !target.uid) return;
        setSession(pendingKey, JSON.stringify(target));
        if (target.email === currentEmail()) {
            void consumePending(target);
            return;
        }
        globalStatus.textContent = t('Ouverture de ', 'Opening ') + accountText(item) + '…';
        if (!switchAccountContext(target.accountHash)) {
            setSession(pendingKey, null);
            globalStatus.textContent = t('Impossible d’ouvrir ce compte.', 'Could not open this account.');
        }
    };

    const createGlobalRow = item => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'pw-global-row';
        button.classList.toggle('pw-global-unread', rank(item) > 0);
        button.classList.toggle('pw-global-draft', item._pwKind === 'draft');
        const primary = document.createElement('span'); primary.className = 'pw-global-primary';
        primary.textContent = item._pwKind === 'draft'
            ? (addressText(item, 'to') || t('Sans destinataire', 'No recipient'))
            : (addressText(item, 'from') || t('Expéditeur inconnu', 'Unknown sender'));
        const subject = document.createElement('span'); subject.className = 'pw-global-subject';
        subject.textContent = item.subject || t('(Sans objet)', '(No subject)');
        const account = document.createElement('span'); account.className = 'pw-global-account';
        account.textContent = accountText(item);
        const time = document.createElement('time'); time.className = 'pw-global-time';
        time.textContent = dateText(item);
        const date = new Date(stamp(item) * 1000);
        if (stamp(item) && Number.isFinite(date.getTime())) time.dateTime = date.toISOString();
        button.append(primary, account, subject, time);
        button.addEventListener('click', () => openGlobalItem(item));
        return button;
    };
    const paintGlobal = () => {
        if (!globalRows) return;
        globalRows.replaceChildren();
        if (!globalFeed()) return;
        const items = sortedGlobal().filter(item => settings.showRead || rank(item) > 0);
        let previousRank = null;
        items.forEach(item => {
            const itemRank = rank(item);
            if (itemRank !== previousRank) {
                const heading = document.createElement('h2'); heading.textContent = sectionTitle(itemRank);
                globalRows.append(heading); previousRank = itemRank;
            }
            globalRows.append(createGlobalRow(item));
        });
        const failed = globalAccounts.filter(account => account.error).length;
        globalStatus.textContent = globalLoading ? t('Chargement des comptes…', 'Loading accounts…')
            : failed ? t(`${failed} compte${failed > 1 ? 's' : ''} indisponible${failed > 1 ? 's' : ''}. Les autres restent affichés.`,
                `${failed} account${failed > 1 ? 's are' : ' is'} unavailable. Other accounts remain visible.`)
            : items.length ? '' : t('Aucun message à afficher.', 'No messages to show.');
        globalRefresh.disabled = globalLoading;
        globalRefresh.setAttribute('aria-busy', String(globalLoading));
    };
    const loadGlobal = (force = false) => {
        if (!globalFeed()) return;
        if (globalLoading) {
            if (force) globalReloadPending = true;
            return;
        }
        const version = ++globalGeneration;
        globalLoading = true; paintGlobal();
        requestPlugin({operation:'global'}, (failure, result) => {
            if (version !== globalGeneration) return;
            globalLoading = false;
            const reload = globalReloadPending;
            globalReloadPending = false;
            if (failure || !Array.isArray(result?.items) || !Array.isArray(result?.accounts)) {
                globalStatus.textContent = t('Le flux global est indisponible. Réessayez.', 'The global feed is unavailable. Try again.');
                globalRefresh.disabled = false;
                if (reload) loadGlobal();
                return;
            }
            globalItems = result.items;
            globalAccounts = result.accounts;
            paintGlobal();
            if (reload) loadGlobal();
        });
    };
    const mountGlobal = vm => {
        const content = vm.viewModelDom?.querySelector('.messageList > .b-content');
        if (!content || content.querySelector('.pw-global-feed')) return;
        listView = vm;
        globalSection = document.createElement('section'); globalSection.className = 'pw-global-feed'; globalSection.hidden = true;
        const header = document.createElement('header');
        const title = document.createElement('h1'); title.textContent = t('Tous les comptes', 'All accounts');
        globalRefresh = document.createElement('button'); globalRefresh.type = 'button'; globalRefresh.className = 'pw-global-refresh';
        globalRefresh.textContent = t('Actualiser', 'Refresh');
        globalRefresh.addEventListener('click', loadGlobal);
        header.append(title, globalRefresh);
        globalStatus = document.createElement('p'); globalStatus.className = 'pw-global-status';
        globalStatus.setAttribute('role', 'status'); globalStatus.setAttribute('aria-live', 'polite');
        globalRows = document.createElement('div'); globalRows.className = 'pw-global-rows';
        globalSection.append(header, globalStatus, globalRows); content.prepend(globalSection);
        const list = vm.messageList;
        [list, list?.page, list?.threadUid].filter(observable => observable?.subscribe)
            .forEach(observable => observable.subscribe(() => { updateNavigation(); renderGlobal(); }));
        updateNavigation(); renderGlobal();
    };
    function renderGlobal(force = false) {
        updateNavigation();
        if (!globalSection) return;
        globalSection.hidden = !globalFeed();
        if (!globalSection.hidden && (force || (!globalItems.length && !globalLoading))) loadGlobal(force);
    }

    const updateAccountCount = () => {
        const accounts = value(systemView?.accounts);
        // The native account store is temporarily empty while its own endpoint
        // loads. Keep the authenticated server count during that window so the
        // multi-account default does not fall back to the account Feed.
        const observedCount = Array.isArray(accounts) && accounts.length ? accounts.length : 0;
        accountCount = Math.max(1, observedCount || Number(settings.accountCount) || 1);
        settings.accountCount = accountCount;
        if (mode === 'global' && accountCount < 2) setMode('feed');
        updateNavigation(); renderGlobal(); updateSettingsForm();
    };

    let defaultSelect, draftsInput, readInput, globalInput, settingsStatus;
    const updateSettingsForm = () => {
        if (!defaultSelect?.isConnected) return;
        const current = settings.defaultView;
        defaultSelect.replaceChildren();
        const choices = accountCount > 1
            ? [['auto',t('Tous les comptes', 'All accounts')],['feed',t('Flux du compte', 'Account feed')],['inbox',t('Boîte de réception', 'Inbox')]]
            : [['auto',t('Flux', 'Feed')],['inbox',t('Boîte de réception', 'Inbox')]];
        choices.forEach(([id,label]) => {
            const option = document.createElement('option'); option.value = id; option.textContent = label; defaultSelect.append(option);
        });
        defaultSelect.value = choices.some(([id]) => id === current) ? current : 'auto';
        draftsInput.checked = settings.showDrafts;
        readInput.checked = settings.showRead;
        globalInput.checked = settings.includeGlobal;
        globalInput.closest('.pw-feed-setting-row').hidden = accountCount < 2;
        [defaultSelect,draftsInput,readInput,globalInput].forEach(control => {
            control.disabled = settingsLoading; control.setAttribute('aria-busy', String(settingsLoading));
        });
    };
    const saveSettings = params => {
        const previous = {...settings}, version = ++settingsGeneration;
        settings = {...settings, ...params}; settingsLoading = true; settingsStatus.textContent = ''; updateSettingsForm(); notify();
        requestPlugin({operation:'settings', ...Object.fromEntries(Object.entries(params).map(([key,next]) => [key, typeof next === 'boolean' ? Number(next) : next]))},
            (failure, result) => {
                if (version !== settingsGeneration) return;
                settingsLoading = false;
                if (failure) {
                    settings = previous;
                    settingsStatus.textContent = t('Impossible d’enregistrer les réglages du Flux.', 'Could not save Feed settings.');
                } else settings = {...settings, ...result};
                updateAccountCount(); updateSettingsForm(); notify(); renderGlobal(true);
            });
    };
    const settingRow = (labelText, control, helpText = '') => {
        const row = document.createElement('div'); row.className = 'pw-feed-setting-row';
        const label = document.createElement('label'); label.append(control, document.createTextNode(labelText));
        row.append(label);
        if (helpText) { const help = document.createElement('small'); help.textContent = helpText; row.append(help); }
        return row;
    };
    const mountSettings = () => {
        const general = document.getElementById('V-Settings-General');
        if (!general || general.querySelector('.pw-feed-settings-panel')) return;
        const panel = document.createElement('section'); panel.className = 'pw-feed-settings-panel';
        const legend = document.createElement('div'); legend.className = 'legend'; legend.textContent = t('Flux', 'Feed');
        defaultSelect = document.createElement('select'); defaultSelect.id = 'pw-feed-default-view';
        const defaultLabel = document.createElement('label'); defaultLabel.htmlFor = defaultSelect.id;
        defaultLabel.textContent = t('Vue d’ouverture', 'Opening view');
        const defaultRow = document.createElement('div'); defaultRow.className = 'pw-feed-setting-row pw-feed-default-row';
        defaultRow.append(defaultLabel, defaultSelect);
        draftsInput = document.createElement('input'); draftsInput.type = 'checkbox';
        readInput = document.createElement('input'); readInput.type = 'checkbox';
        globalInput = document.createElement('input'); globalInput.type = 'checkbox';
        settingsStatus = document.createElement('p'); settingsStatus.className = 'pw-feed-settings-status';
        settingsStatus.setAttribute('role', 'status'); settingsStatus.setAttribute('aria-live', 'polite');
        panel.append(legend, defaultRow,
            settingRow(t('Afficher les brouillons non lus', 'Show unread drafts'), draftsInput),
            settingRow(t('Afficher les messages lus après les non-lus', 'Show read messages after unread messages'), readInput),
            settingRow(t('Inclure ce compte dans « Tous les comptes »', 'Include this account in “All accounts”'), globalInput),
            settingsStatus);
        general.append(panel);
        defaultSelect.addEventListener('change', () => saveSettings({defaultView:defaultSelect.value}));
        draftsInput.addEventListener('change', () => saveSettings({showDrafts:draftsInput.checked}));
        readInput.addEventListener('change', () => saveSettings({showRead:readInput.checked}));
        globalInput.addEventListener('change', () => saveSettings({includeGlobal:globalInput.checked}));
        updateSettingsForm();
    };

    const loadSettings = () => {
        if (settingsLoading) return;
        const version = ++settingsGeneration, hadStoredMode = !!validMode(getSession(stateKey()));
        settingsLoading = true; updateSettingsForm();
        requestPlugin({operation:'settings'}, (failure, result) => {
            if (version !== settingsGeneration) return;
            settingsLoading = false;
            if (failure) {
                settingsStatus && (settingsStatus.textContent = t('Réglages du Flux indisponibles.', 'Feed settings unavailable.'));
            } else {
                settings = {...settings, ...result}; settingsReady = true;
                accountCount = Math.max(1, Number(settings.accountCount) || 1);
                // A pending cross-account open can establish the target account's
                // mode while this request is in flight. Do not overwrite it with
                // the default when the settings response arrives afterwards.
                if (!hadStoredMode && !validMode(getSession(stateKey()))) {
                    const opening = resolvedDefault();
                    setMode(opening);
                    // The bootstrap request may have started while Feed was the
                    // provisional mode. Reload once without its marker when the
                    // saved opening view is the native Inbox.
                    if (opening === 'inbox' && isInbox(currentFolder())) reloadList();
                }
            }
            updateAccountCount(); updateSettingsForm(); notify(); renderGlobal();
        });
    };

    api.feed = {
        mode: () => mode,
        isAccountFeed: accountFeed,
        isGlobal: globalFeed,
        showDrafts: () => settings.showDrafts,
        showRead: () => settings.showRead,
        accountCount: () => accountCount,
        setMode,
        refreshGlobal: () => renderGlobal(true)
    };

    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'MailFolderList') mountNavigation(vm);
        if (vm.viewModelTemplateID === 'MailMessageList') {
            mountGlobal(vm);
            const raw = getSession(pendingKey);
            if (raw) { try { void consumePending(JSON.parse(raw)); } catch { setSession(pendingKey, null); } }
        }
        if (vm.viewModelTemplateID === 'SystemDropDown') {
            systemView = vm;
            accountSubscription?.dispose?.();
            accountSubscription = vm.accounts?.subscribe?.(updateAccountCount);
            updateAccountCount();
        }
        mountSettings();
        if (!settingsReady && !settingsLoading) loadSettings();
    });
    addEventListener('pw-unread-order-changed', () => { if (globalFeed()) renderGlobal(true); });
    // Background Send emits this only after the server has removed its durable
    // draft. Refresh a global Feed that may still be showing the earlier copy.
    addEventListener('pw-message-sent', () => { if (globalFeed()) renderGlobal(true); });
    queueMicrotask(() => { mountSettings(); if (!settingsReady && !settingsLoading) loadSettings(); });
})();
