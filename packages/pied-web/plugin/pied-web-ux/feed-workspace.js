/* Global rows and server-search share one account-safe selection and keyboard contract. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const t = (fr,en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const unwrap = value => typeof value === 'function' ? value() : value;
    const key = item => [item._pwAccountHash,item.folder,item._pwUidValidity || item.uidValidity,item.uid].join('\x1f');
    const identity = (item,uid = item.uid) => ({accountHash:item._pwAccountHash,folder:item.folder,
        uidValidity:Number(item._pwUidValidity || item.uidValidity),uid:Number(uid)});
    // A Feed row may represent a complete native thread. Keep every member in
    // the same immutable account/folder/UIDVALIDITY scope as its root so quick
    // and bulk actions cannot leave hidden messages behind.
    const identities = item => [...new Set([item.uid,...(Array.isArray(item.threads) ? item.threads : [])]
        .map(Number).filter(uid => Number.isSafeInteger(uid) && uid > 0 && uid <= 4294967295))]
        .map(uid => identity(item,uid));
    const editable = node => node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
    api.createFeedWorkspace = options => {
        const {vm,section,rows,status,refreshButton} = options, dom = vm.viewModelDom;
        let items = [], accounts = [], loading = false, selected = new Set(), focused = '', anchor = '',
            searchState = null, generation = 0, snapshot = null, busy = false, keyboardEntered = false;
        const nodes = new Map(), headings = new Map(), desktopActions = matchMedia('(min-width:800px)');
        let sharedRowActions = null, actionRow = null;
        const scopeBar = document.createElement('div'); scopeBar.className = 'pw-list-scope';
        const scopeLabel = document.createElement('strong'); scopeLabel.className = 'pw-list-scope-label';
        const searchScope = document.createElement('select'); searchScope.setAttribute('aria-label',t('Portée de la recherche','Search scope'));
        [['folder',t('Ce dossier','This folder')],['account',t('Tous les dossiers du compte','All folders in this account')],['global',t('Tous mes comptes','All my accounts')]]
            .forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; searchScope.append(option); });
        scopeBar.append(scopeLabel,searchScope); dom.querySelector(':scope > .btn-toolbar')?.after(scopeBar);
        const controls = document.createElement('div'); controls.className = 'pw-global-selection';
        const allLabel = document.createElement('label'), all = document.createElement('input'); all.type = 'checkbox';
        all.setAttribute('aria-label',t('Sélectionner les messages de cette page','Select messages on this page'));
        allLabel.append(all,document.createTextNode(t('Cette page','This page')));
        const count = document.createElement('span'); count.setAttribute('role','status');
        const allResults = document.createElement('button'); allResults.type = 'button';
        const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = t('Terminer','Done');
        const actions = document.createElement('span'); actions.className = 'pw-global-bulk-actions';
        const actionButtons = [];
        [['read',t('Marquer lu','Mark read')],['unread',t('Marquer non lu','Mark unread')],['trash',t('Supprimer','Delete')]].forEach(([action,label]) => {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
            button.addEventListener('click',() => void execute(action).catch(() => {})); actions.append(button); actionButtons.push(button);
        });
        const remind = document.createElement('button'); remind.type = 'button'; remind.textContent = t('Me le rappeler','Remind me');
        remind.addEventListener('click',() => api.reminders?.choose(remind,date => execute('remind',{remindAt:date.toISOString()})));
        actions.append(remind); actionButtons.push(remind);
        controls.append(allLabel,count,allResults,actions,clear); section.querySelector('header')?.after(controls);
        const pager = document.createElement('nav'); pager.className = 'pw-global-pager'; pager.setAttribute('aria-label',t('Pages des résultats','Result pages'));
        const previous = document.createElement('button'), next = document.createElement('button'), pageLabel = document.createElement('span');
        previous.type = next.type = 'button'; previous.textContent = t('Précédent','Previous'); next.textContent = t('Suivant','Next');
        pager.append(previous,pageLabel,next); section.append(pager); pager.hidden = true;
        const rowScope = item => ({items:JSON.stringify(identities(item))});
        const currentItems = () => items;
        const selectChanged = () => {
            const visible = currentItems(), n = snapshot ? Number(snapshot.count) : selected.size;
            all.checked = !!visible.length && visible.every(item => selected.has(key(item)));
            all.indeterminate = !!n && !all.checked;
            all.disabled = busy || loading || !visible.length;
            all.setAttribute('aria-checked',all.indeterminate ? 'mixed' : String(all.checked));
            count.textContent = n ? t(`${n} message(s) sélectionné(s)`,`${n} message(s) selected`) : '';
            clear.hidden = !n; clear.disabled = busy; actions.hidden = !n;
            actionButtons.forEach(button => button.disabled = busy || loading || !n);
            remind.hidden = snapshot ? !!snapshot.groups?.some(group => !/^inbox$/i.test(group.folder))
                : visible.filter(item => selected.has(key(item))).some(item => !/^inbox$/i.test(item.folder));
            allResults.hidden = busy || loading || !visible.length || !all.checked || !!snapshot;
            allResults.textContent = searchState
                ? t(`Sélectionner les ${searchState.total} résultats`, `Select all ${searchState.total} results`)
                : t('Sélectionner toutes les boîtes de réception…','Select all inboxes…');
            for (const [id,node] of nodes) {
                node.classList.toggle('checked',selected.has(id)); node.setAttribute('aria-selected',String(selected.has(id)));
                node.classList.toggle('focused',id === focused); node.tabIndex = id === focused ? 0 : -1;
            }
        };
        const resetSelection = () => { snapshot = null; selected.clear(); anchor = ''; selectChanged(); };
        all.addEventListener('change',() => {
            snapshot = null; selected = all.checked ? new Set(currentItems().map(key)) : new Set(); selectChanged();
        });
        clear.addEventListener('click',resetSelection);
        const selectRange = id => {
            const ids = currentItems().map(key), from = ids.indexOf(anchor || focused), to = ids.indexOf(id);
            if (from < 0 || to < 0) return;
            for (let i = Math.min(from,to); i <= Math.max(from,to); i++) selected.add(ids[i]);
        };
        const focus = id => {
            focused = id; keyboardEntered = true; selectChanged(); const node = nodes.get(id); node?.focus({preventScroll:true}); node?.scrollIntoView({block:'nearest'});
        };
        const toggle = id => { snapshot = null; selected.has(id) ? selected.delete(id) : selected.add(id); anchor = id; selectChanged(); };
        const open = item => { options.beforeOpen?.({search:searchState?.query || '',scope:searchScope.value,offset:searchState?.offset || 0,key:key(item),scroll:section.parentElement?.scrollTop || 0}); options.open(item); };
        const createRowActions = (node,allowReminder) => {
            const group = api.mailbox.rowActions(() => rowScope(node.pwItem),() => refreshResults(),{
                reminder:allowReminder,
                flagged:() => (node.pwItem.flags || []).some(flag => String(flag).toLowerCase() === '\\flagged')
            });
            group.setAttribute('role','gridcell'); return group;
        };
        // Desktop needs actions only on the hovered/focused row. Reusing this
        // group avoids hundreds of hidden SVG/button nodes in a large Feed;
        // touch layouts keep visible actions on every row.
        const attachRowActions = node => {
            if (!api.mailbox || !desktopActions.matches || !node?.pwItem) return;
            actionRow = node;
            if (!sharedRowActions) {
                sharedRowActions = api.mailbox.rowActions(() => rowScope(actionRow.pwItem),() => refreshResults(),{
                    reminder:true,
                    flagged:() => (actionRow.pwItem.flags || []).some(flag => String(flag).toLowerCase() === '\\flagged')
                });
                sharedRowActions.setAttribute('role','gridcell');
            }
            sharedRowActions.pwSync?.();
            const remindAction = sharedRowActions.querySelector('.pw-remind-action');
            if (remindAction) remindAction.hidden = !/^inbox$/i.test(node.pwItem.folder);
            node.append(sharedRowActions);
        };
        const makeRow = item => {
            const node = document.createElement('div'); node.className = 'pw-global-row'; node.setAttribute('role','row'); node.tabIndex = -1;
            const main = document.createElement('span'); main.className = 'pw-global-primary';
            const subject = document.createElement('span'); subject.className = 'pw-global-subject';
            const account = document.createElement('span'); account.className = 'pw-global-account';
            const time = document.createElement('time'); time.className = 'pw-global-time';
            [main,subject,account,time].forEach(cell => cell.setAttribute('role','gridcell'));
            node.append(main,subject,account,time);
            node.addEventListener('click',event => {
                if (loading || busy || event.target.closest('button')) return;
                const current = node.pwItem, id = key(current); focused = id;
                if (event.shiftKey) { snapshot = null; selectRange(id); selectChanged(); }
                else if (event.ctrlKey || event.metaKey || selected.size) toggle(id);
                else { anchor = id; open(current); }
            });
            node.addEventListener('pointerenter',() => attachRowActions(node));
            node.addEventListener('focus',() => { focused = key(node.pwItem); keyboardEntered = true; attachRowActions(node); selectChanged(); });
            // Native list uses long touch to select; keep the same 550 ms contract.
            let hold, origin;
            node.addEventListener('pointerdown',event => {
                if (busy || loading || event.pointerType !== 'touch' || event.target.closest('button')) return;
                origin = {x:event.clientX,y:event.clientY};
                hold = setTimeout(() => { toggle(key(node.pwItem)); node.pwSuppressClick = true; },550);
            });
            node.addEventListener('pointermove',event => { if (origin && Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>10) clearTimeout(hold); });
            ['pointerup','pointercancel'].forEach(type => node.addEventListener(type,() => { clearTimeout(hold); origin = null; }));
            node.addEventListener('click',event => { if (node.pwSuppressClick) { node.pwSuppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); } },true);
            return node;
        };
        const paint = () => {
            const activeElement = rows.contains(document.activeElement) ? document.activeElement : null;
            const ids = new Set(items.map(key));
            for (const [id,node] of nodes) if (!ids.has(id)) { node.remove(); nodes.delete(id); selected.delete(id); }
            if (!ids.has(focused)) focused = items.length ? key(items[0]) : '';
            let lastRank, previousNode = null; const activeHeadings = new Set();
            const position = node => {
                const expected = previousNode ? previousNode.nextSibling : rows.firstChild;
                if (expected !== node) rows.insertBefore(node,expected); previousNode = node;
            };
            for (const item of items) {
                const id = key(item), rank = options.rank(item);
                if (!searchState && rank !== lastRank) {
                    let heading = headings.get(rank);
                    if (!heading) { heading = document.createElement('h2'); heading.setAttribute('role','presentation'); headings.set(rank,heading); }
                    heading.textContent = options.sectionTitle(rank); position(heading); activeHeadings.add(rank); lastRank = rank;
                }
                let node = nodes.get(id); if (!node) { node = makeRow(item); nodes.set(id,node); }
                node.pwItem = item;
                node.classList.toggle('pw-global-unread',options.unseen(item));
                node.classList.toggle('pw-global-thread-unread',!options.unseen(item) && rank === 1);
                node.classList.toggle('pw-global-draft',item._pwKind === 'draft');
                const texts = {'.pw-global-primary':options.primary(item),'.pw-global-subject':item.subject || t('(Sans objet)','(No subject)'),
                    '.pw-global-account':options.accountText(item) + (searchState ? ' · ' + item.folder : ''),'.pw-global-time':options.dateText(item)};
                Object.entries(texts).forEach(([selector,text]) => { const el = node.querySelector(selector); if (el.textContent !== text) el.textContent = text; });
                if (desktopActions.matches) { if (actionRow === node) attachRowActions(node); }
                else if (!node.querySelector('.pw-row-actions') && api.mailbox) node.append(createRowActions(node,/^inbox$/i.test(item.folder)));
                position(node);
            }
            for (const [rank,heading] of headings) if (!activeHeadings.has(rank)) heading.remove();
            rows.setAttribute('role','grid'); rows.setAttribute('aria-multiselectable','true'); rows.setAttribute('aria-label',t('Messages','Messages'));
            rows.setAttribute('aria-busy',String(loading));
            const failed = accounts.filter(account => account.error).length;
            status.textContent = loading ? t('Chargement…','Loading…') : failed
                ? t(`${failed} compte(s) indisponible(s). Résultats partiels.`,`${failed} account(s) unavailable. Partial results.`)
                : searchState ? t(`${searchState.total} résultat(s). Corbeille et Indésirables exclus.`,`${searchState.total} result(s). Trash and Junk excluded.`)
                : !items.length ? t('Aucun message à afficher.','No messages to show.') : '';
            refreshButton.disabled = loading; refreshButton.setAttribute('aria-busy',String(loading));
            pager.hidden = !searchState || searchState.total <= searchState.limit;
            previous.disabled = loading || !searchState?.offset;
            next.disabled = loading || !searchState || searchState.offset + searchState.limit >= searchState.total;
            pageLabel.textContent = searchState ? `${Math.floor(searchState.offset/searchState.limit)+1} / ${Math.max(1,Math.ceil(searchState.total/searchState.limit))}` : '';
            selectChanged(); updateScope();
            if (activeElement?.isConnected && document.activeElement !== activeElement) activeElement.focus({preventScroll:true});
        };
        const updateScope = () => {
            const global = options.mode() === 'global';
            scopeLabel.textContent = searchState ? t('Résultats de recherche','Search results') : global ? t('Tous mes comptes','All my accounts')
                : [options.accountLabel(), options.mode() === 'feed' ? t('Flux','Feed') : options.folderLabel()].filter(Boolean).join(' · ');
            searchScope.querySelector('option[value="global"]').hidden = options.accountCount() < 2;
            if (!searchState && searchScope.dataset.mode !== options.mode()) {
                searchScope.value = global ? 'global' : 'folder'; searchScope.dataset.mode = options.mode();
            }
        };
        const search = async (query,offset = 0,reuse = false) => {
            query = String(query).trim();
            if (!query) { searchState = null; loading = false; ++generation; resetSelection(); options.render(true); return; }
            const current = ++generation, previousState = searchState;
            searchState = {query,offset,limit:50,total:previousState?.total || 0,token:reuse ? previousState?.token : ''};
            const params = {operation:'search',search:query,scope:searchScope.value === 'folder' ? 'folder' : 'all',folder:options.folder(),offset,limit:50};
            if (searchScope.value !== 'global') params.accountHashes = JSON.stringify([options.accountHash()]);
            if (reuse && searchState.token) params.searchToken = searchState.token;
            loading = true; items = []; resetSelection(); options.render(); paint();
            try {
                const result = await api.mailbox.request(params);
                if (current !== generation) return;
                if (!Array.isArray(result.items)) throw new Error('mail');
                searchState = {...searchState,total:Number(result.total),token:result.searchToken,limit:Number(result.limit || 50),offset:Number(result.offset || 0)};
                items = result.items; accounts = result.accounts || []; loading = false; paint();
            } catch (error) {
                if (current !== generation) return;
                loading = false; items = []; searchState.total = 0; searchState.token = ''; paint(); status.textContent = api.mailbox.reason(error);
            }
        };
        previous.addEventListener('click',() => search(searchState.query,Math.max(0,searchState.offset-searchState.limit),true));
        next.addEventListener('click',() => search(searchState.query,searchState.offset+searchState.limit,true));
        searchScope.addEventListener('change',() => { ++generation; resetSelection(); const input = dom.querySelector('.inputSearch,input[type="search"]'); if (input?.value.trim()) search(input.value); else if (searchState) search(''); });
        const mailUi = window.rl.mailUi = window.rl.mailUi || {}, priorSearch = mailUi.onSearch;
        const onSearch = query => {
            if (active() && section.isConnected && (options.mode() === 'global' || searchState || searchScope.value !== 'folder')) {
                void search(query); return true;
            }
            return priorSearch?.(query) || false;
        };
        mailUi.onSearch = onSearch;
        dom.addEventListener('keydown',event => {
            if (event.key !== 'Enter' || !event.target.matches?.('.inputSearch,input[type="search"]') || event.isComposing) return;
            if (options.mode() !== 'global' && searchScope.value === 'folder' && !searchState) return;
            event.preventDefault(); event.stopImmediatePropagation(); search(event.target.value);
        },true);
        dom.querySelector('.inputSearch,input[type="search"]')?.addEventListener('search',event => { if (!event.target.value && searchState) search(''); });
        const execute = async (action,extra = {}) => {
            if (busy || loading || (!snapshot && !selected.size)) return;
            const current = generation;
            busy = true; selectChanged();
            try {
                const prepared = snapshot || await api.mailbox.prepare({items:JSON.stringify(items
                    .filter(item => selected.has(key(item))).flatMap(identities))});
                const result = await api.mailbox.run(prepared,action,extra,(cursor,total) => { status.textContent = `${cursor} / ${total}`; });
                if (current === generation) { resetSelection(); await refreshResults(); }
                return {...result,...extra};
            } catch (error) { if (current === generation) status.textContent = api.mailbox.reason(error); throw error; }
            finally { busy = false; selectChanged(); }
        };
        allResults.addEventListener('click',async () => {
            if (busy || loading) return;
            const current = generation;
            busy = true; selectChanged();
            try {
                const params = searchState ? {searchToken:searchState.token} : {scope:'inbox',search:''};
                const prepared = await api.mailbox.prepare(params);
                if (current !== generation) return;
                snapshot = prepared;
                selected = new Set(items.filter(item => searchState || /^inbox$/i.test(item.folder)).map(key));
                status.textContent = t(`${snapshot.count} messages, toutes pages incluses, dans ${snapshot.groups?.length || 0} dossier(s).`,
                    `${snapshot.count} messages, all pages included, in ${snapshot.groups?.length || 0} folder(s).`)
                    + (snapshot.partial ? t(' Certains comptes sont indisponibles.',' Some accounts are unavailable.') : '');
            } catch (error) { if (current === generation) status.textContent = api.mailbox.reason(error); }
            finally { busy = false; selectChanged(); }
        });
        const refreshResults = () => searchState ? search(searchState.query) : options.refresh();
        refreshButton.addEventListener('click',event => { if (searchState) { event.stopImmediatePropagation(); void refreshResults(); } },true);
        const onKey = event => {
            if (!section.isConnected || section.hidden || !active() || event.isComposing || event.altKey || editable(event.target) || vm.popupVisibility?.()
                || document.querySelector('dialog[open]:not(.pw-inline-reply),.pw-reminder-panel,.dropdown-menu.show,.dropdown.show')) return;
            if (event.target.closest?.('[role="menu"],.dropdown-menu')) return;
            const inList = dom.contains(event.target), bodyFocus = event.target === document.body
                && (dom.classList.contains('focused') || keyboardEntered)
                && !document.querySelector('#V-MailFolderList.focused,#V-MailMessageView.focused');
            if (!inList && !bodyFocus) return;
            if (event.target.closest?.('button,a,[role="button"]') && ['Enter',' '].includes(event.key)) {
                event.stopImmediatePropagation(); return; // preserve the button's own default activation
            }
            const ids = items.map(key), index = Math.max(0,ids.indexOf(focused)); let target;
            const modifier = event.ctrlKey || event.metaKey, lower = event.key.toLowerCase();
            // Native message shortcuts must never act on the hidden account list.
            if (modifier && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.stopImmediatePropagation(); return; }
            if ((!modifier && ['z','i','t','insert','r','a','f','b','mailreply','mailforward'].includes(lower))
                || (modifier && lower === 'i') || (event.shiftKey && event.key === 'Delete')) {
                event.preventDefault(); event.stopImmediatePropagation();
                status.textContent = t('Ouvrez un message pour utiliser cette action.','Open a message to use this action.'); return;
            }
            if ((busy || loading) && ['Delete','Enter','ArrowRight',' ','q','u'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
            if (modifier && lower === 'r') void refreshResults();
            else if (event.key === 'ArrowDown') target = ids[Math.min(ids.length-1,index+1)];
            else if (event.key === 'ArrowUp') target = ids[Math.max(0,index-1)];
            else if (event.key === 'PageDown') target = ids[Math.min(ids.length-1,index+10)];
            else if (event.key === 'PageUp') target = ids[Math.max(0,index-10)];
            else if (event.key === 'Home') target = ids[0];
            else if (event.key === 'End') target = ids.at(-1);
            else if (['Enter','ArrowRight'].includes(event.key) && focused) open(items.find(item => key(item) === focused));
            else if (event.key === ' ' && focused) toggle(focused);
            else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { selected = new Set(ids); snapshot = null; selectChanged(); }
            else if (event.key === 'Escape') { if (selected.size || snapshot) resetSelection(); else if (searchState) search(''); else return; }
            else if (event.key === 'Delete') { if (!event.repeat && (selected.size || focused)) { if (!selected.size) selected.add(focused); void execute('trash').catch(() => {}); } }
            else if (!event.ctrlKey && !event.metaKey && ['q','u'].includes(event.key.toLowerCase())) { if (!selected.size && focused) selected.add(focused); void execute(event.key.toLowerCase()==='q'?'read':'unread').catch(() => {}); }
            else return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (target) { if (event.shiftKey) { if (!anchor) anchor = focused; snapshot = null; selectRange(target); } else anchor = target; focus(target); }
        };
        addEventListener('keydown',onKey,true);
        const focusScope = event => { if (!dom.contains(event.target)) keyboardEntered = false; };
        addEventListener('focusin',focusScope,true);
        const resetRowActions = () => {
            nodes.forEach(node => node.querySelector('.pw-row-actions')?.remove());
            sharedRowActions = null; actionRow = null; paint();
        };
        desktopActions.addEventListener?.('change',resetRowActions);
        window.ko?.utils?.domNodeDisposal?.addDisposeCallback(dom,() => {
            ++generation; removeEventListener('keydown',onKey,true); removeEventListener('focusin',focusScope,true);
            desktopActions.removeEventListener?.('change',resetRowActions);
            if (mailUi.onSearch === onSearch) mailUi.onSearch = priorSearch;
        });
        const active = () => document.documentElement.classList.contains('pw-theme');
        return {isSearch:() => !!searchState,reset:() => { searchState = null; loading = false; ++generation; resetSelection(); },updateScope,
            refresh:refreshResults,search,restore:async state => {
                searchScope.value = state.scope || 'global';
                if (state.search) await search(state.search,Number(state.offset || 0));
                if (state.key && nodes.has(state.key)) focus(state.key);
                if (section.parentElement) section.parentElement.scrollTop = Number(state.scroll || 0);
            },
            paint:(newItems,newAccounts,isLoading) => { if (searchState) return; items = newItems; accounts = newAccounts; loading = isLoading; paint(); },
            state:() => ({selected:selected.size,focused,search:!!searchState,total:searchState?.total || items.length})};
    };
})();
