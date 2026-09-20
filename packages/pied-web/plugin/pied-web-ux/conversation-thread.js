/* One chronological reader stack for the current folder's thread and Sent replies. */
(() => {
    'use strict';
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    const itemKey = item => item?.folder && Number(item.uid) > 0 ? item.folder + '\u0000' + item.uid : '';
    const isInbox = folder => window.PiedWebUx?.inboxConversations?.isInbox(folder)
        ?? String(folder || '').toUpperCase() === 'INBOX';
    const addresses = value => {
        const entries = value?.['@Collection'] || value || [];
        return Array.isArray(entries) ? entries.map(address => address.name || address.email).filter(Boolean).join(', ') : '';
    };
    const plain = message => ({
        folder: message.folder, uid: message.uid, messageId: message.messageId,
        inReplyTo: message.inReplyTo, references: message.references,
        subject: ko.unwrap(message.subject), dateTimestamp: ko.unwrap(message.dateTimestamp),
        from: message.from, to: message.to
    });
    let listVM, bootstrapObserver;

    function mount(vm) {
        if (vm.viewModelTemplateID !== 'MailMessageView' || vm.pwConversationThread) return;
        const dom = vm.viewModelDom, host = dom?.querySelector('.messageView .b-message');
        const item = host?.querySelector('#messageItem');
        const header = host?.querySelector(':scope > .messageItemHeader');
        if (!host || !item || !header || !vm.message?.subscribe) return;
        vm.pwConversationThread = true;
        bootstrapObserver?.disconnect();

        const before = document.createElement('section'); before.className = 'pw-conversation-before'; before.hidden = true;
        const title = document.createElement('h2');
        const latestButton = document.createElement('button'); latestButton.type = 'button'; latestButton.hidden = true;
        const beforeCards = document.createElement('div'); beforeCards.className = 'pw-conversation-cards';
        const status = document.createElement('p'); status.setAttribute('role', 'status');
        const retry = document.createElement('button'); retry.type = 'button'; retry.hidden = true; retry.className = 'pw-conversation-retry';
        const scopeNote = document.createElement('p'); scopeNote.className = 'pw-conversation-scope';
        const singleButton = document.createElement('button'); singleButton.type = 'button'; singleButton.hidden = true;
        const fullButton = document.createElement('button'); fullButton.type = 'button'; fullButton.hidden = true;
        fullButton.className = 'pw-conversation-full';
        const currentLabel = document.createElement('span'); currentLabel.className = 'pw-conversation-current'; currentLabel.hidden = true;
        currentLabel.textContent = t('Message actif', 'Active message');
        before.append(title,latestButton,scopeNote,singleButton,status,retry,beforeCards); header.before(before);
        header.prepend(currentLabel); header.after(fullButton);
        const after = document.createElement('section'); after.className = 'pw-conversation-after'; after.hidden = true;
        const afterCards = document.createElement('div'); afterCards.className = 'pw-conversation-cards';
        after.append(afterCards); item.after(after);

        let generation = 0, timer, disposed = false, context = null, entries = [];
        let loading = false, error = false, silentRefresh = false, explicitOrigin = '';
        let previewAccount = '', previewActive = 0;
        const previews = new Map();
        const previewQueue = [];
        const cards = new Map();
        let previewControlFrame = 0;
        const schedulePreviewControls = () => {
            if (previewControlFrame) return;
            previewControlFrame = requestAnimationFrame(() => {
                previewControlFrame = 0;
                const measured = [...cards.values()].map(state => [state,state.canExpand?.()]);
                measured.forEach(([state,expandable]) => state.syncPreviewControl?.(expandable));
            });
        };
        let geometry;
        const observeGeometry = node => {
            if (!geometry) return;
            // Padding and borders can grow while the default content box stays
            // unchanged. Watching the border box makes those late shifts visible.
            try { geometry.observe(node,{box:'border-box'}); }
            catch { geometry.observe(node); }
        };
        const previewText = (raw, limit = 180) => {
            let value = String(ko.unwrap(raw.preview) || '').trim() || String(ko.unwrap(raw.plain) || '').trim();
            if (!value && raw.html) {
                // A template is inert, including images/iframes. Do not inject
                // unsanitized mail HTML or start remote image loads for a preview.
                const template = document.createElement('template');
                template.innerHTML = String(ko.unwrap(raw.html) || '');
                template.content.querySelectorAll('script,style,template,svg,iframe,object').forEach(node => node.remove());
                template.content.querySelectorAll('br,p,div,li,tr,blockquote').forEach(node => node.before(' '));
                value = template.content.textContent || '';
            }
            return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0,limit);
        };
        const pumpPreviews = () => {
            while (previewActive < 2 && previewQueue.length) {
                const {entry,owner,resolve} = previewQueue.shift();
                if (disposed || owner !== account()) { resolve(''); continue; }
                ++previewActive;
                void rl.app.Remote.post('Message', null,
                    {folder:entry.raw.folder, uid:Number(entry.raw.uid)}, 60000)
                    .then(response => previewText(response?.Result || {}, 2400)).catch(() => '')
                    .then(value => { resolve(value); --previewActive; pumpPreviews(); });
            }
        };
        const fetchPreview = entry => {
            if (previews.has(entry.key)) return previews.get(entry.key);
            const request = new Promise(resolve => previewQueue.push({entry,owner:account(),resolve}));
            previews.set(entry.key, request); pumpPreviews();
            if (previews.size > 200) previews.delete(previews.keys().next().value);
            return request;
        };
        const account = () => String(rl.settings.get('accountHash') || '');
        const sentFolder = () => String(rl.settings.get('SentFolder') || '');
        const current = () => vm.message?.();
        const currentKey = () => itemKey(current());
        const addFlag = (message, flag) => {
            const flags = message?.flags;
            if (!flag || typeof flags !== 'function' || flags().includes(flag)) return;
            flags.push(flag);
        };
        const reflectListFlag = (ctx, flag) => {
            addFlag(ctx?.originModel, flag);
            const rows = typeof listVM?.messageList === 'function' ? listVM.messageList() : [];
            const originUid = Number(ctx?.origin?.uid || 0);
            if (!Array.isArray(rows) || !ctx?.folder || originUid < 1) return;
            rows.forEach(message => {
                const thread = typeof message?.threads === 'function' ? message.threads() : [];
                if (message?.folder === ctx.folder && (itemKey(message) === ctx.originKey
                    || thread.some(value => Number(value) === originUid))) addFlag(message,flag);
            });
        };
        const active = () => {
            const key = currentKey();
            const folder = context && entries.some(entry => entry.key === key) ? context.folder : current()?.folder;
            return document.documentElement.classList.contains('pw-theme')
                && ((!!rl.settings.get('useThreads') && isInbox(folder))
                    || explicitOrigin === key || !!context?.full && entries.some(entry => entry.key === key));
        };
        const valid = (version, ctx) => !disposed && version === generation && context === ctx
            && account() === ctx.account && active() && !!currentKey()
            && (currentKey() === ctx.originKey || entries.some(entry => entry.key === currentKey()));
        // Folded history sits above the open message, so a long conversation would
        // otherwise start the reader on its oldest card. Place the opened message
        // at the top of its scroller once, leaving the previous card in sight; a
        // manual scroll, a revealed summary and the silent refresh then keep the
        // position they find.
        let anchored = '', viewportAnchor = null, manualDuringLoad = false, observedKey = '';
        const scroller = () => {
            for (let node = host; node && node !== document.body; node = node.parentElement)
                if (node.scrollHeight - node.clientHeight > 1
                    && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
            return null;
        };
        const rememberPosition = () => {
            const box = scroller();
            if (!box || !active() || host.classList.contains('pw-conversation-pending')) return;
            const boxRect = box.getBoundingClientRect(), edge = boxRect.top;
            const nodes = [header, ...host.querySelectorAll('.pw-conversation-card')];
            let nearest = null, distance = Infinity, offset = 0;
            const currentRect = header.getBoundingClientRect();
            if (currentRect.height && currentRect.top >= edge && currentRect.bottom <= boxRect.bottom) {
                viewportAnchor = {box,node:header,offset:currentRect.top-edge,key:currentKey(),scrollTop:box.scrollTop};
                return;
            }
            // Locate the visible body element rather than walking thousands of
            // newsletter descendants on every scroll. Images above that element
            // can resize without changing the line the reader is following.
            const hit = document.elementFromPoint(Math.min(boxRect.right-16,currentRect.left+80),edge+8);
            if (hit && item.contains(hit) && hit !== item && hit.getClientRects().length) {
                viewportAnchor = {box,node:hit,offset:hit.getBoundingClientRect().top-edge,key:currentKey(),scrollTop:box.scrollTop};
                return;
            }
            for (const node of nodes) {
                if (!node.getClientRects().length) continue;
                const top = node.getBoundingClientRect().top - edge;
                if (Math.abs(top) < distance) { nearest = node; distance = Math.abs(top); offset = top; }
            }
            viewportAnchor = nearest ? {box,node:nearest,offset,key:currentKey(),scrollTop:box.scrollTop} : null;
        };
        const restorePosition = () => {
            const saved = viewportAnchor;
            if (!saved || saved.key !== currentKey() || !saved.node.isConnected || !active()
                || host.classList.contains('pw-conversation-pending')) return;
            // Scroll events are asynchronous. A wheel/programmatic scroll may
            // happen in the same turn as a KO refresh, before our listener runs.
            // Never restore an older anchor over that deliberate new position.
            if (Math.abs(saved.box.scrollTop - saved.scrollTop) > 1) { rememberPosition(); return; }
            const delta = saved.node.getBoundingClientRect().top - saved.box.getBoundingClientRect().top - saved.offset;
            if (Math.abs(delta) > 0.5) { saved.box.scrollTop += delta; saved.scrollTop = saved.box.scrollTop; }
        };
        const rememberElementPosition = node => {
            const box = scroller();
            if (!box || !node?.isConnected || !active()) return;
            viewportAnchor = {
                box,
                node,
                offset:node.getBoundingClientRect().top - box.getBoundingClientRect().top,
                key:currentKey(),
                scrollTop:box.scrollTop
            };
        };
        const anchor = () => {
            const key = currentKey();
            if (before.hidden || !key || anchored === key
                || host.classList.contains('pw-conversation-pending')) return;
            const box = scroller();
            if (!box) return;
            anchored = key;
            if (!manualDuringLoad) {
                // Show the identifiable previous card, not its anonymous last
                // 24px. Never let a very tall preview push the active header away.
                const previous = beforeCards.lastElementChild;
                const peek = previous ? Math.min(previous.getBoundingClientRect().height + 8, 132) : 0;
                box.scrollTop = previous
                    ? Math.max(0, box.scrollTop + header.getBoundingClientRect().top - box.getBoundingClientRect().top - peek)
                    : 0;
            }
            rememberPosition();
        };
        const settle = () => {
            if (!loading && (!context?.followLatest || currentKey() === entries.at(-1)?.key)
                && !vm.messageLoadingThrottle?.()) {
                host.classList.remove('pw-conversation-pending');
                anchor();
            }
        };

        function showMessage(entry, followLatest = false, preserveManual = false) {
            const callback = listVM?.selector?.oCallbacks?.ItemSelect;
            const CollectionModel = rl.app.messageList?.()?.constructor;
            const model = entry.model || CollectionModel?.reviveFromJson?.([entry.raw])?.[0];
            if (typeof callback !== 'function' || !model || itemKey(model) !== entry.key) {
                error = true; host.classList.remove('pw-conversation-pending'); render(); return;
            }
            context.followLatest = followLatest;
            const wasManual = manualDuringLoad;
            manualDuringLoad = false; viewportAnchor = null;
            callback(model); // Native reader fetch, attachments and actions use this message's real folder/UID.
            if (preserveManual) manualDuringLoad = wasManual;
        }

        function card(entry) {
            if (cards.has(entry.key)) {
                const saved = cards.get(entry.key); saved.entry = entry; return saved.article;
            }
            const raw = entry.raw, article = document.createElement('article');
            article.className = 'pw-conversation-card';
            article.dataset.key = entry.key;
            const state = {entry,article}; cards.set(entry.key,state);
            const button = document.createElement('button'); button.type = 'button';
            button.className = 'pw-conversation-card-toggle';
            button.title = t('Ouvrir ce message dans le lecteur', 'Open this message in the reader');
            const sender = document.createElement('strong');
            sender.textContent = addresses(raw.from) || t('Message', 'Message');
            const recipient = document.createElement('span'); recipient.className = 'pw-conversation-card-recipient';
            recipient.textContent = t('À : ', 'To: ') + addresses(raw.to);
            const date = document.createElement('time'), stamp = Number(raw.dateTimestamp);
            if (stamp > 0 && Number.isFinite(stamp) && Number.isFinite(new Date(stamp * 1000).getTime())) {
                const value = new Date(stamp * 1000);
                date.dateTime = value.toISOString();
                date.textContent = value.toLocaleString(document.documentElement.lang || 'fr', {dateStyle:'medium',timeStyle:'short'});
            }
            const summary = document.createElement('span'); summary.className = 'pw-conversation-card-summary';
            let fullPreview = previewText(raw,2400), previewResolved = !!fullPreview, previewLoading = false;
            summary.textContent = fullPreview.slice(0,180);
            summary.hidden = !fullPreview;
            const previewButton = document.createElement('button'); previewButton.type = 'button';
            previewButton.className = 'pw-conversation-preview-toggle';
            previewButton.textContent = t('Charger l’aperçu', 'Load preview');
            previewButton.hidden = previewResolved;
            previewButton.setAttribute('aria-expanded','false');
            const preview = document.createElement('p'); preview.className = 'pw-conversation-preview'; preview.hidden = true;
            preview.id = 'pw-conversation-preview-' + generation + '-' + cards.size;
            previewButton.setAttribute('aria-controls',preview.id);
            const canExpand = () => !!fullPreview && (fullPreview.length > 180
                || summary.scrollWidth > summary.clientWidth + 1);
            const syncPreviewControl = (expandable = canExpand()) => {
                const expanded = previewButton.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    previewButton.hidden = false;
                    text(previewButton,t('Réduire', 'Show less'));
                    return;
                }
                summary.hidden = !previewResolved; preview.hidden = true;
                previewButton.hidden = previewResolved && !expandable;
                text(previewButton,previewResolved
                    ? t('Afficher la suite', 'Show more') : t('Charger l’aperçu', 'Load preview'));
            };
            const reveal = async (expanded = false) => {
                const owner = account();
                if (!previewResolved) {
                    previewLoading = true; previewButton.disabled = true;
                    previewButton.setAttribute('aria-busy','true');
                    text(previewButton,t('Chargement…', 'Loading…'));
                    fullPreview = previewText(state.entry.raw,2400) || await fetchPreview(state.entry);
                    previewResolved = true; previewLoading = false; previewButton.disabled = false;
                    previewButton.removeAttribute('aria-busy');
                }
                if (disposed || account() !== owner || !article.isConnected) return;
                text(summary,fullPreview.slice(0,180) || t('Aperçu indisponible. Ouvrez le message pour le lire.', 'Preview unavailable. Open the message to read it.'));
                if (expanded && canExpand()) {
                    previewButton.setAttribute('aria-expanded','true');
                    summary.hidden = true;
                    text(preview,fullPreview);
                    preview.hidden = false;
                }
                syncPreviewControl();
                if (previewButton.hidden && document.activeElement === previewButton) button.focus({preventScroll:true});
                restorePosition();
            };
            state.reveal = reveal;
            previewButton.addEventListener('click', () => {
                if (previewLoading) return;
                rememberElementPosition(previewButton);
                if (previewButton.getAttribute('aria-expanded') === 'true') {
                    previewButton.setAttribute('aria-expanded','false');
                    summary.hidden = false; preview.hidden = true;
                    syncPreviewControl(); restorePosition();
                    return;
                }
                void reveal(true);
            });
            state.canExpand = canExpand;
            state.syncPreviewControl = syncPreviewControl;
            if (!previewResolved) {
                // A summary costs one full message fetch, so ask for it when the
                // reader actually points at the card instead of for every card
                // the viewport happens to cross.
                button.addEventListener('pointerenter', () => void reveal(), {once:true});
                button.addEventListener('focus', () => void reveal(), {once:true});
            }
            button.append(sender,recipient,date,summary);
            button.addEventListener('click', () => {
                if (context && active()) showMessage(state.entry,state.entry.key === entries.at(-1)?.key);
            });
            article.append(button,previewButton,preview);
            // Observe each card directly as well as its container. A late font,
            // excerpt or image can change a child's box without reliably changing
            // a constrained container's border box in every browser.
            observeGeometry(article);
            return article;
        }

        function syncCards(container, wanted) {
            const keep = new Set(wanted.map(entry => entry.key));
            [...container.children].forEach(node => {
                if (!keep.has(node.dataset.key)) { geometry?.unobserve(node); node.remove(); }
            });
            wanted.forEach((entry,index) => {
                const node = card(entry), position = container.children[index];
                if (position !== node) container.insertBefore(node,position || null);
            });
            schedulePreviewControls();
        }

        function render() {
            if (previewAccount !== account()) { previews.clear(); cards.clear(); previewAccount = account(); }
            const index = entries.findIndex(entry => entry.key === currentKey());
            const visible = active() && !!context && index >= 0
                && (entries.length > 1 || context.full || loading && !silentRefresh || error);
            before.hidden = !visible; after.hidden = !visible || index >= entries.length - 1;
            host.classList.toggle('pw-conversation-active', visible);
            currentLabel.hidden = !visible;
            text(fullButton,t('Voir l’échange complet', 'View full exchange'));
            fullButton.hidden = !document.documentElement.classList.contains('pw-theme') || !currentKey() || active();
            text(title,entries[0]?.raw.subject || t('(Sans objet)', '(No subject)'));
            title.hidden = loading && !silentRefresh;
            text(latestButton,t('Afficher le dernier message', 'Show latest message'));
            latestButton.hidden = !visible || index === entries.length - 1;
            text(scopeNote,context?.full ? t('Dossiers de ce compte, hors brouillons, corbeille, indésirables, rappels et envois programmés (sauf le dossier ouvert).',
                'Folders in this account, excluding drafts, trash, junk, reminders and scheduled mail (except the opened folder).') : '');
            text(singleButton,t('Revenir au message seul', 'Return to single message')); singleButton.hidden = !context?.full;
            text(status,loading && !silentRefresh ? t('Recherche des messages de la conversation…', 'Finding conversation messages…')
                : error ? t('Conversation incomplète.', 'Conversation incomplete.')
                    : context?.partial ? t('Échange partiel : certains dossiers ou résultats n’ont pas pu être parcourus.', 'Partial exchange: some folders or results could not be searched.')
                        : context?.missingMessageId ? t('Aucun identifiant de conversation dans ce message.', 'This message has no conversation identifier.')
                            : context?.full && entries.length === 1 ? t('Aucun autre message trouvé dans cette portée.', 'No other message found in this scope.') : '');
            text(retry,error ? t('Réessayer', 'Try again') : t('Actualiser l’échange', 'Refresh exchange'));
            retry.hidden = !error && !context?.full;
            syncCards(beforeCards,visible ? entries.slice(0,index) : []);
            syncCards(afterCards,visible ? entries.slice(index + 1) : []);
            const kept = new Set(entries.map(entry => entry.key));
            for (const [key] of cards) if (!kept.has(key)) cards.delete(key);
            restorePosition();
            // The immediate predecessor is the only automatic excerpt fetch.
            // All older bodies stay on demand, bounded to two concurrent reads.
            if (visible && index > 0) void cards.get(entries[index - 1].key)?.reveal();
        }

        // The whole walk runs server side on one IMAP connection. Doing it here
        // meant one HTTP request, one Nextcloud bootstrap and one IMAP login per
        // search; a long thread reached about thirty round trips per opened mail.
        async function collect(ctx, version) {
            const list = rl.app.messageList?.();
            const localThread = !ctx.full && list?.folder === ctx.folder && rl.app.messageList.threadUid?.()
                && [...list].some(message => itemKey(message) === ctx.originKey)
                ? [...list].map(message => ({raw:plain(message), model:message}))
                : null;
            // Plugin hooks answer through the native plugin dispatcher, not the
            // message action endpoint.
            const result = await new Promise((resolve, reject) => rl.pluginRemoteRequest(
                (code, data) => {
                    const value = data?.Result;
                    code || !value || value.error ? reject(new Error('conversation')) : resolve(value);
                },
                'PiedWebConversation', {
                    folder: ctx.folder,
                    uid: Number(ctx.origin.uid) || 0,
                    threadUid: localThread ? 0 : Number(ctx.threadUid) || 0,
                    threadAlgorithm: rl.settings.get('threadAlgorithm') || '',
                    messageId: ctx.origin.messageId || '',
                    inReplyTo: ctx.origin.inReplyTo || '',
                    references: ctx.origin.references || '',
                    scope: ctx.full ? 'account' : 'inbox',
                    etag: ctx.etag || ''
                }, 60000));
            if (!valid(version,ctx)) return null;
            ctx.etag = String(result.etag || '');
            ctx.partial = !!result.partial;
            ctx.missingMessageId = !!result.missingMessageId;
            // Unchanged mailbox: the endpoint answered from two STATUS commands and
            // returned no rows, so the entries already on screen stay authoritative.
            if (result.unchanged) return null;
            const rows = Array.isArray(result.messages) ? result.messages : [];
            return [...(localThread || []), ...rows.map(raw => ({raw}))];
        }

        async function scan(ctx, silent = false) {
            const version = ++generation, selectedBefore = currentKey();
            loading = true; error = false; silentRefresh = silent;
            if (!silent) render();
            let rows = null;
            try { rows = await collect(ctx,version); }
            // A failed walk leaves only the origin on screen, so the folder state
            // it was answered with no longer describes what is displayed: drop it,
            // or the next scan is answered "unchanged" and the stack never returns.
            catch { if (valid(version,ctx)) { error = true; ctx.etag = ''; } }
            if (!valid(version,ctx)) return;
            const repeat = () => {
                if (!ctx.needsRefresh || disposed || context !== ctx || !active() || document.hidden) return;
                ctx.needsRefresh = false; ctx.etag = '';
                queueMicrotask(() => { if (!loading) void scan(ctx,true); });
            };
            if (rows === null && !error) {
                loading = silentRefresh = false; render(); settle(); repeat(); return;
            }
            const combined = new Map();
            for (const row of [{raw:ctx.origin,model:ctx.originModel},...(rows || [])]) {
                const key = itemKey(row.raw);
                if (key && (!combined.has(key) || row.model)) combined.set(key,{...row,key});
            }
            const nextEntries = [...combined.values()].sort((a,b) =>
                Number(a.raw.dateTimestamp || 0) - Number(b.raw.dateTimestamp || 0)
                || a.key.localeCompare(b.key));
            const changed = entries.map(entry => entry.key).join('\n') !== nextEntries.map(entry => entry.key).join('\n');
            if (changed && !silent && !anchored)
                host.classList.add('pw-conversation-pending');
            entries = nextEntries;
            loading = silentRefresh = false; render();
            if (ctx.listFlag) reflectListFlag(ctx,ctx.listFlag);
            const latest = entries.at(-1);
            if (ctx.followLatest && latest && selectedBefore === currentKey() && currentKey() !== latest.key)
                showMessage(latest,true,true);
            else if (changed) requestAnimationFrame(settle);
            else settle();
            repeat();
        }

        function reset() {
            ++generation; context = null; entries = []; loading = error = silentRefresh = false;
            anchored = explicitOrigin = ''; viewportAnchor = null; cards.clear();
            host.classList.remove('pw-conversation-pending'); render();
        }
        function update() {
            if (disposed || !currentKey()) { reset(); return; }
            if (!active() || document.hidden) {
                ++generation; loading = silentRefresh = false;
                if (context) context.needsRefresh = true;
                host.classList.remove('pw-conversation-pending');
                render(); return;
            }
            if (context && account() === context.account && entries.some(entry => entry.key === currentKey())) {
                if (context.needsRefresh) { context.needsRefresh = false; void scan(context); }
                else { render(); settle(); }
                return;
            }
            if (vm.messageLoadingThrottle?.()) return;
            const source = current(), origin = plain(source);
            const threads = source.threads?.() || [];
            const full = explicitOrigin === itemKey(source);
            anchored = ''; viewportAnchor = null;
            host.classList.add('pw-conversation-pending');
            context = {account:account(), folder:source.folder, sent:sentFolder(), origin,
                originModel:source,originKey:itemKey(source),threadUid:threads.length > 1
                    ? source.uid : Number(rl.app.messageList?.threadUid?.() || 0),followLatest:!full,full};
            entries = [{raw:origin,model:source,key:context.originKey}];
            void scan(context);
        }
        const schedule = () => {
            if (observedKey !== currentKey()) {
                observedKey = currentKey(); manualDuringLoad = false; viewportAnchor = null;
            }
            if (active() && currentKey() && (!context || !entries.some(entry => entry.key === currentKey())))
                host.classList.add('pw-conversation-pending');
            // Coalesce native observables within this turn, without imposing a
            // second 160ms wait after the native reader has already loaded.
            clearTimeout(timer); timer = setTimeout(update,0);
        };
        latestButton.addEventListener('click', () => { const latest = entries.at(-1); if (latest) showMessage(latest,true); });
        fullButton.addEventListener('click', () => {
            explicitOrigin = currentKey(); context = null; entries = []; anchored = ''; manualDuringLoad = false;
            update();
        });
        singleButton.addEventListener('click', () => { reset(); render(); });
        retry.addEventListener('click', () => { if (context) void scan(context); });
        const subscriptions = [vm.message,vm.messageLoadingThrottle].filter(value => value?.subscribe)
            .map(value => value.subscribe(schedule));
        const theme = new MutationObserver(schedule);
        theme.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
        const wake = () => { if (!document.hidden) schedule(); };
        const messageSent = event => {
            const detail = event.detail || {}, key = itemKey(detail);
            if (!context || detail.account !== account() || !active() || !key
                || !entries.some(entry => entry.key === key)) return;
            context.followLatest = true;
            context.listFlag = detail.flag;
            reflectListFlag(context,detail.flag);
            context.etag = '';
            if (loading || document.hidden) context.needsRefresh = true;
            else void scan(context,true);
        };
        document.addEventListener('visibilitychange',wake);
        addEventListener('pw-message-sent',messageSent);
        const scroll = event => {
            const box = scroller();
            if (event.target === box && (!viewportAnchor || viewportAnchor.key !== currentKey()
                || Math.abs(viewportAnchor.scrollTop - box.scrollTop) > 0.5)) rememberPosition();
        };
        const manual = event => {
            if (event.type === 'keydown' && (!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)
                || event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
            manualDuringLoad = true;
        };
        dom.addEventListener('scroll',scroll,true);
        dom.addEventListener('wheel',manual,{passive:true});
        dom.addEventListener('touchstart',manual,{passive:true});
        dom.addEventListener('keydown',manual);
        geometry = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
            restorePosition();
            schedulePreviewControls();
        }) : null;
        [beforeCards,afterCards,item,header].forEach(observeGeometry);
        // ResizeObserver's default delivery differs for padding-only changes.
        // Attribute-driven late layout (lazy widgets, expanded previews, test
        // fixtures) gets the same anchor restoration path deterministically.
        const geometryMutations = new MutationObserver(restorePosition);
        geometryMutations.observe(host,{subtree:true,attributes:true,attributeFilter:['style','class','hidden']});
        host.addEventListener('load',restorePosition,true);
        // Cheap now: an unchanged mailbox answers from two IMAP STATUS commands.
        const poll = setInterval(() => {
            if (context && !context.full && active() && !loading && !document.hidden) void scan(context,true);
        },60000);
        schedule();
        ko.utils.domNodeDisposal.addDisposeCallback(dom, () => {
            disposed = true; reset(); clearTimeout(timer); clearInterval(poll); theme.disconnect();
            cancelAnimationFrame(previewControlFrame);
            previews.clear(); geometry?.disconnect(); geometryMutations.disconnect();
            dom.removeEventListener('scroll',scroll,true);
            dom.removeEventListener('wheel',manual); dom.removeEventListener('touchstart',manual);
            dom.removeEventListener('keydown',manual); host.removeEventListener('load',restorePosition,true);
            subscriptions.forEach(subscription => subscription.dispose());
            document.removeEventListener('visibilitychange',wake);
            removeEventListener('pw-message-sent',messageSent); before.remove(); after.remove(); fullButton.remove(); currentLabel.remove();
        });
    }

    function bootstrap() {
        if (typeof ko === 'undefined') return;
        const list = document.getElementById('V-MailMessageList');
        const reader = document.getElementById('V-MailMessageView');
        const candidateList = list && ko.dataFor(list);
        if (candidateList?.viewModelTemplateID === 'MailMessageList') listVM = candidateList;
        const candidateReader = reader && ko.dataFor(reader);
        if (candidateReader?.viewModelTemplateID === 'MailMessageView') mount(candidateReader);
    }
    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'MailMessageList') listVM = vm;
        else if (vm.viewModelTemplateID === 'MailMessageView') mount(vm);
    });
    bootstrapObserver = new MutationObserver(bootstrap);
    bootstrapObserver.observe(document.documentElement,{childList:true,subtree:true});
    queueMicrotask(bootstrap);
})();
