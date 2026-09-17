(() => {
    'use strict';
    const fr = () => (document.documentElement.lang || 'fr').startsWith('fr');
    const icons = {'GLOBAL/CLOSE':'close','GLOBAL/TO_ARCHIVE':'archive','GLOBAL/TO_SPAM':'spam','GLOBAL/DELETE':'trash','GLOBAL/MORE':'more','GLOBAL/MOVE_TO':'folder','FOLDER_LIST/BUTTON_NEW_MESSAGE':'compose','MESSAGE_LIST/BUTTON_RELOAD':'refresh','MESSAGE_LIST/SORT':'sort','MESSAGE/BUTTON_REPLY':'reply','MESSAGE/BUTTON_REPLY_ALL':'reply-all','MESSAGE_LIST/MENU_UNSET_SEEN':'unread','GLOBAL/CONTACTS':'contacts'};
    const email = value => String(ko.unwrap(value?.email) || value || '').trim().toLocaleLowerCase();
    const addresses = value => {
        value = ko.unwrap(value);
        return Array.isArray(value) ? value : value ? [value] : [];
    };
    // Match the native Reply all recipient set, minus the active account. The
    // preferred action changes only when Reply all would actually address more
    // than one person, not merely because the message has From and To headers.
    const preferReplyAll = message => {
        if (!message) return false;
        const own = new Set(['Email','mainEmail'].map(key => email(window.rl?.settings?.get?.(key))).filter(Boolean));
        const account = document.getElementById('V-SystemDropDown');
        const accountVM = account && ko.dataFor(account);
        const activeEmail = email(ko.unwrap(accountVM?.accountEmail)
            || account?.querySelector('.pw-account-label')?.title
            || account?.querySelector('.accountPlace')?.title);
        if (activeEmail) own.add(activeEmail);
        const replyTo = addresses(message.replyTo);
        const recipients = [...(replyTo.length ? replyTo : addresses(message.from)),
            ...addresses(message.to), ...addresses(message.cc)];
        return new Set(recipients.map(email).filter(value => value && !own.has(value))).size > 1;
    };
    let title, readerVM;
    // Nextcloud shell integration is handled by app-shell.js for both embedding modes.
    const syncTitle = () => {
        if (!title) return;
        const selected = document.querySelector('#V-MailFolderList a.selectable.selected');
        const data = selected && ko.dataFor(selected);
        title.textContent = ko.unwrap(data?.localName) || selected?.title || selected?.textContent.trim() || (fr() ? 'Messages' : 'Messages');
        title.title = title.textContent;
        document.querySelector('.inputSearch')?.setAttribute('aria-label',(fr() ? 'Rechercher dans ' : 'Search in ')+title.textContent);
        const mobileTitle = document.querySelector('.pw-mobile-folder-label');
        const mobileName=(title.textContent==='Boîte de réception' && fr()) ? 'Réception' : title.textContent;
        if (mobileTitle && mobileTitle.textContent !== mobileName) {mobileTitle.textContent=mobileName;mobileTitle.setAttribute('aria-label',title.textContent+' · '+(fr() ? 'Afficher les dossiers' : 'Show folders'));}
    };
    addEventListener('rl-view-model', ({detail: vm}) => {
        const dom = vm.viewModelDom;
        if (!dom || dom.dataset.pwStudio) return;
        if (!['MailFolderList','MailMessageList','MailMessageView'].includes(vm.viewModelTemplateID)) return;
        dom.dataset.pwStudio = '1';
        dom.querySelectorAll('[data-i18n],[data-label]').forEach(node => {
            const key = (node.dataset.label || node.dataset.i18n).replace('[title]','');
            const name = icons[key];
            if (!name) return;
            const button = node.matches('.btn') ? node : node.querySelector('.btn');
            if (button) {
                button.dataset.pwIcon = name;
                if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', window.rl.i18n(key));
            }
        });
        const keyboardButton=node=>{
            if(!node || node.tagName==='BUTTON' || node.dataset.pwKeyboard) return;
            node.dataset.pwKeyboard='1';node.setAttribute('role','button');node.tabIndex=0;
            node.addEventListener('keydown',e=>{if(e.key===' ' || (e.key==='Enter' && !node.hasAttribute('href'))){e.preventDefault();node.click();}});
        };
        dom.querySelectorAll('[data-pw-icon].btn').forEach(keyboardButton);
        dom.querySelectorAll('.toggleLeft').forEach(n => n.dataset.pwIcon='menu');
        dom.querySelectorAll('.buttonUp').forEach(n => n.dataset.pwIcon='previous');
        dom.querySelectorAll('.buttonDown').forEach(n => n.dataset.pwIcon='next');
        if (vm.viewModelTemplateID === 'MailMessageView') {
            readerVM = vm;
            const nativeHeader=dom.querySelector('.messageItemHeader');
            const updateUnsubscribe=()=>{
                const from=nativeHeader?.querySelector('.pw-from');
                if (!from) return;
                let link=from.querySelector('.pw-unsubscribe');
                const href=vm.pwUnsubscribe?.();
                if (!href) { link?.remove(); return; }
                if (!link) {
                    link=document.createElement('a'); link.className='pw-unsubscribe';
                    link.target='_blank'; link.rel='noopener noreferrer';
                    link.textContent=fr() ? 'Se désabonner' : 'Unsubscribe';
                    from.append(link);
                }
                link.href=href;
            };
            vm.pwUnsubscribe?.subscribe(updateUnsubscribe);
            const formatSender=()=>{
                const original=nativeHeader?.querySelector('.from');
                if (!original || original.parentNode.querySelector('.pw-from')) return;
                const senders=vm.message?.()?.from;
                if (!senders?.length) return;
                const display=document.createElement('span'); display.className='pw-from';
                senders.forEach(sender=>{
                    const person=document.createElement('span'); person.className='pw-sender';
                    const avatar=document.createElement('span'); avatar.className='pw-sender-initial'; avatar.setAttribute('aria-hidden','true');
                    avatar.textContent=(sender.name || sender.email || '').trim().slice(0,1).toLocaleUpperCase();
                    const info=document.createElement('span'), name=document.createElement('span'), address=document.createElement('a');
                    name.className='pw-sender-name'; name.textContent=sender.name || sender.email;
                    address.textContent=sender.email; address.href='mailto:'+encodeURIComponent(sender.email); address.className='pw-sender-address';
                    info.append(name,address); person.append(avatar,info); display.append(person);
                });
                original.after(display); original.classList.add('pw-native-from');
                updateUnsubscribe();
                // The native flag click is delegated through .subjectParent.
                // Retain that ancestor when placing the bound controls by the sender.
                const details=document.createElement('span');
                details.className='subjectParent pw-message-details';
                original.parentNode.append(details);
                nativeHeader.querySelectorAll('.subjectParent .infoParent,.subjectParent .flagParent').forEach(control=>{
                    const marker=document.createComment('Native message detail action');control.before(marker);
                    keyboardButton(control);control.setAttribute('aria-label',control.classList.contains('infoParent') ? (fr() ? 'Détails du message' : 'Message details') : (fr() ? 'Basculer le suivi du message' : 'Toggle message flag'));
                    if (control.classList.contains('flagParent')) ko.computed(()=>{
                        const message=vm.message?.(), flagged=!!message?.isFlagged?.();
                        const label=flagged ? (fr() ? 'Retirer le suivi du message' : 'Unflag message') : (fr() ? 'Suivre ce message' : 'Flag message');
                        control.setAttribute('aria-pressed',String(flagged));
                        control.setAttribute('aria-disabled',String(!message));
                        control.setAttribute('aria-label',label);control.title=label;
                    },null,{disposeWhenNodeIsRemoved:control});
                    const place=()=>document.documentElement.classList.contains('pw-theme') ? details.append(control) : marker.after(control);
                    new MutationObserver(place).observe(document.documentElement,{attributes:true,attributeFilter:['class']});place();
                });
            };
            if (nativeHeader) new MutationObserver(formatSender).observe(nativeHeader,{childList:true,subtree:true});
            formatSender();
            // Keep SnappyMail's bound label menu, but place its trigger with the
            // other reader details. The source marker lets theme exit restore it.
            let tagGroup, tagMarker, tagRow;
            const syncTags=()=>{
                const row=dom.querySelector('#messageItem > .messageItemHeader .messageTags');
                const nativeGroup=row?.querySelector(':scope > .btn-group');
                if (tagGroup && (!tagMarker?.isConnected || nativeGroup && nativeGroup!==tagGroup)) {
                    ko.cleanNode?.(tagGroup); tagGroup.remove();
                    tagRow?.classList.remove('pw-tags-in-header');
                    tagMarker?.remove();
                    tagGroup=tagMarker=tagRow=null;
                }
                if (nativeGroup && !tagGroup) {
                    tagGroup=nativeGroup; tagRow=row;
                    tagMarker=document.createComment('Native message tags action');
                    tagGroup.before(tagMarker);
                    tagGroup.classList.add('pw-reader-tags');
                    const trigger=tagGroup.querySelector('#tags-dropdown-id');
                    keyboardButton(trigger);
                    const label=fr() ? 'Étiquettes du message' : 'Message labels';
                    trigger?.setAttribute('aria-label',label);
                    trigger?.setAttribute('title',label);
                    trigger?.setAttribute('aria-haspopup','menu');
                }
                if (!tagGroup) return;
                const details=nativeHeader?.querySelector('.pw-message-details');
                const star=details?.querySelector('.flagParent');
                if (document.documentElement.classList.contains('pw-theme') && star) {
                    if (tagGroup.parentNode!==details || tagGroup.nextElementSibling!==star) details.insertBefore(tagGroup,star);
                    tagRow.classList.add('pw-tags-in-header');
                } else {
                    if (tagGroup.previousSibling!==tagMarker) tagMarker.after(tagGroup);
                    tagRow.classList.remove('pw-tags-in-header');
                }
            };
            new MutationObserver(syncTags).observe(dom,{childList:true,subtree:true});
            new MutationObserver(syncTags).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
            syncTags();
            const toolbar = dom.querySelector('.top-toolbar');
            const reply = toolbar?.querySelector('.pw-message-actions');
            if (reply) toolbar.prepend(reply);
            vm.pwPreferReplyAll ||= ko.computed(() => preferReplyAll(vm.message?.()), null, {disposeWhenNodeIsRemoved:dom});
            if (reply) {
                const replyOne = reply.querySelector('.pw-reply');
                const replyAll = reply.querySelector('.pw-reply-all');
                const syncReplyPriority = () => {
                    const all = vm.pwPreferReplyAll();
                    reply.classList.toggle('pw-reply-all-preferred', all);
                    replyOne?.classList.toggle('pw-preferred-reply', !all);
                    replyAll?.classList.toggle('pw-preferred-reply', all);
                    reply.prepend(all ? replyAll : replyOne);
                };
                vm.pwPreferReplyAll.subscribe(syncReplyPriority);
                syncReplyPriority();
            }
            const commands=document.createElement('div');commands.className='pw-reader-commands';commands.setAttribute('role','group');commands.setAttribute('aria-label',fr() ? 'Actions du message' : 'Message actions');
            const copyGroup=document.createElement('div');copyGroup.className='btn-group pw-copy-md-group';
            const copy=document.createElement('button');copy.type='button';copy.className='btn pw-copy-md';copy.dataset.pwIcon='copy-md';copy.textContent='MD';
            const copyLabel=fr() ? 'Copier en MD' : 'Copy as Markdown';
            copy.title=copyLabel;copy.setAttribute('aria-label',copyLabel);
            const copyStatus=document.createElement('span');copyStatus.className='pw-copy-md-status';copyStatus.setAttribute('role','status');copyStatus.setAttribute('aria-live','polite');
            copyGroup.append(copy,copyStatus);
            toolbar.querySelector('.buttonUp')?.closest('.btn-group')?.before(copyGroup);
            const updateCopy=()=>{copy.disabled=!vm.messageVisible?.();};
            vm.messageVisible?.subscribe(updateCopy);updateCopy();
            let copyTimer;
            const copyFeedback=(state,label)=>{
                copyStatus.textContent=label;copy.title=label;
                delete copy.dataset.state;
                void copy.offsetWidth; // Replay the brief confirmation on consecutive copies.
                copy.dataset.state=state;
                clearTimeout(copyTimer);
                copyTimer=setTimeout(()=>{copyStatus.textContent='';copy.title=copyLabel;delete copy.dataset.state;},2400);
            };
            copy.addEventListener('click',async()=>{
                if (copy.dataset.state==='copying') return;
                clearTimeout(copyTimer);copyStatus.textContent='';copy.title=copyLabel;delete copy.dataset.state;
                const message=vm.message?.(),body=message?.body;
                if (copy.disabled || !body || body.hidden || !dom.querySelector('.bodyText')?.contains(body)) return;
                copy.dataset.state='copying';
                try {
                    const content=body.cloneNode(true);
                    content.querySelectorAll('details.sm-bq-switcher').forEach(details=>{
                        const quote=details.querySelector(':scope > blockquote');
                        if (quote) details.replaceWith(quote);
                    });
                    content.querySelectorAll('script,style,template,[hidden],[aria-hidden="true"]').forEach(node=>node.remove());
                    const markdown=window.PiedWebUx?.markdown?.fromMessageHtml(content.innerHTML);
                    if (!markdown?.trim()) throw new Error('Empty message body');
                    const fallbackCopy=()=>{
                        const field=document.createElement('textarea');field.value=markdown;field.style.position='fixed';field.style.top='-9999px';document.body.append(field);field.select();
                        try { if (!document.execCommand('copy')) throw new Error('Clipboard unavailable'); }
                        finally { field.remove();copy.focus(); }
                    };
                    if (navigator.clipboard?.writeText) {
                        try { await navigator.clipboard.writeText(markdown); }
                        catch (_error) { fallbackCopy(); }
                    } else fallbackCopy();
                    copyFeedback('copied',fr() ? 'Copié en MD' : 'Copied as Markdown');
                } catch (_error) {
                    copyFeedback('error',fr() ? 'Copie impossible. Réessayez.' : 'Could not copy. Try again.');
                }
            });
            const groups=[reply,toolbar.querySelector('[data-pw-icon="archive"]')?.closest('.btn-group'),copyGroup].filter(Boolean).map(node=>{const marker=document.createComment('Message command group');node.before(marker);return [node,marker];});
            toolbar.prepend(commands);
            const adaptCommands=()=>groups.forEach(([node,marker])=>document.documentElement.classList.contains('pw-theme') && !document.documentElement.classList.contains('rl-fullscreen') ? commands.append(node) : marker.after(node));
            new MutationObserver(adaptCommands).observe(document.documentElement,{attributes:true,attributeFilter:['class']});adaptCommands();
            const menu = dom.querySelector('#more-view-dropdown-id')?.closest('.btn-group');
            if (menu) {
                const marker = document.createComment('Native message menu'); menu.before(marker);
                menu.classList.add('pw-reader-menu');
                menu.querySelector('.btn').dataset.pwIcon = 'more';
                menu.querySelector('.btn').setAttribute('aria-label', window.rl.i18n('GLOBAL/MORE'));
                const restoreMenu = () => {
                    if (document.documentElement.classList.contains('rl-fullscreen') || !document.documentElement.classList.contains('pw-theme')) marker.after(menu);
                    else commands.append(menu);
                };
                new MutationObserver(restoreMenu).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
                restoreMenu();
                // `with: message` rebuilds part of this menu. Its former ancestor's
                // i18nUpdate no longer reaches it after it moves to the toolbar.
                const translateMenu=()=>menu.querySelectorAll('[data-i18n]').forEach(node=>{
                    const key=node.dataset.i18n;
                    if (key.startsWith('[')) return;
                    const label=window.rl.i18n(key);
                    if (node.textContent!==label) node.textContent=label;
                });
                new MutationObserver(translateMenu).observe(menu,{childList:true,subtree:true});
                translateMenu();
                const positionMenu=()=>menu.style.setProperty('--pw-menu-top',Math.max(8,Math.min(innerHeight-160,menu.querySelector('.dropdown-toggle').getBoundingClientRect().bottom+6))+'px');
                new MutationObserver(positionMenu).observe(menu,{attributes:true,attributeFilter:['class']});
                addEventListener('resize',positionMenu);positionMenu();
            }
            const body = dom.querySelector('.bodyText');
            if (body) {
                const footer = document.createElement('div'); footer.className = 'pw-reading-actions';
                footer.innerHTML = `<button type="button" class="btn pw-reading-reply pw-reading-reply-all" data-pw-icon="reply-all" data-bind="command: replyAllCommand, visible: canBeRepliedOrForwarded() && pwPreferReplyAll()">${fr() ? 'Répondre à tous' : 'Reply all'}</button><button type="button" class="btn pw-reading-reply pw-reading-reply-one" data-pw-icon="reply" data-bind="command: replyCommand, visible: canBeRepliedOrForwarded() && !pwPreferReplyAll()">${fr() ? 'Répondre' : 'Reply'}</button><button type="button" class="btn pw-reading-forward" data-pw-icon="forward" data-bind="command: forwardCommand, visible: canBeRepliedOrForwarded">${fr() ? 'Transférer' : 'Forward'}</button>`;
                body.after(footer);
                ko.applyBindingAccessorsToNode(footer,{template:()=>({nodes:Array.from(footer.childNodes)})},vm);
            }
        }
        if (vm.viewModelTemplateID === 'MailMessageList') {
            title = document.createElement('h1'); title.className = 'pw-list-title';
            dom.querySelector(':scope > .btn-toolbar')?.prepend(title);
            syncTitle();
            vm.messageList.subscribe(syncTitle);
            let groupingFrame, regroupTools=()=>{};
            const mobileTools=document.createElement('span');mobileTools.className='pw-mobile-list-tools';
            const groupRows=()=>{
                groupingFrame=0;
                if (mobileTools.parentNode?.classList.contains('pw-day-label')) dom.append(mobileTools);
                dom.querySelectorAll('.pw-day-label').forEach(el=>el.remove());
                if (!document.documentElement.classList.contains('pw-theme') || vm.listGrouped?.() || vm.messageList.threadUid?.()) {regroupTools();return;}
                const groups=vm.groupedList?.() || [];
                const rows=Array.from(dom.querySelectorAll('.messageListItem'));
                groups.forEach(group=>{
                    const first=group.messages[0];
                    const row=rows.find(el=>ko.dataFor(el)===first);
                    if (!row) return;
                    const label=document.createElement('div'); label.className='pw-day-label'; label.textContent=group.label;
                    row.before(label);
                });
                regroupTools();
            };
            const scheduleGrouping=()=>{if(!groupingFrame)groupingFrame=requestAnimationFrame(groupRows);};
            vm.messageList.subscribe(scheduleGrouping); vm.groupedList?.subscribe(scheduleGrouping); vm.listGrouped?.subscribe(scheduleGrouping);
            const rowsContainer=dom.querySelector('.messageList > .b-content');
            if(rowsContainer)new MutationObserver(records=>{
                if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1 && (n.matches('.messageListItem,.messageListPlace') || n.querySelector('.messageListItem')))))scheduleGrouping();
            }).observe(rowsContainer,{childList:true,subtree:true});
            new MutationObserver(scheduleGrouping).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
            scheduleGrouping();
            const header = document.createElement('div');
            header.className = 'pw-mobile-header';
            const folders = document.createElement('button'), compose = document.createElement('button');
            folders.type = compose.type = 'button';
            folders.className = compose.className = 'btn';
            folders.dataset.pwIcon = 'menu'; compose.dataset.pwIcon = 'compose';
            folders.setAttribute('aria-label', fr() ? 'Afficher les dossiers' : 'Show folders');
            compose.setAttribute('aria-label', window.rl.i18n('FOLDER_LIST/BUTTON_NEW_MESSAGE'));
            const updateNavigation = () => {
                const reading = document.getElementById('rl-right').classList.contains('message-selected');
                folders.dataset.pwIcon = reading ? 'previous' : 'menu';
                folders.setAttribute('aria-label', reading ? (fr() ? 'Retour aux messages' : 'Back to messages') : (fr() ? 'Afficher les dossiers' : 'Show folders'));
            };
            folders.addEventListener('click', () => {
                if (document.getElementById('rl-right').classList.contains('message-selected') && readerVM) readerVM.closeMessage();
                else dom.querySelector('.toggleLeft')?.click();
            });
            new MutationObserver(updateNavigation).observe(document.getElementById('rl-right'),{attributes:true,attributeFilter:['class']});
            updateNavigation();
            compose.addEventListener('click', () => vm.composeClick());
            const identity = document.createElement('div'); identity.className = 'pw-mobile-identity';
            const searchToggle=document.createElement('button'); searchToggle.type='button'; searchToggle.className='btn pw-search-toggle'; searchToggle.dataset.pwIcon='search';
            searchToggle.textContent=fr() ? 'Chercher' : 'Search';
            searchToggle.title=fr() ? 'Rechercher dans cette boîte' : 'Search this mailbox';
            searchToggle.setAttribute('aria-label',fr() ? 'Rechercher et filtrer les messages' : 'Search and filter messages'); searchToggle.setAttribute('aria-expanded','false');
            searchToggle.addEventListener('click',()=>{
                const open=dom.classList.toggle('pw-search-open'); searchToggle.setAttribute('aria-expanded',String(open));
                if (open) dom.querySelector('.inputSearch')?.focus();
            });
            header.append(folders, identity, searchToggle, compose);
            document.getElementById('rl-right').prepend(header);
            const account = document.getElementById('top-system-dropdown-id');
            if (account) {
                const label = document.createElement('button'); label.type='button'; label.className = 'pw-mobile-folder-label';
                label.title=fr() ? 'Afficher les dossiers' : 'Show folders';
                label.addEventListener('click',()=>folders.click());
                identity.prepend(label); syncTitle();
            }
            const toolbar = dom.querySelector(':scope > .btn-toolbar');
            const searchbar = dom.querySelector('.messageList > .second-toolbar');
            const searchHome=document.createComment('Native search row');searchbar.before(searchHome);
            const revealSearch=()=>{
                const active=!!vm.messageList().search || !!vm.inputSearch?.();
                dom.classList.toggle('pw-search-active',active);
                searchToggle.setAttribute('aria-expanded',String(active || dom.classList.contains('pw-search-open')));
            };
            vm.messageList.subscribe(revealSearch); vm.inputSearch?.subscribe(revealSearch); revealSearch();
            vm.focusSearch?.subscribe(focus=>{if(focus){dom.classList.add('pw-search-open');revealSearch();}});
            const advanced=dom.querySelector('.buttonMoreSearch'), search=dom.querySelector('.search-input-wrp');
            const inputHome=document.createComment('Native mail search field');search.before(inputHome);
            // Native Enter shortcuts are scoped to the list. The mobile header is its sibling.
            search.querySelector('input').addEventListener('keydown',e=>{
                if(e.key==='Enter' && !e.isComposing && header.contains(search) && vm.messageList.mainSearch){
                    e.preventDefault();e.stopPropagation();vm.inputSearch?.(e.target.value);vm.messageList.mainSearch(e.target.value);
                }
            });
            if (advanced && search) {
                keyboardButton(advanced);
                advanced.dataset.pwIcon='filter'; advanced.setAttribute('aria-label',fr() ? 'Recherche avancée' : 'Advanced search');
                const marker=document.createComment('Native advanced search'); advanced.before(marker);
                const adaptSearch=()=>document.documentElement.classList.contains('pw-theme') ? search.append(advanced) : marker.after(advanced);
                new MutationObserver(adaptSearch).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
                adaptSearch();
            }
            const moreMenu = dom.querySelector('[aria-labelledby="more-list-dropdown-id"]');
            const sortMenu = dom.querySelector('[aria-labelledby="sort-list-dropdown-id"]');
            const sortEntries = sortMenu ? Array.from(sortMenu.children) : [];
            const sortHeading = document.createElement('li'); sortHeading.className = 'pw-menu-heading'; sortHeading.setAttribute('role','presentation');
            sortHeading.textContent = fr() ? 'Trier les messages' : 'Sort messages';
            if (moreMenu) {
                const refresh = document.createElement('li'); refresh.className = 'pw-mobile-refresh';
                refresh.innerHTML = `<a href="#" role="menuitem">${fr() ? 'Actualiser' : 'Refresh'}</a>`;
                refresh.firstChild.addEventListener('click',e=>{e.preventDefault(); vm.reload();});
                const selection=document.createElement('li');selection.className='pw-mobile-select';
                selection.innerHTML=`<a href="#" role="menuitem">${fr() ? 'Sélectionner des messages' : 'Select messages'}</a>`;
                selection.firstChild.addEventListener('click',e=>{e.preventDefault();dom.classList.add('pw-search-open');searchToggle.setAttribute('aria-expanded','true');dom.querySelector('.checkboxCheckAll')?.focus();});
                moreMenu.prepend(refresh,selection);
            }
            const movable = [dom.querySelector('.pw-feed-settings') || dom.querySelector('.pw-threads'), dom.querySelector('#more-list-dropdown-id')?.closest('.btn-group')].filter(Boolean).map(node => {
                const marker = document.createComment('Pied Web control home'); node.before(marker); return [node, marker];
            });
            const adapt = () => {
                const mobile = matchMedia('(max-width:799px)').matches && document.documentElement.classList.contains('pw-theme');
                const piedWeb = document.documentElement.classList.contains('pw-theme');
                search.querySelector('input').tabIndex=piedWeb ? 0 : -1;
                if(mobile && !document.documentElement.classList.contains('pw-mail-shell')) compose.before(search); else if(search.previousSibling!==inputHome) inputHome.after(search);
                const single=piedWeb && !mobile && !toolbar.classList.contains('hasChecked') && !toolbar.querySelector('#V-SystemDropDown');
                dom.classList.toggle('pw-single-toolbar',single);
                if(single) toolbar.prepend(searchbar); else if(searchbar.previousSibling!==searchHome) searchHome.after(searchbar);
                if (piedWeb && moreMenu && sortMenu && (vm.sortSupported?.() ?? true)) moreMenu.append(sortHeading,...sortEntries);
                else if (sortMenu) { sortMenu.append(...sortEntries); sortHeading.remove(); }
                dom.querySelector('#sort-list-dropdown-id')?.closest('.btn-group').classList.toggle('pw-sort-in-menu',piedWeb);
                movable.forEach(([node, marker]) => {
                    if (mobile) {
                        const group=dom.querySelector('.pw-day-label,.groupLabel');
                        (group || searchbar).append(mobileTools); mobileTools.append(node);
                        dom.classList.toggle('pw-tools-fallback',!group);
                    }
                    else if (piedWeb && searchbar && node.querySelector('#more-list-dropdown-id')) searchbar.append(node);
                    else if (node.previousSibling !== marker) marker.after(node);
                });
                if(toolbar.classList.contains('pw-mobile-tools-moved')!==mobile) toolbar.classList.toggle('pw-mobile-tools-moved', mobile);
                search.querySelector('input')?.setAttribute('placeholder', mobile ? (fr() ? 'Rechercher' : 'Search mail') : (fr() ? 'Rechercher dans les messages' : 'Search messages'));
            };
            regroupTools=adapt;
            new MutationObserver(adapt).observe(toolbar,{attributes:true,attributeFilter:['class']});
            addEventListener('resize', adapt);
            vm.sortSupported?.subscribe(adapt);
            const theme = document.getElementById('app-theme-style');
            if (theme) new MutationObserver(adapt).observe(theme,{attributes:true,attributeFilter:['data-name']});
            adapt();
            const selectAll = dom.querySelector('.checkboxCheckAll');
            if (selectAll) {
                selectAll.setAttribute('role','checkbox'); selectAll.tabIndex = 0;
                selectAll.setAttribute('aria-label',fr() ? 'Sélectionner les messages de cette page' : 'Select messages on this page');
                selectAll.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); selectAll.click(); } });
                ko.computed(() => selectAll.setAttribute('aria-checked', vm.isIncompleteChecked?.() ? 'mixed' : String(!!vm.checkAll?.())));
            }
        }
        if (vm.viewModelTemplateID === 'MailFolderList') {
            const identity=document.createElement('div'); identity.className='pw-desktop-identity';
            dom.querySelector('.b-folders')?.prepend(identity);
            const section=document.createElement('div'); section.className='pw-folder-section';
            const sectionTitle=document.createElement('h2'); sectionTitle.textContent=fr() ? 'Dossiers' : 'Folders';
            const sectionActions=document.createElement('div'); sectionActions.className='pw-folder-actions'; section.append(sectionTitle,sectionActions);
            dom.querySelector('.b-folders-user')?.before(section);
            ['.icon-folder-add','[data-i18n="[title]SETTINGS_LABELS/FOLDERS"]'].forEach(selector=>{
                const control=dom.querySelector(selector);
                if (!control) return;
                const marker=document.createComment('Native folder action');control.before(marker);
                control.dataset.pwIcon=selector==='.icon-folder-add' ? 'add-folder' : 'settings';
                const adaptFolderAction=()=>document.documentElement.classList.contains('pw-theme') ? sectionActions.append(control) : marker.after(control);
                new MutationObserver(adaptFolderAction).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
                adaptFolderAction();
            });
            const contacts=dom.querySelector('.buttonContacts');
            if (contacts) {
                const label=document.createElement('span');label.className='pw-contacts-label';label.textContent=window.rl.i18n('GLOBAL/CONTACTS');contacts.append(label);
                const marker=document.createComment('Native contacts button'); contacts.before(marker);
                // This sidebar entry opens Nextcloud Contacts, regardless of the
                // optional SnappyMail address-book capability. A new anchor has no
                // inherited Knockout click handler that can consume navigation.
                let cloudContacts;
                try {
                    let host=window;
                    try { if (parent.OC) host=parent; } catch (_) { /* Cross-origin host. */ }
                    const oc=host.OC;
                    if (oc) {
                        const path=typeof oc.generateUrl==='function' ? oc.generateUrl('/apps/contacts/')
                            : (oc.webroot || '')+'/index.php/apps/contacts/';
                        cloudContacts=document.createElement('a');
                        cloudContacts.className='btn buttonContacts pw-cloud-contacts';
                        cloudContacts.dataset.pwIcon='contacts';
                        cloudContacts.href=new URL(path,host.location.href).href;
                        cloudContacts.target='_blank'; cloudContacts.rel='noopener noreferrer';
                        cloudContacts.title=fr() ? 'Contacts Nextcloud (nouvel onglet)' : 'Nextcloud Contacts (new tab)';
                        cloudContacts.setAttribute('aria-label',cloudContacts.title);
                        cloudContacts.append(label.cloneNode(true));
                        // Keep the browser's own navigation and modified-click behavior.
                        cloudContacts.addEventListener('click',event=>event.stopPropagation());
                        cloudContacts.addEventListener('auxclick',event=>event.stopPropagation());
                        contacts.classList.add('pw-contacts-replaced');
                    }
                } catch (_) { /* Standalone webmail keeps its native address book. */ }
                if (!ko.unwrap(vm.allowContacts)) contacts.classList.add('pw-contacts-unavailable');
                const adaptContacts=()=>{
                    const active=document.documentElement.classList.contains('pw-theme');
                    if (active) dom.querySelector('.b-footer .btn-group:last-child')?.prepend(cloudContacts || contacts);
                    else {marker.after(contacts);cloudContacts?.remove();}
                };
                new MutationObserver(adaptContacts).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
                adaptContacts();
            }
            const content=dom.querySelector('.b-content');
            if (content) new MutationObserver(syncTitle).observe(content, {subtree:true,attributes:true,attributeFilter:['class','title'],childList:true,characterData:true});
            const disclosures=()=>dom.querySelectorAll('.e-collapsed-sign').forEach(el=>{
                const hasChildren=!el.classList.contains('icon-none');
                el.tabIndex=hasChildren ? 0 : -1;
                if (!hasChildren) {el.removeAttribute('role');el.removeAttribute('aria-expanded');return;}
                el.setAttribute('role','button');el.setAttribute('aria-label',fr() ? 'Afficher ou masquer les sous-dossiers' : 'Expand or collapse subfolders');
                el.setAttribute('aria-expanded',String(!el.classList.contains('icon-right-mini')));
                if(!el.dataset.pwKey){el.dataset.pwKey='1';el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();el.click();}});}
            });
            if(content)new MutationObserver(disclosures).observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
            disclosures();
            syncTitle();
        }
    });
})();
