/* Programmer un envoi. The schedule is the message itself, stored in its own folder with its
 * due time: this file only shows what the mailbox already says and asks the server to change it. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const LEAF = 'Scheduled';
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const lang = () => document.documentElement.lang || 'fr';
    const active = () => document.documentElement.classList.contains('pw-theme');
    let folder = '', entries = new Map(), inflight = null, checked = 0, listVM;

    const hook = (params, timeout = 60000) => new Promise((resolve, reject) => rl.pluginRemoteRequest(
        (code, data) => {
            const value = data?.Result;
            code || !value || value.error ? reject(new Error(value?.error || 'scheduled')) : resolve(value);
        }, 'PiedWebScheduledSend', params, timeout));
    const glyph = name => {
        const source = api.composerIcons?.[name];
        if (!source) return null;
        const template = document.createElement('template');
        template.innerHTML = source;
        const image = template.content.firstElementChild;
        image.setAttribute('aria-hidden','true'); image.setAttribute('focusable','false');
        return image;
    };
    const spell = value => api.formatSendAt?.(value) || String(value || '');
    // Knockout owns the lifetime of every native view; outside one, there is nothing to clean up.
    const onDispose = (node, handler) =>
        typeof ko !== 'undefined' && ko.utils?.domNodeDisposal?.addDisposeCallback(node, handler);
    const full = date => date.toLocaleString(lang(), {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
    const listFolder = () => String(rl.app?.messageList?.()?.folder || '');
    // Before the first answer the folder name is unknown; only a name that could be it is asked about.
    const candidate = name => !!name && (folder ? name === folder : name.endsWith(LEAF));

    function load(force) {
        if (inflight) return inflight;
        if (!force && Date.now() - checked < 5000) return Promise.resolve(entries);
        checked = Date.now();
        inflight = hook({operation:'list'}).then(result => {
            folder = String(result.folder || '');
            entries = new Map((result.entries || []).map(entry => [Number(entry.uid), entry]));
            return entries;
        }).catch(() => entries).finally(() => { inflight = null; });
        return inflight;
    }
    api.scheduledChanged = () => { checked = 0; load(true).then(() => paint()); };

    /* The composer control. The panel offers the three times that are actually asked for and
     * a field for every other one; the native Send button is left exactly as it is. */
    function mountComposer(vm) {
        const dom = vm.viewModelDom, header = dom?.querySelector('header');
        const send = header?.querySelector('a.btn[data-bind*="sendCommand"]') || header?.querySelector('a.btn');
        if (!send || header.querySelector('.pw-schedule-wrap')) return;
        const wrap = document.createElement('span'); wrap.className = 'pw-schedule-wrap';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn pw-schedule';
        const label = document.createElement('span'); label.className = 'hide-mobile'; label.textContent = t('Programmer', 'Schedule');
        const icon = glyph('clock'); icon && button.append(icon);
        button.append(label);
        button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
        const title = t('Programmer l’envoi', 'Schedule the send');
        button.title = title; button.setAttribute('aria-label', title);
        const panel = document.createElement('div'); panel.className = 'pw-schedule-panel'; panel.hidden = true;
        panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', title);
        const heading = document.createElement('p'); heading.className = 'pw-schedule-title'; heading.textContent = title;
        const options = document.createElement('div'); options.className = 'pw-schedule-options';
        const custom = document.createElement('label'); custom.className = 'pw-schedule-custom';
        const customText = document.createElement('span'); customText.textContent = t('Autre date et heure', 'Another date and time');
        const input = document.createElement('input'); input.type = 'datetime-local'; input.step = '60';
        custom.append(customText, input);
        const actions = document.createElement('div'); actions.className = 'pw-schedule-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'pw-schedule-cancel';
        cancel.textContent = t('Annuler', 'Cancel');
        const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'pw-schedule-confirm';
        confirm.textContent = t('Programmer', 'Schedule');
        actions.append(cancel, confirm);
        const note = document.createElement('p'); note.className = 'pw-schedule-note'; note.setAttribute('role', 'status');
        panel.append(heading, options, custom, actions, note);
        wrap.append(button, panel); send.after(wrap);

        const stamp = date => {
            const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
            return local.toISOString().slice(0, 16);
        };
        const presets = () => {
            const now = new Date(), at = (days, hour) => {
                const date = new Date(now); date.setDate(date.getDate() + days); date.setHours(hour, 0, 0, 0); return date;
            };
            const list = [], evening = at(0, 18), morning = at(1, 8), monday = at(1, 8);
            if (evening.getTime() > now.getTime() + 60000) list.push([t('Ce soir', 'This evening'), evening]);
            list.push([t('Demain matin', 'Tomorrow morning'), morning]);
            while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);
            if (monday.getTime() !== morning.getTime()) list.push([t('Lundi matin', 'Monday morning'), monday]);
            return list;
        };
        const say = text => { note.textContent = text || ''; note.hidden = !text; };
        const choose = async date => {
            if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return say(t('Date incomplète.', 'Incomplete date.'));
            if (date.getTime() < Date.now() + 30000) return say(t('Choisissez un moment à venir.', 'Choose a time in the future.'));
            confirm.disabled = true; options.querySelectorAll('button').forEach(node => node.disabled = true);
            say(t('Programmation…', 'Scheduling…'));
            const done = await api.scheduleSend?.(date.toISOString());
            confirm.disabled = false; options.querySelectorAll('button').forEach(node => node.disabled = false);
            // A refusal is already explained on the composer itself, next to what caused it.
            done ? close(false) : say(t('Message non programmé. Il reste ouvert.', 'Not scheduled. The message stays open.'));
        };
        const open = () => {
            options.replaceChildren();
            presets().forEach(([name, date]) => {
                const option = document.createElement('button'); option.type = 'button'; option.className = 'pw-schedule-option';
                const when = document.createElement('span'); when.className = 'pw-schedule-when'; when.textContent = name;
                const detail = document.createElement('span'); detail.className = 'pw-schedule-detail'; detail.textContent = full(date);
                option.append(when, detail);
                option.addEventListener('click', () => choose(date));
                options.append(option);
            });
            const now = new Date();
            input.min = stamp(new Date(now.getTime() + 60000));
            if (!input.value) input.value = stamp(presets().at(-1)[1]);
            say(''); panel.hidden = false; button.setAttribute('aria-expanded', 'true');
            (options.querySelector('button') || input).focus();
            addEventListener('pointerdown', outside, true);
        };
        const close = focus => {
            if (panel.hidden) return;
            panel.hidden = true; button.setAttribute('aria-expanded', 'false'); say('');
            removeEventListener('pointerdown', outside, true);
            focus && button.focus();
        };
        const outside = event => { if (!wrap.contains(event.target)) close(false); };
        button.addEventListener('click', () => panel.hidden ? open() : close(true));
        cancel.addEventListener('click', () => close(true));
        confirm.addEventListener('click', () => choose(input.value ? new Date(input.value) : null));
        input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); confirm.click(); } });
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        });
        const update = () => {
            const ready = active() && api.canSchedule?.() !== false;
            wrap.hidden = !ready;
            if (!ready) close(false);
        };
        update();
        vm.modalVisible?.subscribe(value => { update(); if (!value) close(false); });
        onDispose(dom, () => { removeEventListener('pointerdown', outside, true); wrap.remove(); });
    }

    /* The scheduled folder reads as a queue: every row says when it leaves, and a row the
     * sender is holding or could not send says that instead. */
    function paint(dom) {
        const host = dom || document.getElementById('V-MailMessageList');
        if (!host) return;
        const showing = active() && candidate(listFolder()) && !!folder && listFolder() === folder;
        let missing = false;
        host.querySelectorAll('.messageListItem').forEach(row => {
            const message = typeof ko === 'undefined' ? null : ko.dataFor(row);
            const entry = showing && message?.uid ? entries.get(Number(message.uid)) : null;
            let badge = row.querySelector(':scope .pw-schedule-badge');
            if (!entry) {
                badge?.remove();
                if (showing && message?.uid) missing = true;
                return;
            }
            if (!badge) {
                badge = document.createElement('span'); badge.className = 'pw-schedule-badge';
                (row.querySelector('.subjectParent') || row).append(badge);
            }
            const text = entry.state === 'failed' ? t('Envoi échoué', 'Send failed')
                : entry.state === 'sending' ? t('Envoi en cours', 'Sending')
                    : entry.state === 'sent' ? t('Envoyé, à ranger', 'Sent, not filed')
                        : entry.state === 'unscheduled' ? t('Sans date d’envoi', 'No send time')
                            : spell(entry.sendAt);
            const title = entry.sendAt ? t('Envoi programmé ', 'Scheduled to leave ') + spell(entry.sendAt) : text;
            // Writing what is already there is still a mutation, and the observer would call
            // this again for it. Every write below has to be worth the repaint it causes.
            if (badge.dataset.state !== entry.state) badge.dataset.state = entry.state;
            if (badge.textContent !== text) badge.textContent = text;
            if (badge.title !== title) badge.title = title;
        });
        // A row the last answer did not describe means the folder moved since. Ask again, but
        // repaint only when the answer is new: a request the cooldown refused ends here.
        if (missing) {
            const asked = checked;
            load(false).then(() => { if (checked !== asked) paint(host); });
        }
    }

    function mountList(vm) {
        if (vm.pwScheduledList) return;
        vm.pwScheduledList = true; listVM = vm;
        const dom = vm.viewModelDom;
        let frame = 0;
        const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); };
        const refresh = () => {
            if (active() && candidate(listFolder())) load(false).then(() => paint(dom));
            else paint(dom);
        };
        const observer = new MutationObserver(schedule);
        observer.observe(dom, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class']});
        refresh();
        onDispose(dom, () => { observer.disconnect(); cancelAnimationFrame(frame); });
    }

    /* An open scheduled message is not a draft the composer can hold: it is already written.
     * The one action it needs is to stop being scheduled and go back to Drafts. */
    function mountReader(vm) {
        if (vm.pwScheduledReader) return;
        const dom = vm.viewModelDom, host = dom?.querySelector('.messageView .b-message');
        const header = host?.querySelector(':scope > .messageItemHeader');
        if (!header || !vm.message?.subscribe) return;
        vm.pwScheduledReader = true;
        const bar = document.createElement('section'); bar.className = 'pw-scheduled-bar'; bar.hidden = true;
        const text = document.createElement('p'); text.className = 'pw-scheduled-text'; text.setAttribute('role', 'status');
        const back = document.createElement('button'); back.type = 'button'; back.className = 'pw-scheduled-back';
        back.textContent = t('Remettre en brouillon', 'Move back to Drafts');
        bar.append(text, back); header.before(bar);
        let shown = 0;
        const update = async () => {
            const message = vm.message?.(), uid = Number(message?.uid || 0);
            if (!active() || !uid || !message.folder || !candidate(message.folder)) { bar.hidden = true; return; }
            const token = ++shown;
            let entry = entries.get(uid);
            // Opening a message is deliberate and rare: an unknown one is worth a fresh answer
            // rather than a cooled-down one that would leave the bar out of the reader.
            if (!entry || message.folder !== folder) { await load(!entry); entry = entries.get(uid); }
            if (token !== shown || message.folder !== folder) { bar.hidden = true; return; }
            if (!entry) { bar.hidden = true; return; }
            bar.hidden = false;
            bar.dataset.state = entry.state;
            back.disabled = ['sending','sent'].includes(entry.state);
            text.textContent = entry.state === 'failed'
                ? t('Envoi programmé non abouti. Le message est resté ici.', 'The scheduled send did not go through. The message stayed here.')
                : entry.state === 'sending' ? t('Le serveur est en train d’envoyer ce message.', 'The server is sending this message.')
                    : entry.state === 'sent' ? t('Ce message est parti ; sa copie n’a pas pu être rangée dans Envoyés.', 'This message left; its copy could not be filed in Sent.')
                        : entry.state === 'unscheduled' ? t('Ce message n’a pas de date d’envoi.', 'This message has no send time.')
                            : t('Envoi programmé ', 'Scheduled to leave ') + spell(entry.sendAt);
        };
        back.addEventListener('click', async () => {
            const message = vm.message?.(), uid = Number(message?.uid || 0);
            if (!uid || back.disabled) return;
            back.disabled = true; text.textContent = t('Annulation…', 'Cancelling…');
            try {
                await hook({operation:'cancel', uid, mode:'draft'});
                bar.hidden = true; entries.delete(uid); checked = 0;
                listVM?.reload?.(); load(true).then(() => paint());
            } catch (error) {
                back.disabled = false;
                text.textContent = String(error?.message) === 'sending'
                    ? t('Trop tard : le serveur a pris ce message en charge.', 'Too late: the server already took this message.')
                    : t('Annulation impossible pour le moment.', 'Cancelling is unavailable right now.');
            }
        });
        const subscription = vm.message.subscribe(() => update());
        update();
        onDispose(dom, () => { subscription.dispose(); bar.remove(); });
    }

    addEventListener('rl-view-model.create', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'PopupsCompose' && !vm.pwScheduleControl) {
            vm.pwScheduleControl = true;
            queueMicrotask(() => vm.viewModelDom && mountComposer(vm));
        }
    });
    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'MailMessageList') mountList(vm);
        else if (vm.viewModelTemplateID === 'MailMessageView') mountReader(vm);
        else if (vm.viewModelTemplateID === 'PopupsCompose' && !vm.pwScheduleControl) {
            vm.pwScheduleControl = true; mountComposer(vm);
        }
    });
})();
