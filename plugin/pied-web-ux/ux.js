(() => {
    'use strict';
    let folderView;
    const themeEffects = [], themeStyle = document.getElementById('app-theme-style');
    const active = () => document.documentElement.classList.contains('pw-theme');
    const french = () => (document.documentElement.lang || 'fr').startsWith('fr');
    const t = (fr, en) => french() ? fr : en;
    const bind = (node, vm) => ko.applyBindingAccessorsToNode(node, {
        template: () => ({nodes: Array.from(node.childNodes)})
    }, vm);
    const translatedButtons = node => node.querySelectorAll('[data-label]').forEach(el => {
        el.title = window.rl.i18n(el.dataset.label);
        el.setAttribute('aria-label', el.title);
    });
    const syncTheme = () => {
        document.documentElement.classList.toggle('pw-theme',
            (themeStyle?.dataset.name || window.rl.settings.get('Theme')) === 'PiedWeb@nextcloud');
        if (active()) folderView?.filterUnseen(false);
        themeEffects.forEach(fn => fn());
    };
    syncTheme();
    if (themeStyle) new MutationObserver(syncTheme).observe(themeStyle, {
        attributes: true, attributeFilter: ['data-name']
    });

    addEventListener('rl-view-model', event => {
        const vm = event.detail, dom = vm.viewModelDom;
        if (!dom) return;
        if (vm.viewModelTemplateID === 'SettingsPane') {
            const toggle = dom.querySelector('.toggleLeft');
            if (toggle) {
                toggle.title = window.rl.i18n('TITLES/SETTINGS');
                toggle.setAttribute('aria-label', toggle.title);
                toggle.setAttribute('role', 'button');
                toggle.tabIndex = 0;
                toggle.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle.click(); }
                });
            }
        }
        if (vm.viewModelTemplateID === 'PopupsCompose') {
            // The native destructive action is an unlabeled glyph. Give it the
            // native translation for a name rather than inventing one.
            const discard = dom.querySelector('header a.btn.button-delete');
            if (discard && !discard.getAttribute('aria-label')) {
                discard.title = window.rl.i18n('GLOBAL/DELETE');
                discard.setAttribute('aria-label', discard.title);
            }
        }
        if (vm.viewModelTemplateID === 'SystemDropDown' && !dom.classList.contains('pw-account-ready')) {
            dom.classList.add('pw-account-ready');
            const account = dom.querySelector('.accountPlace');
            const button = dom.querySelector('#top-system-dropdown-id');
            if (button) button.tabIndex = 0;
            if (account) {
                account.classList.add('pw-account-original');
                const label = document.createElement('span');
                label.className = 'pw-account-label';
                const local = document.createElement('span'), host = document.createElement('span');
                local.className = 'pw-account-local'; host.className = 'pw-account-domain';
                label.append(local, host); account.after(label);
                const update = () => {
                    const email = vm.accountEmail() || '', at = email.lastIndexOf('@');
                    local.textContent = at < 0 ? '' : email.slice(0, at + 1);
                    host.textContent = at < 0 ? email : email.slice(at + 1);
                    label.title = email;
                    button?.setAttribute('aria-label', t('Compte actif : ', 'Active account: ') + email);
                };
                vm.accountEmail.subscribe(update); update();
            }
        }
        if (vm.viewModelTemplateID === 'MailFolderList') {
            folderView = vm; syncTheme();
            const labelFolders = () => dom.querySelectorAll('.b-content li a.selectable').forEach(link => {
                const folder = ko.dataFor(link);
                const label = ko.unwrap(folder?.localName) || ko.unwrap(folder?.name) || link.textContent.trim();
                if (label) { link.title = label; link.setAttribute('aria-label', label); }
            });
            labelFolders();
            const content = dom.querySelector('.b-content');
            if (content) new MutationObserver(labelFolders).observe(content, {childList: true, subtree: true, characterData: true});
        }
        if (vm.viewModelTemplateID === 'MailMessageList' && !dom.querySelector('.pw-threads')) {
            const toolbar = dom.querySelector('.btn-toolbar'), button = document.createElement('button');
            const error = document.createElement('span');
            const inbox = () => window.PiedWebUx?.inboxConversations?.isInbox(vm.messageList?.()?.folder);
            button.type = 'button'; button.className = 'btn pw-threads onCheckedHide';
            error.className = 'pw-threads-error'; error.setAttribute('role', 'alert');
            const current = () => {
                const general = document.getElementById('V-Settings-General');
                return general && ko.dataFor(general)?.useThreads
                    ? !!ko.dataFor(general).useThreads() : !!window.rl.settings.get('useThreads');
            };
            const update = () => {
                const visible = inbox();
                button.hidden = !visible; error.hidden = !visible;
                button.textContent = t('Conversations', 'Conversations');
                button.setAttribute('aria-pressed', String(current()));
                button.title = current() ? t('Afficher les messages séparément', 'Show individual messages') : t('Grouper par conversation', 'Group by conversation');
            };
            update();
            button.addEventListener('click', () => {
                if (!inbox()) return;
                if (vm.composeInEdit?.()) {
                    error.textContent = t('Fermez le message en cours avant de changer de vue.', 'Close the current draft before changing views.');
                    return;
                }
                button.disabled = true; error.textContent = '';
                window.rl.app.Remote.saveSetting('UseThreads', !current(), (code) => {
                    if (code) {
                        error.textContent = t('Impossible de changer de vue. Réessayez.', 'Could not change views. Try again.');
                        button.disabled = false;
                    } else {
                        // Reload so the native store, IMAP query and conversation cache agree.
                        // The current mailbox URL is retained.
                        location.reload();
                    }
                });
            });
            toolbar?.append(button, error);
            vm.messageList?.subscribe?.(update);
            const footer = dom.querySelector('.messageList > .b-footer');
            const content = dom.querySelector('.messageList > .b-content');
            if (footer && content) {
                const home = footer.parentNode;
                const updateFooter = () => {
                    (active() ? content : home).append(footer);
                    footer.classList.toggle('pw-single-page', active() && vm.messageList.pageCount() < 2);
                };
                vm.messageList.pageCount.subscribe(updateFooter);
                themeEffects.push(updateFooter); updateFooter();
            }
        }
        if (vm.viewModelTemplateID === 'MailMessageView' && !dom.querySelector('.pw-message-actions')) {
            const toolbar = dom.querySelector('.top-toolbar');
            if (!toolbar) return;
            const actions = document.createElement('div');
            actions.className = 'pw-message-actions btn-group';
            actions.innerHTML = `
                <button type="button" class="btn pw-reply fontastic" data-label="MESSAGE/BUTTON_REPLY" data-bind="command: replyCommand, visible: canBeRepliedOrForwarded"><span aria-hidden="true">←</span></button>
                <button type="button" class="btn pw-reply-all fontastic" data-label="MESSAGE/BUTTON_REPLY_ALL" data-bind="command: replyAllCommand, visible: canBeRepliedOrForwarded"><span aria-hidden="true">↞</span></button>
                <button type="button" class="btn pw-mark-unread" data-label="MESSAGE_LIST/MENU_UNSET_SEEN" data-bind="click: setUnseen, enable: messageVisible, visible: messageVisible"><span aria-hidden="true">✉</span></button>`;
            translatedButtons(actions);
            toolbar.querySelector('.buttonUp')?.closest('.btn-group').before(actions);
            if (!actions.parentNode) toolbar.append(actions);
            bind(actions, vm);
            const extras = document.createElement('div');
            extras.className = 'pw-message-extras';
            vm.pwUnsubscribe = ko.computed(() => {
                const links = vm.message?.()?.unsubsribeLinks?.() || [];
                return links.find(link => /^(https?:\/\/|mailto:)/i.test(link) && !/[\r\n]/.test(link)) || '';
            });
            // The studio layer places the unsubscribe link alongside the sender.
            if (vm.nextcloudICS && vm.nextcloudSaveICS) extras.innerHTML += `<button type="button" class="btn pw-import-calendar" data-bind="visible: nextcloudICS, click: nextcloudSaveICS">${t('Ajouter au calendrier', 'Add to calendar')}</button>`;
            const header = dom.querySelector('.messageItemHeader');
            // The native header uses `if: message` and replaces its children on
            // message changes. Keep these controls outside that managed subtree.
            if (header) {
                header.after(extras);
                bind(extras, vm);
                const positionExtras = () => {
                    const destination = active() && matchMedia('(min-width:800px)').matches
                        ? dom.querySelector('#messageItem > .messageItemHeader') || header : header;
                    if (extras.previousElementSibling !== destination) destination.after(extras);
                };
                themeEffects.push(positionExtras);
                addEventListener('resize', positionExtras);
                positionExtras();
            }
            dom.classList.add('pw-enhanced');
        }
    });

    // Let the account share the desktop toolbar; keep the mobile account header.
    let headerFrame, accountHome;
    const dockAccount = () => {
        headerFrame = 0;
        const account = document.getElementById('V-SystemDropDown');
        const right = document.getElementById('rl-right');
        if (!account || !right) return;
        accountHome ||= account.parentNode;
        const reader = document.getElementById('V-MailMessageView');
        const list = document.getElementById('V-MailMessageList');
        const visible = node => node && !node.hidden && getComputedStyle(node).display !== 'none';
        const desktop = active() && matchMedia('(min-width:800px)').matches;
        const side = document.documentElement.classList.contains('sm-msgView-side');
        const mobileIdentity = !desktop && active() && (visible(reader) || visible(list)) && document.querySelector('.pw-mobile-identity');
        const identity = document.querySelector('.pw-desktop-identity');
        const desktopIdentity = desktop && visible(document.getElementById('V-MailFolderList')) && visible(identity) && identity;
        const target = mobileIdentity || desktopIdentity || desktop && (visible(reader) && (side || !visible(list))
            ? reader.querySelector('.top-toolbar') : visible(list) && list.querySelector(':scope > .btn-toolbar'));
        const parent = target || accountHome;
        if (account.parentNode !== parent) parent.append(account);
        const docked = !!target;
        if (right.classList.contains('pw-compact-header') !== docked) right.classList.toggle('pw-compact-header', docked);
        if (account.classList.contains('pw-docked-account') !== docked) account.classList.toggle('pw-docked-account', docked);
        const trigger = account.querySelector('#top-system-dropdown-id');
        if (trigger) {
            const top = Math.max(8, Math.min(innerHeight - 160, trigger.getBoundingClientRect().bottom + 6)) + 'px';
            if (account.style.getPropertyValue('--pw-account-menu-top') !== top) account.style.setProperty('--pw-account-menu-top', top);
        }
    };
    const scheduleHeader = () => { if (!headerFrame) headerFrame = requestAnimationFrame(dockAccount); };
    addEventListener('resize', scheduleHeader);
    new MutationObserver(scheduleHeader).observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
    addEventListener('rl-view-model', event => {
        if (['MailMessageList', 'MailMessageView', 'SystemDropDown'].includes(event.detail.viewModelTemplateID)) {
            new MutationObserver(scheduleHeader).observe(event.detail.viewModelDom, {attributes: true, attributeFilter: ['hidden', 'style']});
            if (event.detail.viewModelTemplateID === 'SystemDropDown') {
                const dropdown = event.detail.viewModelDom.querySelector('.dropdown');
                if (dropdown) new MutationObserver(scheduleHeader).observe(dropdown, {attributes: true, attributeFilter: ['class']});
            }
            scheduleHeader();
        }
    });
    themeEffects.push(scheduleHeader);
})();
