/* Clickable addresses in the reader header. A plain click reaches the native
 * compose popup through the reader's own mailto handler; Ctrl/Cmd+click copies
 * the bare address instead and never opens the composer. */
(() => {
    'use strict';
    const active = () => document.documentElement.classList.contains('pw-theme');
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const apple = () => /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '');
    const fields = {'GLOBAL/FROM':'from','GLOBAL/TO':'to','GLOBAL/CC':'cc','GLOBAL/BCC':'bcc','GLOBAL/REPLY_TO':'replyTo'};
    let toast, toastTimer;
    // Native reader: a left click on a mailto link inside its view opens the
    // composer. Keep that contract instead of calling a command: the address is
    // a real link, carrying the display name in the same "?to=" form the native
    // address line uses, so the recipient keeps its name in the new message.
    const decorate = (link, email, name) => {
        const write = t('Écrire à ', 'Write to ') + email;
        link.classList.add('pw-address');
        link.dataset.pwEmail = email;
        link.href = 'mailto:' + encodeURIComponent(email)
            + (name ? '?to=' + encodeURIComponent('"' + name + '" <' + email + '>') : '');
        link.title = write + ' · ' + (apple() ? t('Cmd+clic', 'Cmd+click') : t('Ctrl+clic', 'Ctrl+click'))
            + t(' ou Ctrl+Entrée pour copier l’adresse', ' or Ctrl+Enter to copy the address');
        link.setAttribute('aria-label', write);
        link.setAttribute('aria-keyshortcuts', 'Control+Enter');
        return link;
    };
    // Same line as the native address text, with the address itself linked.
    const addresses = list => {
        const nodes = [];
        (list || []).forEach((entry, index) => {
            const email = String(entry?.email || '').trim(), name = String(entry?.name || '').trim();
            if (index) nodes.push(', ');
            if (!email) { nodes.push(name); return; }
            if (name) nodes.push('"' + name + '" <');
            const link = decorate(document.createElement('a'), email, name);
            link.textContent = email;
            nodes.push(link);
            if (name) nodes.push('>');
        });
        return nodes;
    };
    const renderRow = (row, list) => {
        const entries = list || [];
        const signature = JSON.stringify(entries.map(entry => [entry?.name || '', entry?.email || '']));
        let target = row.querySelector(':scope > .pw-addresses');
        // Rebuild only on a real change, so the observer that watches the
        // rendered header cannot answer its own writes.
        if (target && target.dataset.pwAddresses === signature) return;
        if (!entries.length) {
            row.querySelector(':scope > .pw-native-addresses')?.classList.remove('pw-native-addresses');
            target?.remove();
            return;
        }
        if (!target) {
            row.lastElementChild?.classList.add('pw-native-addresses');
            target = document.createElement(row.tagName === 'TR' ? 'td' : 'span');
            target.className = 'pw-addresses';
            row.append(target);
        }
        target.dataset.pwAddresses = signature;
        target.replaceChildren(...addresses(entries));
    };
    const sync = vm => {
        const dom = vm.viewModelDom, message = vm.message?.();
        dom.querySelectorAll('#messageItem > .messageItemHeader :is(.informationShortWrp > .informationShort, .informationFull tr)')
            .forEach(row => {
                const field = fields[row.querySelector('[data-i18n]')?.dataset.i18n || ''];
                if (field) renderRow(row, message?.[field]);
            });
        // The themed sender line is built by studio.js from the same addresses.
        const senders = message?.from || [];
        dom.querySelectorAll('.messageItemHeader .pw-sender-address').forEach(link => {
            const email = link.textContent.trim();
            if (email) decorate(link, email, senders.find(entry => entry?.email === email)?.name || '');
        });
    };
    const announce = (link, text, state) => {
        if (!toast) return;
        toast.textContent = text;
        toast.dataset.state = state;
        delete toast.dataset.place;
        toast.style.left = toast.style.top = '0px';
        const box = link.getBoundingClientRect(), width = toast.offsetWidth;
        if (box.top < 56) toast.dataset.place = 'below';
        toast.style.left = Math.round(Math.max(8, Math.min(box.left, innerWidth - width - 8))) + 'px';
        toast.style.top = Math.round(toast.dataset.place ? box.bottom + 8 : box.top - 8) + 'px';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.textContent = ''; delete toast.dataset.state; }, 2400);
    };
    const copy = async link => {
        const email = link.dataset.pwEmail || '';
        if (!email) return;
        let copied = false;
        if (navigator.clipboard?.writeText) {
            try { await navigator.clipboard.writeText(email); copied = true; }
            catch (_error) { copied = false; }
        }
        if (!copied) {
            const field = document.createElement('textarea');
            field.value = email; field.style.position = 'fixed'; field.style.top = '-9999px';
            document.body.append(field); field.select();
            try { copied = document.execCommand('copy'); }
            catch (_error) { copied = false; }
            finally { field.remove(); link.focus(); }
        }
        announce(link, copied ? t('Adresse copiée : ', 'Address copied: ') + email
            : t('Copie impossible. Réessayez.', 'Could not copy. Try again.'), copied ? 'copied' : 'error');
    };
    addEventListener('rl-view-model', ({detail:vm}) => {
        const dom = vm.viewModelDom;
        if (vm.viewModelTemplateID !== 'MailMessageView' || vm.pwAddressActions || !dom) return;
        vm.pwAddressActions = true;
        if (!toast) {
            // A live region has to be in the page before its text changes, so it
            // stays there, empty and transparent, rather than being created on copy.
            toast = document.createElement('div');
            toast.className = 'pw-address-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.append(toast);
        }
        const update = () => sync(vm);
        ko.computed(update, null, {disposeWhenNodeIsRemoved:dom});
        new MutationObserver(update).observe(dom, {childList:true, subtree:true});
        // Capture the copy shortcut before the native mailto handler on the same
        // view, otherwise Ctrl+click would also open the composer.
        dom.addEventListener('click', event => {
            const link = event.target instanceof Element ? event.target.closest('.pw-address') : null;
            if (!link || !active() || event.button !== 0 || !(event.ctrlKey || event.metaKey)) return;
            event.preventDefault(); event.stopPropagation();
            copy(link);
        }, true);
        dom.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
            const link = event.target instanceof Element ? event.target.closest('.pw-address') : null;
            if (!link || !active()) return;
            event.preventDefault(); event.stopPropagation();
            copy(link);
        }, true);
    });
})();
