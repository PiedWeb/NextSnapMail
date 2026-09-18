/* Timed mail reminders. Messages stay in IMAP: Inbox -> Reminders -> Inbox unread. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const LEAF = 'Reminders';
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const lang = () => document.documentElement.lang || 'fr';
    const active = () => document.documentElement.classList.contains('pw-theme');
    const account = () => String(rl.settings.get('accountHash') || rl.settings.get('Email') || '');
    const listFolder = () => String(rl.app?.messageList?.()?.folder || '');
    const inbox = name => String(name || '').toUpperCase() === 'INBOX';
    let reminderFolder = '', entries = new Map(), inflight = null, checked = 0, knownAccount = '';
    let listVM, openPanel, toastTimer;

    const hook = (params, timeout = 60000) => new Promise((resolve, reject) => rl.pluginRemoteRequest(
        (code, data) => {
            const value = data?.Result;
            code || !value || value.error ? reject(new Error(value?.error || 'mail')) : resolve(value);
        }, 'PiedWebReminders', params, timeout));
    const glyph = name => {
        const source = api.composerIcons?.[name];
        if (!source) return null;
        const template = document.createElement('template'); template.innerHTML = source;
        const image = template.content.firstElementChild;
        image.setAttribute('aria-hidden','true'); image.setAttribute('focusable','false');
        return image;
    };
    const candidate = name => !!name && (reminderFolder ? name === reminderFolder
        : new RegExp(`(?:^|[^a-z0-9])${LEAF}$`, 'i').test(name));
    const format = value => {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        const time = date.toLocaleTimeString(lang(), {hour:'2-digit', minute:'2-digit'});
        const day = new Date(date); day.setHours(0,0,0,0);
        const today = new Date(); today.setHours(0,0,0,0);
        const days = Math.round((day - today) / 86400000);
        if (days === 0) return t('aujourd’hui à ', 'today at ') + time;
        if (days === 1) return t('demain à ', 'tomorrow at ') + time;
        return date.toLocaleDateString(lang(), {weekday:'long', day:'numeric', month:'long'}) + t(' à ', ' at ') + time;
    };
    api.formatReminderAt = format;
    const messageUids = message => {
        const values = new Set();
        const uid = Number(message?.uid || 0); if (uid > 0) values.add(uid);
        const threads = typeof message?.threads === 'function' ? message.threads() : [];
        if (Array.isArray(threads)) threads.forEach(value => { value = Number(value); if (value > 0) values.add(value); });
        return [...values];
    };

    function load(force) {
        const current = account();
        if (current !== knownAccount) {
            knownAccount = current; reminderFolder = ''; entries = new Map(); checked = 0; inflight = null;
        }
        if (inflight) return inflight;
        if (!force && Date.now() - checked < 5000) return Promise.resolve(entries);
        checked = Date.now();
        inflight = hook({operation:'list'}).then(result => {
            reminderFolder = String(result.folder || '');
            entries = new Map((result.entries || []).map(entry => [Number(entry.uid), entry]));
            return entries;
        }).catch(() => entries).finally(() => { inflight = null; });
        return inflight;
    }

    function toast(text, state = '') {
        let node = document.querySelector('.pw-reminder-toast');
        if (!node) {
            node = document.createElement('div'); node.className = 'pw-reminder-toast'; node.setAttribute('role','status');
            (document.getElementById('rl-app') || document.body).append(node);
        }
        clearTimeout(toastTimer); node.dataset.state = state; node.textContent = text;
        toastTimer = setTimeout(() => { node.textContent = ''; delete node.dataset.state; }, 5000);
    }

    const reason = error => ({
        drafts:t('Activez un dossier Brouillons pour utiliser les rappels.', 'Enable a Drafts folder to use reminders.'),
        folder:t('Le dossier des rappels est indisponible.', 'The reminders folder is unavailable.'),
        time:t('Choisissez une date de rappel à venir.', 'Choose a reminder time in the future.'),
        missing:t('Ce message n’est plus à cet emplacement.', 'This message is no longer there.'),
        keyword:t('Ce serveur mail ne prend pas en charge les rappels.', 'This mail server does not support reminders.'),
        move:t('Le message n’a pas pu être déplacé.', 'The message could not be moved.'),
        sender:t('Le service de rappel n’est pas actif sur ce serveur.', 'The reminder service is not running on this server.')
    })[String(error?.message || '')] || t('Rappel indisponible pour le moment.', 'Reminders are unavailable right now.');

    function presets() {
        const now = new Date(), at = (days, hour) => {
            const date = new Date(now); date.setDate(date.getDate() + days); date.setHours(hour, 0, 0, 0); return date;
        };
        const result = [], evening = at(0, 18), tomorrow = at(1, 8), week = at(7, 8);
        if (evening.getTime() > now.getTime() + 60000) result.push([t('Ce soir', 'This evening'), evening]);
        result.push([t('Demain matin', 'Tomorrow morning'), tomorrow]);
        result.push([t('Dans une semaine', 'In one week'), week]);
        return result;
    }

    function picker(anchor, uids, mode, done) {
        openPanel?.close(false);
        const currentToast = document.querySelector('.pw-reminder-toast');
        if (currentToast) currentToast.textContent = '';
        const title = mode === 'reschedule' ? t('Modifier le rappel', 'Change reminder') : t('Me le rappeler', 'Remind me');
        const panel = document.createElement('div'); panel.className = 'pw-reminder-panel';
        panel.setAttribute('role','dialog'); panel.setAttribute('aria-label',title);
        const heading = document.createElement('p'); heading.className = 'pw-reminder-title'; heading.textContent = title;
        const options = document.createElement('div'); options.className = 'pw-reminder-options';
        const full = date => date.toLocaleString(lang(), {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
        presets().forEach(([label, date]) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'pw-reminder-option';
            const name = document.createElement('span'); name.className = 'pw-reminder-when'; name.textContent = label;
            const detail = document.createElement('span'); detail.className = 'pw-reminder-detail'; detail.textContent = full(date);
            button.append(name, detail); button.addEventListener('click', () => choose(date)); options.append(button);
        });
        const custom = document.createElement('label'); custom.className = 'pw-reminder-custom';
        const customText = document.createElement('span'); customText.textContent = t('Autre date et heure', 'Another date and time');
        const input = document.createElement('input'); input.type = 'datetime-local'; input.step = '60';
        const stamp = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
        input.min = stamp(new Date(Date.now() + 60000)); input.value = stamp(presets().at(-1)[1]);
        custom.append(customText,input);
        const actions = document.createElement('div'); actions.className = 'pw-reminder-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'pw-reminder-cancel'; cancel.textContent = t('Annuler','Cancel');
        const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'pw-reminder-confirm'; confirm.textContent = t('Rappeler','Remind me');
        actions.append(cancel,confirm);
        const note = document.createElement('p'); note.className = 'pw-reminder-note'; note.setAttribute('role','status');
        panel.append(heading,options,custom,actions,note);
        (document.getElementById('rl-app') || document.body).append(panel);
        anchor.setAttribute('aria-expanded','true');

        const place = () => {
            if (!panel.isConnected || matchMedia('(max-width:600px)').matches) return;
            const button = anchor.getBoundingClientRect(), box = panel.getBoundingClientRect();
            const left = Math.max(12, Math.min(innerWidth - box.width - 12, button.left));
            const below = button.bottom + 8 + box.height <= innerHeight - 12;
            panel.style.left = left + 'px'; panel.style.top = (below ? button.bottom + 8 : Math.max(12, button.top - box.height - 8)) + 'px';
        };
        const close = focus => {
            if (!panel.isConnected) return;
            panel.remove(); anchor.setAttribute('aria-expanded','false');
            removeEventListener('pointerdown',outside,true); removeEventListener('resize',place);
            if (openPanel?.panel === panel) openPanel = null;
            focus && anchor.focus();
        };
        const outside = event => { if (!panel.contains(event.target) && !anchor.contains(event.target)) close(false); };
        const busy = value => panel.querySelectorAll('button,input').forEach(node => node.disabled = value);
        async function choose(date) {
            note.textContent = '';
            if (!(date instanceof Date) || !Number.isFinite(date.getTime())) { note.textContent = t('Date incomplète.','Incomplete date.'); return; }
            if (date.getTime() < Date.now() + 30000) { note.textContent = t('Choisissez un moment à venir.','Choose a time in the future.'); return; }
            busy(true); note.textContent = t('Enregistrement…','Saving…');
            try {
                const result = await hook({operation:mode, uids:uids.join(','), remindAt:date.toISOString()});
                reminderFolder = String(result.folder || reminderFolder); checked = 0;
                close(false); done?.(result);
                const count = Number(result.count || uids.length);
                toast(count > 1
                    ? t(`${count} messages reviendront ${format(result.remindAt)}.`, `${count} messages will return ${format(result.remindAt)}.`)
                    : t(`Le message reviendra ${format(result.remindAt)}.`, `The message will return ${format(result.remindAt)}.`));
            } catch (error) { busy(false); note.textContent = reason(error); }
        }
        cancel.addEventListener('click', () => close(true));
        confirm.addEventListener('click', () => choose(input.value ? new Date(input.value) : null));
        input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); confirm.click(); } });
        panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } });
        openPanel = {panel,close}; requestAnimationFrame(place);
        addEventListener('pointerdown',outside,true); addEventListener('resize',place);
        panel.querySelector('.pw-reminder-option')?.focus();
    }

    function paint(dom) {
        if (!dom) return;
        const showing = active() && candidate(listFolder()) && !!reminderFolder && listFolder() === reminderFolder;
        let missing = false;
        dom.querySelectorAll('.messageListItem').forEach(row => {
            const message = typeof ko === 'undefined' ? null : ko.dataFor(row);
            const entry = showing && message?.uid ? entries.get(Number(message.uid)) : null;
            let badge = row.querySelector('.pw-reminder-badge');
            if (!entry) { badge?.remove(); if (showing && message?.uid) missing = true; return; }
            if (!badge) {
                badge = document.createElement('span'); badge.className = 'pw-reminder-badge';
                (row.querySelector('.subjectParent') || row).append(badge);
            }
            const text = entry.state === 'unscheduled' ? t('Sans date de rappel','No reminder time') : format(entry.remindAt);
            if (badge.dataset.state !== entry.state) badge.dataset.state = entry.state;
            if (badge.textContent !== text) badge.textContent = text;
            if (badge.title !== text) badge.title = text;
        });
        if (missing) {
            const asked = checked;
            load(false).then(() => { if (checked !== asked) paint(dom); });
        }
    }

    function mountList(vm) {
        if (vm.pwReminders) return;
        vm.pwReminders = true; listVM = vm;
        const dom = vm.viewModelDom, bar = dom.querySelector('.pw-selection-bar');
        const remind = document.createElement('button'); remind.type = 'button'; remind.className = 'pw-selection-remind';
        remind.setAttribute('aria-haspopup','dialog'); remind.setAttribute('aria-expanded','false');
        remind.append(glyph('clock') || '◷'); bar?.querySelector('.pw-selection-finish')?.before(remind);
        const selected = ko.computed(() => vm.messageList().filter(message => ko.unwrap(message.checked)));
        const update = () => {
            const folder = listFolder(), count = selected().length, available = inbox(folder) || candidate(folder);
            remind.hidden = !active() || !count || !available;
            const label = candidate(folder) ? t('Modifier le rappel','Change reminder') : t('Me le rappeler','Remind me');
            remind.title = label; remind.setAttribute('aria-label',label);
        };
        selected.subscribe(update); vm.messageList.subscribe(update); update();
        remind.addEventListener('click', () => {
            const messages = selected(), uids = [...new Set(messages.flatMap(messageUids))];
            if (!uids.length) return;
            const mode = candidate(listFolder()) ? 'reschedule' : 'set';
            picker(remind,uids,mode,() => {
                dom.querySelector('.pw-selection-finish')?.click();
                vm.reload?.();
                if (mode === 'reschedule') load(true).then(() => paint(dom));
            });
        });
        let frame = 0;
        const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); update(); }); };
        const refresh = () => active() && candidate(listFolder()) ? load(false).then(() => paint(dom)) : paint(dom);
        const observer = new MutationObserver(schedule); observer.observe(dom,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
        refresh();
        ko.utils.domNodeDisposal.addDisposeCallback(dom,() => {
            selected.dispose(); observer.disconnect(); cancelAnimationFrame(frame); remind.remove();
            if (listVM === vm) listVM = null;
        });
    }

    function mountReader(vm) {
        if (vm.pwReminderReader) return;
        const dom = vm.viewModelDom, actions = dom.querySelector('.pw-message-actions');
        const host = dom.querySelector('.messageView .b-message'), header = host?.querySelector(':scope > .messageItemHeader');
        if (!actions || !header || !vm.message?.subscribe) return;
        vm.pwReminderReader = true;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn pw-remind-message';
        button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-expanded','false'); button.append(glyph('clock') || '◷');
        actions.append(button);
        const bar = document.createElement('section'); bar.className = 'pw-reminder-bar'; bar.hidden = true;
        const text = document.createElement('p'); text.className = 'pw-reminder-text'; text.setAttribute('role','status');
        const wake = document.createElement('button'); wake.type = 'button'; wake.className = 'pw-reminder-wake';
        wake.textContent = t('Remettre dans la boîte de réception','Return to Inbox'); bar.append(text,wake); header.before(bar);
        let token = 0;
        const update = async () => {
            const message = vm.message?.(), folder = String(message?.folder || '');
            const available = active() && (inbox(folder) || candidate(folder));
            button.hidden = !available;
            const label = candidate(folder) ? t('Modifier le rappel','Change reminder') : t('Me le rappeler','Remind me');
            button.title = label; button.setAttribute('aria-label',label);
            if (!available || !candidate(folder) || !message?.uid) { bar.hidden = true; return; }
            const current = ++token;
            await load(!entries.has(Number(message.uid)));
            const entry = entries.get(Number(message.uid));
            if (current !== token || !entry || String(vm.message?.()?.folder || '') !== reminderFolder) { bar.hidden = true; return; }
            bar.hidden = false; bar.dataset.state = entry.state;
            text.textContent = entry.state === 'unscheduled' ? t('Ce message n’a pas de date de rappel.','This message has no reminder time.')
                : t('Rappel ', 'Reminder ') + format(entry.remindAt);
        };
        button.addEventListener('click', () => {
            const message = vm.message?.(), uids = messageUids(message), mode = candidate(message?.folder) ? 'reschedule' : 'set';
            if (!uids.length) return;
            picker(button,uids,mode,() => {
                listVM?.reload?.();
                if (mode === 'reschedule') load(true).then(update);
            });
        });
        wake.addEventListener('click', async () => {
            const uids = messageUids(vm.message?.());
            if (!uids.length || wake.disabled) return;
            wake.disabled = true; text.textContent = t('Retour dans la boîte de réception…','Returning to Inbox…');
            try {
                const result = await hook({operation:'wake',uids:uids.join(',')});
                uids.forEach(uid => entries.delete(uid)); checked = 0; bar.hidden = true; listVM?.reload?.();
                const count = Number(result.count || uids.length);
                toast(count > 1
                    ? t(`${count} messages remis dans la boîte de réception en non-lus.`, `${count} messages returned to Inbox as unread.`)
                    : t('Message remis dans la boîte de réception en non-lu.','Message returned to Inbox as unread.'));
            } catch (error) { text.textContent = reason(error); wake.disabled = false; }
        });
        const subscription = vm.message.subscribe(update); update();
        ko.utils.domNodeDisposal.addDisposeCallback(dom,() => { subscription.dispose(); button.remove(); bar.remove(); });
    }

    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'MailMessageList') mountList(vm);
        else if (vm.viewModelTemplateID === 'MailMessageView') mountReader(vm);
    });
})();
