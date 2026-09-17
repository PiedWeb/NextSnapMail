/* One chronological reader stack for the current folder's thread and Sent replies. */
(() => {
    'use strict';
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const ids = value => String(value || '').match(/<[^<>\s]{1,255}>/g) || [];
    const normalize = value => String(value || '').toLowerCase();
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
        const retry = document.createElement('button'); retry.type = 'button'; retry.hidden = true;
        before.append(title,latestButton,status,beforeCards,retry); header.before(before);
        const after = document.createElement('section'); after.className = 'pw-conversation-after'; after.hidden = true;
        const afterCards = document.createElement('div'); afterCards.className = 'pw-conversation-cards';
        after.append(afterCards); item.after(after);

        let generation = 0, timer, disposed = false, context = null, entries = [];
        let loading = false, error = false, silentRefresh = false;
        let previewAccount = '', previewActive = 0;
        const previews = new Map();
        const previewQueue = [];
        const previewText = raw => {
            let value = String(ko.unwrap(raw.preview) || '').trim() || String(ko.unwrap(raw.plain) || '').trim();
            if (!value && raw.html) {
                const doc = new DOMParser().parseFromString(String(ko.unwrap(raw.html) || ''), 'text/html');
                doc.querySelectorAll('script,style,template,svg').forEach(node => node.remove());
                doc.querySelectorAll('br,p,div,li,tr,blockquote').forEach(node => node.before(' '));
                value = doc.body.textContent || '';
            }
            return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0,180);
        };
        const pumpPreviews = () => {
            while (previewActive < 2 && previewQueue.length) {
                const {entry,owner,resolve} = previewQueue.shift();
                if (disposed || owner !== account()) { resolve(''); continue; }
                ++previewActive;
                void rl.app.Remote.post('Message', null,
                    {folder:entry.raw.folder, uid:Number(entry.raw.uid)}, 60000)
                    .then(response => previewText(response?.Result || {})).catch(() => '')
                    .then(value => { resolve(value); --previewActive; pumpPreviews(); });
            }
        };
        const fetchPreview = entry => {
            if (previews.has(entry.key)) return previews.get(entry.key);
            const request = new Promise(resolve => previewQueue.push({entry,owner:account(),resolve}));
            previews.set(entry.key, request); pumpPreviews();
            return request;
        };
        const account = () => String(rl.settings.get('accountHash') || '');
        const sentFolder = () => String(rl.settings.get('SentFolder') || '');
        const current = () => vm.message?.();
        const currentKey = () => itemKey(current());
        const active = () => {
            const key = currentKey();
            const folder = context && entries.some(entry => entry.key === key) ? context.folder : current()?.folder;
            return document.documentElement.classList.contains('pw-theme')
                && !!rl.settings.get('useThreads') && isInbox(folder);
        };
        const valid = (version, ctx) => !disposed && version === generation && context === ctx
            && account() === ctx.account && active() && !!currentKey()
            && (currentKey() === ctx.originKey || entries.some(entry => entry.key === currentKey()));
        // Folded history sits above the open message, so a long conversation would
        // otherwise start the reader on its oldest card. Place the opened message
        // at the top of its scroller once, leaving the previous card in sight; a
        // manual scroll, a revealed summary and the silent refresh then keep the
        // position they find.
        const peek = 24;
        let anchored = '';
        const scroller = () => {
            for (let node = host; node && node !== document.body; node = node.parentElement)
                if (node.scrollHeight - node.clientHeight > 1
                    && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
            return null;
        };
        const anchor = () => {
            const key = currentKey();
            if (before.hidden || !key || anchored === key
                || host.classList.contains('pw-conversation-pending')) return;
            const box = scroller();
            if (!box) return;
            anchored = key;
            box.scrollTop = beforeCards.firstElementChild
                ? Math.max(0, box.scrollTop + header.getBoundingClientRect().top
                    - box.getBoundingClientRect().top - peek)
                : 0;
        };
        const settle = () => {
            if (!loading && (!context?.followLatest || currentKey() === entries.at(-1)?.key)
                && !vm.messageLoadingThrottle?.()) {
                host.classList.remove('pw-conversation-pending');
                anchor();
            }
        };

        function showMessage(entry, followLatest = false) {
            const callback = listVM?.selector?.oCallbacks?.ItemSelect;
            const CollectionModel = rl.app.messageList?.()?.constructor;
            const model = entry.model || CollectionModel?.reviveFromJson?.([entry.raw])?.[0];
            if (typeof callback !== 'function' || !model || itemKey(model) !== entry.key) {
                error = true; host.classList.remove('pw-conversation-pending'); render(); return;
            }
            context.followLatest = followLatest;
            callback(model); // Native reader fetch, attachments and actions use this message's real folder/UID.
        }

        function card(entry) {
            const raw = entry.raw, article = document.createElement('article');
            article.className = 'pw-conversation-card';
            const button = document.createElement('button'); button.type = 'button';
            button.className = 'pw-conversation-card-toggle';
            button.setAttribute('aria-expanded', 'false');
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
            const knownPreview = previewText(raw);
            summary.textContent = knownPreview;
            summary.hidden = !knownPreview;
            if (!knownPreview) {
                // A summary costs one full message fetch, so ask for it when the
                // reader actually points at the card instead of for every card
                // the viewport happens to cross.
                const reveal = () => {
                    const owner = account();
                    void fetchPreview(entry).then(value => {
                        if (!disposed && account() === owner && button.isConnected && value) {
                            summary.textContent = value; summary.hidden = false;
                        }
                    });
                };
                button.addEventListener('pointerenter', reveal, {once:true});
                button.addEventListener('focus', reveal, {once:true});
            }
            button.append(sender,recipient,date,summary);
            button.addEventListener('click', () => {
                if (context && active()) showMessage(entry,entry.key === entries.at(-1)?.key);
            });
            article.append(button); return article;
        }

        function render() {
            if (previewAccount !== account()) { previews.clear(); previewAccount = account(); }
            const index = entries.findIndex(entry => entry.key === currentKey());
            const visible = active() && !!context && index >= 0
                && (entries.length > 1 || loading && !silentRefresh || error);
            before.hidden = !visible; after.hidden = !visible || index >= entries.length - 1;
            host.classList.toggle('pw-conversation-active', visible);
            title.textContent = entries[0]?.raw.subject || t('(Sans objet)', '(No subject)');
            title.hidden = loading && !silentRefresh;
            latestButton.textContent = t('Afficher le dernier message', 'Show latest message');
            latestButton.hidden = !visible || index === entries.length - 1;
            status.textContent = loading && !silentRefresh ? t('Recherche des messages de la conversation…', 'Finding conversation messages…')
                : error ? t('Conversation incomplète.', 'Conversation incomplete.') : '';
            retry.textContent = t('Réessayer', 'Try again'); retry.hidden = !error;
            beforeCards.replaceChildren(); afterCards.replaceChildren();
            if (!visible) return;
            entries.forEach((entry, position) => {
                if (position < index) beforeCards.append(card(entry));
                else if (position > index) afterCards.append(card(entry));
            });
        }

        // The whole walk runs server side on one IMAP connection. Doing it here
        // meant one HTTP request, one Nextcloud bootstrap and one IMAP login per
        // search; a long thread reached about thirty round trips per opened mail.
        async function collect(ctx, version) {
            const list = rl.app.messageList?.();
            const localThread = list?.folder === ctx.folder && rl.app.messageList.threadUid?.()
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
                    etag: ctx.etag || ''
                }, 60000));
            if (!valid(version,ctx)) return null;
            ctx.etag = String(result.etag || '');
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
            if (rows === null && !error) { loading = silentRefresh = false; render(); settle(); return; }
            const combined = new Map();
            for (const row of [{raw:ctx.origin,model:ctx.originModel},...(rows || [])]) {
                const key = itemKey(row.raw);
                if (key && (!combined.has(key) || row.model)) combined.set(key,{...row,key});
            }
            const nextEntries = [...combined.values()].sort((a,b) =>
                Number(a.raw.dateTimestamp || 0) - Number(b.raw.dateTimestamp || 0)
                || a.key.localeCompare(b.key));
            const changed = entries.map(entry => entry.key).join('\n') !== nextEntries.map(entry => entry.key).join('\n');
            if (changed)
                host.classList.add('pw-conversation-pending');
            entries = nextEntries;
            loading = silentRefresh = false; render();
            const latest = entries.at(-1);
            if (ctx.followLatest && latest && selectedBefore === currentKey() && currentKey() !== latest.key)
                showMessage(latest,true);
            else if (changed) requestAnimationFrame(settle);
            else settle();
        }

        function reset() {
            ++generation; context = null; entries = []; loading = error = silentRefresh = false; anchored = '';
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
            host.classList.add('pw-conversation-pending');
            context = {account:account(), folder:source.folder, sent:sentFolder(), origin,
                originModel:source,originKey:itemKey(source),threadUid:threads.length > 1
                    ? source.uid : Number(rl.app.messageList?.threadUid?.() || 0),followLatest:true};
            entries = [{raw:origin,model:source,key:context.originKey}];
            void scan(context);
        }
        const schedule = () => {
            if (active() && currentKey() && (!context || !entries.some(entry => entry.key === currentKey())))
                host.classList.add('pw-conversation-pending');
            clearTimeout(timer); timer = setTimeout(update,context ? 160 : 0);
        };
        latestButton.addEventListener('click', () => { const latest = entries.at(-1); if (latest) showMessage(latest,true); });
        retry.addEventListener('click', () => { if (context) void scan(context); });
        const subscriptions = [vm.message,vm.messageLoadingThrottle].filter(value => value?.subscribe)
            .map(value => value.subscribe(schedule));
        const theme = new MutationObserver(schedule);
        theme.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
        const wake = () => { if (!document.hidden) schedule(); };
        document.addEventListener('visibilitychange',wake);
        // Cheap now: an unchanged mailbox answers from two IMAP STATUS commands.
        const poll = setInterval(() => {
            if (context && active() && !loading && !document.hidden) void scan(context,true);
        },60000);
        schedule();
        ko.utils.domNodeDisposal.addDisposeCallback(dom, () => {
            disposed = true; reset(); clearTimeout(timer); clearInterval(poll); theme.disconnect();
            previews.clear();
            subscriptions.forEach(subscription => subscription.dispose());
            document.removeEventListener('visibilitychange',wake); before.remove(); after.remove();
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
