/* A read-only Sent view inside the native, folder-scoped conversation list. */
(() => {
    'use strict';
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const ids = value => String(value || '').match(/<[^<>\s]{1,255}>/g) || [];
    const key = value => String(value || '').toLowerCase();
    const active = () => document.documentElement.classList.contains('pw-theme');

    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID !== 'MailMessageList' || vm.pwConversationThread) return;
        const list = vm.messageList, dom = vm.viewModelDom;
        const content = dom?.querySelector('.messageList > .b-content');
        if (!content) return;
        vm.pwConversationThread = true;

        const section = document.createElement('section');
        section.className = 'pw-conversation-sent'; section.hidden = true;
        const heading = document.createElement('h2');
        const rows = document.createElement('div'); rows.className = 'pw-conversation-sent-rows';
        const status = document.createElement('p'); status.setAttribute('role', 'status');
        const retry = document.createElement('button'); retry.type = 'button'; retry.hidden = true;
        section.append(heading,rows,status,retry); content.append(section);

        let generation = 0, timer, disposed = false, loading = false, error = false;
        let entries = [], sent = '', anchor = '', CollectionModel;
        const sentFolder = () => String(rl.settings.get('SentFolder') || '');
        const source = () => String(list()?.folder || '');
        const eligible = () => active() && !!list.threadUid?.() && !list.loading?.()
            && !!source() && !!sentFolder() && source() !== sentFolder() && !!list()?.length;
        const rootId = () => {
            const messages = [...(list() || [])].filter(message => ids(message.messageId).length);
            const present = new Set(messages.map(message => key(ids(message.messageId)[0])));
            const roots = messages.filter(message => !ids(message.inReplyTo).some(id => present.has(key(id))));
            return ids((roots.length ? roots : messages).sort((a,b) =>
                Number(a.dateTimestamp?.() || 0) - Number(b.dateTimestamp?.() || 0))[0]?.messageId)[0] || '';
        };
        const currentScope = () => JSON.stringify([
            rl.settings.get('accountHash'), source(), list.threadUid?.(), sentFolder(), rootId()
        ]);
        const valid = (version, snapshot) => !disposed && version === generation
            && snapshot === currentScope() && eligible();
        const place = () => [...content.querySelectorAll('.messageListPlace')].at(-1)?.after(section);

        function render() {
            place();
            heading.textContent = t('Réponses envoyées dans cette conversation', 'Sent replies in this conversation');
            retry.textContent = t('Réessayer', 'Try again');
            const visible = eligible() && !!anchor && (loading || error || entries.length);
            section.hidden = !visible;
            status.textContent = loading ? t('Recherche dans Envoyés…', 'Searching Sent…')
                : error ? t('Réponses envoyées indisponibles.', 'Sent replies unavailable.') : '';
            const focused = section.contains(document.activeElement) ? document.activeElement.dataset.uid : null;
            retry.hidden = !error; rows.replaceChildren();
            if (!visible || error) return;
            entries.forEach(item => {
                const button = document.createElement('button'); button.type = 'button';
                button.className = 'pw-conversation-sent-row'; button.dataset.uid = String(item.uid);
                const label = document.createElement('span'); label.className = 'pw-conversation-sent-label';
                label.textContent = t('Envoyé', 'Sent');
                const subject = document.createElement('span'); subject.className = 'pw-conversation-sent-subject';
                subject.textContent = item.subject || t('(Sans objet)', '(No subject)');
                const recipient = document.createElement('span'); recipient.className = 'pw-conversation-sent-recipient';
                const addresses = item.to?.['@Collection'] || item.to || [];
                const to = Array.isArray(addresses) ? addresses : [];
                recipient.textContent = t('À : ', 'To: ') + to.map(address => address.name || address.email).filter(Boolean).join(', ');
                const date = document.createElement('time');
                const stamp = Number(item.dateTimestamp);
                if (stamp > 0 && Number.isFinite(stamp) && Number.isFinite(new Date(stamp * 1000).getTime())) {
                    const value = new Date(stamp * 1000);
                    date.dateTime = value.toISOString();
                    date.textContent = value.toLocaleDateString(document.documentElement.lang || 'fr', {day:'numeric',month:'short'});
                    date.title = value.toLocaleString();
                }
                button.setAttribute('aria-label', [label.textContent, recipient.textContent, subject.textContent].filter(Boolean).join(' — '));
                button.append(label,recipient,subject,date);
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    if (!eligible() || !CollectionModel || !vm.selector?.oCallbacks?.ItemSelect) return;
                    const message = CollectionModel.reviveFromJson([item])[0];
                    if (!message || message.folder !== sent || Number(message.uid) !== Number(item.uid)) return;
                    vm.selector.unselect();
                    vm.selector.oCallbacks.ItemSelect(message); // Native reader fetch, flags and actions use Sent/UID.
                    rows.querySelectorAll('button').forEach(row => row.removeAttribute('aria-current'));
                    button.setAttribute('aria-current', 'true');
                });
                rows.append(button);
            });
            if (focused) [...rows.querySelectorAll('button')].find(button => button.dataset.uid === focused)?.focus();
        }

        async function search(field, id, version, snapshot) {
            const found = [], query = new URLSearchParams({header:field + ' ' + id}).toString();
            for (let offset = 0; offset < 200; offset += 50) {
                const response = await rl.app.Remote.post('MessageList', null,
                    {folder:sent,offset,limit:50,sort:'REVERSE DATE',search:query,useThreads:0}, 60000);
                if (!valid(version,snapshot)) return [];
                const result = response?.Result, page = result?.['@Collection'];
                if (!Array.isArray(page) || result.folder?.name !== sent || Number(result.offset) !== offset) throw new Error('response');
                found.push(...page);
                if (page.length < 50 || offset + 50 >= Number(result.totalEmails || 0)) break;
            }
            return found;
        }

        async function refresh() {
            if (!eligible() || disposed || document.hidden) { ++generation; entries = []; anchor = ''; loading = false; error = false; render(); return; }
            const id = rootId(); if (!id) { ++generation; entries = []; anchor = ''; render(); return; }
            const version = ++generation, snapshot = currentScope();
            const collection = list()?.constructor;
            if (typeof collection?.reviveFromJson !== 'function') { entries = []; error = true; render(); return; }
            CollectionModel = collection; sent = sentFolder(); anchor = id;
            entries = []; loading = true; error = false; render();
            try {
                const references = await search('References', id, version, snapshot);
                if (!valid(version,snapshot)) return;
                const direct = await search('In-Reply-To', id, version, snapshot);
                if (!valid(version,snapshot)) return;
                const existing = new Set(list().map(message => key(ids(message.messageId)[0])));
                const seen = new Set();
                entries = [...references,...direct].filter(item => {
                    const uid = Number(item?.uid), ownId = key(ids(item?.messageId)[0]);
                    if (item?.folder !== sent || !Number.isInteger(uid) || uid < 1 || seen.has(uid)
                        || (ownId && existing.has(ownId))
                        || ![...ids(item.references),...ids(item.inReplyTo)].some(value => key(value) === key(id))) return false;
                    seen.add(uid); return true;
                }).sort((a,b) => Number(a.dateTimestamp || 0) - Number(b.dateTimestamp || 0));
            } catch {
                if (valid(version,snapshot)) error = true;
            } finally {
                if (version === generation) { loading = false; render(); }
            }
        }
        const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 160); };
        retry.addEventListener('click', schedule);
        const subscriptions = [list,list.loading,list.threadUid].filter(value => value?.subscribe)
            .map(value => value.subscribe(schedule));
        const theme = new MutationObserver(schedule);
        theme.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
        const wake = () => { if (!document.hidden) schedule(); };
        document.addEventListener('visibilitychange',wake);
        const poll = setInterval(() => { if (eligible() && !loading) schedule(); },60000);
        schedule();
        ko.utils.domNodeDisposal.addDisposeCallback(dom, () => {
            disposed = true; ++generation; clearTimeout(timer); clearInterval(poll); theme.disconnect();
            subscriptions.forEach(subscription => subscription.dispose());
            document.removeEventListener('visibilitychange',wake); section.remove();
        });
    });
})();
