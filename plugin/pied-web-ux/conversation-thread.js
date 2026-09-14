/* One chronological reader stack for the current folder's thread and Sent replies. */
(() => {
    'use strict';
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const ids = value => String(value || '').match(/<[^<>\s]{1,255}>/g) || [];
    const normalize = value => String(value || '').toLowerCase();
    const itemKey = item => item?.folder && Number(item.uid) > 0 ? item.folder + '\u0000' + item.uid : '';
    const active = () => document.documentElement.classList.contains('pw-theme') && !!rl.settings.get('useThreads');
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
        const account = () => String(rl.settings.get('accountHash') || '');
        const sentFolder = () => String(rl.settings.get('SentFolder') || '');
        const current = () => vm.message?.();
        const currentKey = () => itemKey(current());
        const valid = (version, ctx) => !disposed && version === generation && context === ctx
            && account() === ctx.account && active() && !!currentKey()
            && (currentKey() === ctx.originKey || entries.some(entry => entry.key === currentKey()));
        const settle = () => {
            if (!loading && (!context?.followLatest || currentKey() === entries.at(-1)?.key)
                && !vm.messageLoadingThrottle?.()) host.classList.remove('pw-conversation-pending');
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
            summary.textContent = raw.subject || t('(Sans objet)', '(No subject)');
            button.append(sender,recipient,date,summary);
            button.addEventListener('click', () => {
                if (context && active()) showMessage(entry,entry.key === entries.at(-1)?.key);
            });
            article.append(button); return article;
        }

        function render() {
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

        async function search(folder, params, version, ctx) {
            const found = [];
            for (let offset = 0; offset < 200; offset += 50) {
                const response = await rl.app.Remote.post('MessageList', null,
                    {folder, offset, limit:50, sort:'REVERSE DATE', ...params}, 60000);
                if (!valid(version,ctx)) return [];
                const result = response?.Result, page = result?.['@Collection'];
                if (!Array.isArray(page) || result.folder?.name !== folder || Number(result.offset) !== offset)
                    throw new Error('message list');
                found.push(...page);
                if (page.length < 50 || offset + 50 >= Number(result.totalEmails || 0)) break;
            }
            return found;
        }

        async function collectFolder(ctx, version) {
            const list = rl.app.messageList?.();
            if (list?.folder === ctx.folder && rl.app.messageList.threadUid?.()
                && [...list].some(message => itemKey(message) === ctx.originKey)) {
                return [...list].map(message => ({raw:plain(message),model:message}));
            }
            if (!ctx.threadUid) return [];
            const rows = await search(ctx.folder, {search:'',useThreads:1,
                threadUid:ctx.threadUid,threadAlgorithm:rl.settings.get('threadAlgorithm') || ''}, version,ctx);
            return rows.filter(row => row.folder === ctx.folder).map(raw => ({raw}));
        }

        async function collectSent(ctx, folderRows, version) {
            const sent = ctx.sent; if (!sent) return [];
            const anchors = new Map();
            [ctx.origin,...folderRows.map(row => row.raw)].forEach(row => {
                ids(row.messageId).forEach(id => anchors.set(normalize(id),id));
            });
            const root = ids(ctx.origin.references)[0] || ids(ctx.origin.inReplyTo)[0]
                || ids(ctx.origin.messageId)[0];
            if (root) anchors.set(normalize(root),root);
            const found = new Map(), queue = [...anchors.values()], scanned = new Set();
            if (root) {
                const query = new URLSearchParams({header:'References ' + root}).toString();
                for (const raw of await search(sent,{search:query,useThreads:0},version,ctx)) {
                    if (raw.folder === sent && ids(raw.references).some(id => normalize(id) === normalize(root))) {
                        found.set(itemKey(raw),raw);
                        ids(raw.messageId).forEach(id => queue.push(id));
                    }
                }
            }
            while (queue.length && scanned.size < 20 && valid(version,ctx)) {
                const id = queue.shift(), normalized = normalize(id);
                if (scanned.has(normalized)) continue;
                scanned.add(normalized);
                const query = new URLSearchParams({header:'In-Reply-To ' + id}).toString();
                for (const raw of await search(sent,{search:query,useThreads:0},version,ctx)) {
                    if (raw.folder === sent && ids(raw.inReplyTo).some(value => normalize(value) === normalized)) {
                        found.set(itemKey(raw),raw);
                        ids(raw.messageId).forEach(value => queue.push(value));
                    }
                }
            }
            return [...found.values()].map(raw => ({raw}));
        }

        async function scan(ctx, silent = false) {
            const version = ++generation, selectedBefore = currentKey();
            loading = true; error = false; silentRefresh = silent;
            if (!silent) render();
            let folderRows = [], sentRows = [];
            try { folderRows = await collectFolder(ctx,version); }
            catch { if (valid(version,ctx)) error = true; }
            if (!valid(version,ctx)) return;
            try { sentRows = await collectSent(ctx,folderRows,version); }
            catch { if (valid(version,ctx)) error = true; }
            if (!valid(version,ctx)) return;
            const combined = new Map();
            for (const row of [{raw:ctx.origin,model:ctx.originModel},...folderRows,...sentRows]) {
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
            ++generation; context = null; entries = []; loading = error = silentRefresh = false;
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
        const poll = setInterval(() => { if (context && active() && !loading) void scan(context,true); },60000);
        schedule();
        ko.utils.domNodeDisposal.addDisposeCallback(dom, () => {
            disposed = true; reset(); clearTimeout(timer); clearInterval(poll); theme.disconnect();
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
