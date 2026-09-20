/* Outgoing messages own their state. No delayed callback reads the next composer. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const jobs = [], clock = api.backgroundSendClock || {
        now: () => Date.now(), later: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id)
    };
    const dialogOrder = new WeakMap();
    let dialogSerial = 0;
    let compose, listView, host, serial = 0, activeSend, preparing = false, restoring = false, leaving = false;
    const fr = () => (document.documentElement.lang || 'fr').startsWith('fr');
    const t = (a, b) => fr() ? a : b;
    const identity = () => rl.settings.get('accountHash') || rl.settings.get('Email') || '';
    const dataFields = ['currentIdentity','from','to','cc','bcc','replyTo','subject','requestDsn',
        'requestReadReceipt','requireTLS','markAsImportant','showCc','showBcc','showReplyTo',
        'doSign','doEncrypt','draftsFolder','draftUid','savedTime'];
    const plainFields = ['aDraftInfo','sInReplyTo','sReferences','bFromDraft'];
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    const occupied = () => jobs.some(job => ['waiting','ready','sending'].includes(job.phase) || !job.durable && !['sent','copy-error'].includes(job.phase)) || preparing || restoring;
    const draftFolder = () => rl.settings.get('DraftsFolder');
    const canSaveDraft = () => !!draftFolder() && draftFolder() !== '__UNUSE__';
    const proto = vm => Object.getPrototypeOf(vm);
    // Plugin hooks answer through the native plugin dispatcher, not the message endpoint.
    const hook = (params, timeout = 60000) => new Promise((resolve, reject) => rl.pluginRemoteRequest(
        (code, data) => {
            const value = data?.Result;
            code || !value || value.error ? reject(new Error(value?.error || 'scheduled')) : resolve(value);
        }, 'PiedWebScheduledSend', params, timeout));
    const when = value => {
        const date = new Date(value), lang = document.documentElement.lang || 'fr';
        if (!Number.isFinite(date.getTime())) return '';
        const time = date.toLocaleTimeString(lang, {hour:'2-digit', minute:'2-digit'});
        const day = new Date(date); day.setHours(0,0,0,0);
        const today = new Date(); today.setHours(0,0,0,0);
        const days = Math.round((day - today) / 86400000);
        if (days === 0) return t('aujourd’hui à ', 'today at ') + time;
        if (days === 1) return t('demain à ', 'tomorrow at ') + time;
        return date.toLocaleDateString(lang, {weekday:'long', day:'numeric', month:'long'}) + t(' à ', ' at ') + time;
    };

    // Native Remote keeps one timeout controller per action. Serialize draft writes
    // (including autosave) so a newer save cannot take over an older save's timeout.
    function serializeDraftWrites() {
        const remote = rl.app.Remote;
        if (remote.pwDraftQueue) return;
        remote.pwDraftQueue = true;
        const request = remote.request, queue = [];
        let active;
        const next = () => {
            if (active || !queue.length) return;
            active = queue.shift();
            const entry = active;
            entry.done = (...result) => {
                if (entry.finished) return;
                entry.finished = true;
                try { entry.callback?.(...result); }
                finally { active = null; queueMicrotask(next); }
            };
            try { request.call(remote, 'SaveMessage', entry.done, ...entry.args); }
            catch (error) { entry.done(1, {message:String(error)}); }
        };
        remote.request = function(action, callback, ...args) {
            // The native crypt-key prompt can retry the same request internally.
            if (action !== 'SaveMessage' || callback === active?.done) return request.call(this,action,callback,...args);
            queue.push({callback,args}); next();
        };
    }
    function cloneAttachment(item) {
        const copy = new item.constructor(item.id, item.fileName(), item.size(), item.isInline, item.isLinked, item.cId, item.contentLocation);
        ['tempName','type','progress','error','waiting','uploading','enabled','complete'].forEach(key => copy[key](item[key]()));
        copy.fromMessage = item.fromMessage;
        return copy;
    }
    function capture(vm) {
        const state = {fields:{}, plain:{}, html:vm.oEditor.isHtml(), body:vm.oEditor.getData(),
            mode:vm.oEditor.editor?.mode, raw:vm.oEditor.editor?.plain?.value,
            attachments:vm.attachments().map(cloneAttachment), source:vm.pwReplyMessage,
            mailvelope:vm.viewArea() === 'mailvelope' ? vm.mailvelope : null, signOptions:[...vm.signOptions()], encryptOptions:[...vm.encryptOptions()]};
        dataFields.forEach(key => state.fields[key] = vm[key]());
        plainFields.forEach(key => state.plain[key] = Array.isArray(vm[key]) ? [...vm[key]] : vm[key]);
        return state;
    }
    // Native save/send methods run against these independent observables, never UI bindings.
    function shadow(vm, state) {
        const copy = Object.create(proto(vm));
        dataFields.forEach(key => copy[key] = ko.observable(state.fields[key]));
        Object.assign(copy, state.plain);
        ['sending','saving','savedError','sendError','sendSuccessButSaveError','emptyToError',
            'attachmentsInProcessError','attachmentsInErrorError'].forEach(key => copy[key] = ko.observable(false));
        ['sendErrorDesc','savedErrorDesc'].forEach(key => copy[key] = ko.observable(''));
        copy.attachments = ko.observableArray(state.attachments);
        copy.signOptions = ko.observableArray(state.signOptions);
        copy.encryptOptions = ko.observableArray(state.encryptOptions);
        copy.attachmentsInProcess = copy.attachmentsInError = () => [];
        copy.oEditor = {getData:()=>state.body, isHtml:()=>state.html};
        copy.mailvelope = state.mailvelope;
        copy.viewArea = () => state.mailvelope ? 'mailvelope' : 'body';
        copy.autosaveStart = copy.attachmentsArea = () => {};
        copy.close = () => { copy.pwSent = true; };
        // Native SaveMessage must not close a different message now open in the reader.
        copy.bFromDraft = false;
        return copy;
    }
    function nativeSave(vm, copy) {
        return new Promise((resolve, reject) => {
            let observed = false, finished = false;
            const subscription = copy.saving.subscribe(value => {
                if (value) observed = true;
                if (!value && observed) queueMicrotask(() => {
                    if (finished) return;
                    finished = true; subscription.dispose();
                    copy.savedError() ? reject(new Error(copy.savedErrorDesc())) : resolve();
                });
            });
            try { proto(vm).saveCommand.call(copy); }
            catch (error) { finished = true; subscription.dispose(); reject(error); }
            if (!copy.saving() && !observed) { finished = true; subscription.dispose(); reject(new Error(t('Brouillons indisponibles.', 'Drafts unavailable.'))); }
        });
    }
    function lock(vm) {
        const elements = [...vm.viewModelDom.children].filter(el => el !== host).map(el => [el, el.inert]);
        elements.forEach(([el]) => el.inert = true);
        return () => elements.forEach(([el, value]) => el.inert = value);
    }
    async function hideComposer(vm) {
        vm.constructor.inEdit(false);
        vm.close();
        await tick(); // The native modalVisible observable notifies at rateLimit:0.
        if (!vm.modalVisible()) vm.viewModelDom.close();
        placeHost();
    }
    function remove(job) {
        clock.clear(job.noticeTimer);
        const index = jobs.indexOf(job); if (index >= 0) jobs.splice(index, 1);
        job.node?.remove(); job.state.attachments.forEach(item => item.onDestroy?.());
        placeHost();
    }
    async function restore(job) {
        if (restoring || preparing || job.phase === 'sending' || identity() !== job.account) return;
        if (['waiting','ready'].includes(job.phase)) {
            job.timer.cancel(); job.phase = 'cancelled'; render(job); pump();
        }
        restoring = true;
        const vm = compose;
        let unlock = () => {};
        try {
            await job.persist; // A pending SaveMessage may still replace the original draft UID.
            // If a second draft is open, save it first instead of overwriting it.
            if ((vm.modalVisible() || vm.constructor.inEdit()) && !vm.isEmptyForm()) {
                if (!canSaveDraft() || vm.saving() || vm.sending() || vm.attachmentsInProcess().length) {
                    job.detail = t('Terminez ou enregistrez la rédaction en cours pour reprendre ce message.', 'Finish or save the current draft to reopen this message.');
                    render(job); return;
                }
                unlock = lock(vm);
                await nativeSave(vm, vm);
                await hideComposer(vm);
                unlock(); unlock = () => {};
            }
            vm.constructor.inEdit(false);
            vm.constructor.showModal();
            vm.currentIdentity(job.state.fields.currentIdentity);
            dataFields.filter(key => !['currentIdentity','draftsFolder','draftUid','savedTime'].includes(key))
                .forEach(key => vm[key](job.state.fields[key]));
            ['draftsFolder','draftUid','savedTime'].forEach(key => vm[key](job.copy[key]()));
            Object.assign(vm, job.state.plain);
            vm.pwReplyMessage = job.state.source;
            vm.attachments(job.state.attachments.map(cloneAttachment));
            vm.bodyArea();
            const body = job.armoredDraft || job.state.body;
            job.state.html && !job.armoredDraft ? vm.oEditor.setHtml(body) : vm.oEditor.setPlain(body);
            if (job.armoredDraft) {
                // Mailvelope's createDraft result is a draft even if server Drafts
                // are disabled or saving failed. Select its native armoredDraft path.
                const isDraft = vm.isDraft;
                try { vm.isDraft = () => true; vm.viewArea('mailvelope'); }
                finally { vm.isDraft = isDraft; }
            }
            else if (['markdown','source'].includes(job.state.mode)) {
                vm.oEditor.editor.setMode(job.state.mode);
                vm.oEditor.editor.plain.value = job.state.raw;
            }
            if (job.phase === 'error') { vm.sendError(true); vm.sendErrorDesc(job.detail); }
            vm.autosaveStart(); vm.oEditor.focus();
            remove(job);
        } catch (error) {
            job.detail = t('La rédaction en cours est conservée. ', 'The current draft is preserved. ') + String(error.message || error);
            render(job);
        } finally { unlock(); restoring = false; placeHost(); }
    }
    // Skipping the countdown never skips the draft save: pump() still waits for job.persisted,
    // and Undo stays available until the request actually leaves.
    function sendNow(job) {
        if (job.phase !== 'waiting') return;
        job.timer.cancel(); job.seconds = 0; job.phase = 'ready';
        render(job); pump();
    }
    function glyph(name) {
        const source = api.composerIcons?.[name];
        if (!source) return null;
        const template = document.createElement('template');
        template.innerHTML = source;
        const image = template.content.firstElementChild;
        image.setAttribute('aria-hidden','true'); image.setAttribute('focusable','false');
        return image;
    }
    function render(job) {
        if (!job.node) {
            job.node = document.createElement('div'); job.node.className = 'pw-outgoing-message';
            job.node.innerHTML = '<div class="pw-outgoing-text"><span class="pw-outgoing-status" role="status"></span><span class="pw-outgoing-subject"></span><span class="pw-outgoing-detail"></span></div><button type="button" class="pw-outgoing-now" hidden></button><button type="button" class="pw-outgoing-action"></button>';
            const now = job.node.querySelector('.pw-outgoing-now'), label = t('Envoyer maintenant', 'Send now');
            now.append(glyph('send-horizontal') || t('Envoyer', 'Send'));
            now.setAttribute('aria-label', label); now.title = label;
            now.addEventListener('click', () => sendNow(job));
            job.node.querySelector('.pw-outgoing-action').addEventListener('click', () => {
                if (['sent','copy-error','draft-saved'].includes(job.phase)) remove(job);
                else if (job.phase === 'scheduled') unschedule(job);
                else restore(job);
            });
            ensureHost().append(job.node);
        }
        const messages = {
            waiting:t('Envoi en attente', 'Send pending'), ready:t('Envoi en attente', 'Send pending'),
            sending:t('Envoi en cours…', 'Sending…'), sent:t('Message envoyé', 'Message sent'),
            cancelled:t('Envoi annulé', 'Send cancelled'), error:t('Envoi non confirmé', 'Send not confirmed'),
            'copy-error':t('Envoyé, copie non enregistrée', 'Sent, but copy could not be saved'),
            'saving-draft':t('Enregistrement du brouillon…', 'Saving draft…'),
            'draft-saved':t('Brouillon enregistré', 'Draft saved'),
            scheduling:t('Programmation…', 'Scheduling…'), scheduled:t('Envoi programmé', 'Send scheduled')
        };
        const status = job.node.querySelector('.pw-outgoing-status');
        if (status.textContent !== messages[job.phase]) status.textContent = messages[job.phase];
        job.node.querySelector('.pw-outgoing-subject').textContent = job.state.fields.subject || t('(Sans objet)', '(No subject)');
        job.node.querySelector('.pw-outgoing-detail').textContent = job.detail || '';
        job.node.querySelector('.pw-outgoing-now').hidden = job.phase !== 'waiting';
        const button = job.node.querySelector('.pw-outgoing-action');
        button.disabled = ['sending','scheduling','saving-draft'].includes(job.phase);
        button.textContent = ['waiting','ready','scheduled'].includes(job.phase)
            ? t('Annuler', 'Undo') + (job.seconds ? ` (${job.seconds})` : '')
            : job.phase === 'sending' ? t('Envoi…', 'Sending…')
                : job.phase === 'scheduling' ? t('Programmation…', 'Scheduling…')
                    : job.phase === 'saving-draft' ? t('Enregistrement…', 'Saving…')
                    : ['sent','copy-error','draft-saved'].includes(job.phase) ? t('Fermer', 'Dismiss') : t('Reprendre', 'Resume');
        button.setAttribute('aria-label', ['waiting','ready'].includes(job.phase) ? t('Annuler l’envoi', 'Undo send')
            : job.phase === 'scheduled' ? t('Annuler l’envoi programmé', 'Cancel the scheduled send') : button.textContent);
        placeHost();
    }
    function ensureHost() {
        if (host) return host;
        host = document.createElement('aside'); host.className = 'pw-outgoing-notices';
        host.setAttribute('aria-label', t('Envois de messages', 'Outgoing messages'));
        if ('showPopover' in host) host.setAttribute('popover', 'manual');
        (document.getElementById('rl-app') || document.body).append(host);
        document.querySelectorAll('dialog[open]').forEach(dialog => dialogOrder.set(dialog, ++dialogSerial));
        new MutationObserver(records => {
            let changed = false;
            records.forEach(record => {
                if (record.target.tagName === 'DIALOG' && record.attributeName === 'open') {
                    if (record.target.open) dialogOrder.set(record.target, ++dialogSerial);
                    changed = true;
                }
            });
            if (changed) placeHost();
        }).observe(document.body, {subtree:true,attributes:true,attributeFilter:['open']});
        return host;
    }
    function placeHost() {
        if (!host) return;
        const dialogs = [...document.querySelectorAll('dialog[open]')]
            .filter(dialog => !dialog.classList.contains('pw-inline-reply'))
            .sort((a,b)=>(dialogOrder.get(a)||0)-(dialogOrder.get(b)||0));
        const parent = dialogs.at(-1) || document.getElementById('rl-app') || document.body;
        if (!jobs.length) { if ((host.showPopover && host.matches(':popover-open'))) host.hidePopover(); host.hidden = true; return; }
        host.hidden = false;
        if (host.parentNode !== parent) { if ((host.showPopover && host.matches(':popover-open'))) host.hidePopover(); parent.append(host); }
        if (host.showPopover && !(host.showPopover && host.matches(':popover-open'))) host.showPopover();
    }
    function addFlag(message, flag) {
        const flags = message?.flags;
        if (!flag || typeof flags !== 'function' || flags().includes(flag)) return false;
        flags.push(flag); return true;
    }
    function sent(job, flag) {
        const draft = job.state.plain.aDraftInfo;
        const folder = String(draft?.[2] || job.state.source?.folder || '');
        const uid = Number(draft?.[1] || job.state.source?.uid || 0);
        addFlag(job.state.source, flag);
        const rows = typeof listView?.messageList === 'function' ? listView.messageList() : [];
        if (flag && folder && uid > 0 && Array.isArray(rows)) rows.forEach(message => {
            const thread = typeof message?.threads === 'function' ? message.threads() : [];
            if (message?.folder === folder && (Number(message.uid) === uid
                || thread.some(value => Number(value) === uid))) addFlag(message, flag);
        });
        dispatchEvent(new CustomEvent('pw-message-sent', {
            detail:{account:job.account,folder,uid,flag:flag || ''}
        }));
    }
    function pump() {
        if (activeSend || leaving) return;
        const job = jobs.find(item => item.phase === 'ready' && item.persisted);
        if (!job) return;
        if (identity() !== job.account) { job.phase='cancelled'; job.detail=t('Revenez au compte d’origine pour reprendre ce brouillon.', 'Return to the original account to resume this draft.'); render(job); pump(); return; }
        activeSend = job; job.phase = 'sending'; render(job);
        const copy = job.copy;
        // Native code captures a mutable global oLastMessage. Its server request still
        // carries the real draftInfo; update the captured original message ourselves.
        copy.aDraftInfo = null;
        const subscription = copy.sending.subscribe(value => {
            if (value) return;
            queueMicrotask(() => {
                subscription.dispose(); activeSend = null;
                if (copy.sendSuccessButSaveError()) {
                    job.phase = 'copy-error'; job.detail = copy.savedErrorDesc();
                } else if (copy.pwSent) {
                    job.phase = 'sent';
                    const flag = {reply:'\\answered','reply-all':'\\answered',forward:'$forwarded'}[job.state.plain.aDraftInfo?.[0]];
                    sent(job,flag);
                    // Native send keeps the replied/forwarded row model in place and
                    // changes its flag. Replacing that model here made the immediate
                    // visual state disappear, especially for a conversation row.
                    if (!flag) listView?.reload?.();
                    job.noticeTimer = clock.later(() => remove(job), 3500);
                } else {
                    job.phase = 'error'; job.detail = copy.sendErrorDesc() || t('Vérifiez les Envoyés avant de réessayer.', 'Check Sent before trying again.');
                }
                render(job); pump();
            });
        });
        try { proto(compose).sendCommand.call(copy); }
        catch (error) { copy.sendError(true); copy.sendErrorDesc(String(error)); copy.sending(false); }
    }
    async function send(vm, original, args) {
        if (!original.canExecute() || preparing || restoring || !vm.modalVisible()) return;
        if (vm.attachmentsInProcess().length || vm.attachmentsInError().length ||
            !(vm.to().trim() || vm.cc().trim() || vm.bcc().trim()) || vm.sentFolder() === '') return original.apply(vm,args);
        preparing = true;
        const unlock = lock(vm); vm.sending(true);
        let state;
        try {
            state = capture(vm);
            const copy = shadow(vm,state), target = vm.sentFolder();
            const prepareParams = proto(vm).getMessageRequestParams.bind(copy);
            // Complete crypto/MIME preparation before resetting any editor or attachment.
            const params = await prepareParams(target);
            const draftParams = canSaveDraft() || state.mailvelope ? await prepareParams(draftFolder(),1) : null;
            if (!vm.modalVisible() || leaving) { state.attachments.forEach(item => item.onDestroy?.()); return; }
            copy.getMessageRequestParams = (_folder,draft) => Promise.resolve(draft ? {...draftParams} :
                {...params, messageFolder:copy.draftsFolder(), messageUid:copy.draftUid()});
            copy.sentFolder = () => target;
            copy.mailvelope = null;
            const job = {id:++serial,state,copy,account:identity(),armoredDraft:state.mailvelope ? draftParams.encrypted : '',
                phase:'waiting',seconds:api.sendDelaySeconds,persisted:!canSaveDraft(),durable:false};
            job.timer = api.createSendDelay(seconds => {job.seconds=seconds;render(job);},clock);
            jobs.push(job);
            // Saving runs alongside the countdown, with the composer already released.
            // Never send until persistence has finished; Undo can cancel at any point.
            job.persist = canSaveDraft() ? nativeSave(vm,copy).then(() => {
                job.persisted = job.durable = true; pump();
            }).catch(error => {
                job.timer.cancel();
                if (job.phase !== 'cancelled') {
                    job.phase='error'; job.detail=t('Brouillon non enregistré. Aucun envoi effectué. ', 'Draft not saved. Nothing was sent. ') + String(error.message || error);
                    render(job);
                }
            }) : Promise.resolve();
            render(job);
            vm.sending(false); unlock();
            await hideComposer(vm);
            if (job.phase === 'waiting') job.timer.start(() => {job.phase='ready';render(job);pump();});
        } catch (error) {
            vm.sendError(true); vm.sendErrorDesc(String(error.message || error));
            state?.attachments.forEach(item => item.onDestroy?.());
        } finally { vm.sending(false); unlock(); preparing=false; }
    }
    async function closeAsDraft(vm, original, args) {
        if (preparing || restoring || !vm.modalVisible?.()) return false;
        if (vm.isEmptyForm?.(false) && !Number(vm.draftUid?.() || 0)) {
            await hideComposer(vm); return true;
        }
        if (!canSaveDraft()) {
            vm.savedError?.(true);
            vm.savedErrorDesc?.(t('Configurez un dossier Brouillons avant de fermer.', 'Configure a Drafts folder before closing.'));
            return false;
        }
        if (vm.attachmentsInProcess?.().length || vm.saving?.() || vm.sending?.()) {
            vm.attachmentsInProcessError?.(!!vm.attachmentsInProcess?.().length);
            vm.attachmentsArea?.(); return false;
        }
        preparing = true;
        let state;
        try {
            state = capture(vm);
            const copy = shadow(vm,state);
            const job = {id:++serial,state,copy,account:identity(),armoredDraft:'',phase:'saving-draft',seconds:0,
                persisted:false,durable:false,detail:'',persist:null};
            jobs.push(job); render(job);
            job.persist = nativeSave(vm,copy).then(() => {
                job.persisted = job.durable = true; job.phase = 'draft-saved'; render(job);
                job.noticeTimer = clock.later(() => remove(job),3500);
            }).catch(error => {
                job.persisted = true; job.phase = 'error';
                job.detail = t('Brouillon non enregistré. Reprenez-le pour réessayer. ', 'Draft not saved. Resume it to try again. ')
                    + String(error.message || error);
                render(job);
            });
            await hideComposer(vm);
            return true;
        } catch (error) {
            state?.attachments.forEach(item => item.onDestroy?.());
            vm.savedError?.(true); vm.savedErrorDesc?.(String(error.message || error));
            return original?.apply(vm,args);
        } finally { preparing = false; }
    }
    const reason = error => ({
        drafts: t('Activez un dossier Brouillons pour programmer un envoi.', 'Enable a Drafts folder to schedule a send.'),
        folder: t('Le dossier des envois programmés est indisponible.', 'The scheduled folder is unavailable.'),
        time: t('Choisissez une date d’envoi à venir.', 'Choose a send time in the future.'),
        sending: t('Le serveur a déjà pris ce message en charge.', 'The server already took this message.'),
        missing: t('Ce message n’est plus dans les envois programmés.', 'This message is no longer scheduled.'),
        sender: t('Aucun envoi programmé n’est actif sur ce serveur.', 'No scheduled sender is running on this server.')
    })[String(error?.message || '')] || t('Programmation indisponible pour le moment.', 'Scheduling is unavailable right now.');
    // What is stored is the finished message, not a draft of it: the server hands that exact
    // copy to SMTP, so it is prepared the way a send prepares it, signatures and all.
    async function schedule(vm, iso) {
        if (!vm || preparing || restoring || !vm.modalVisible() || !vm.sendCommand.canExecute()) return false;
        if (!(vm.to().trim() || vm.cc().trim() || vm.bcc().trim())) { vm.emptyToError(true); return false; }
        if (vm.attachmentsInProcess().length) { vm.attachmentsInProcessError(true); vm.attachmentsArea(); return false; }
        if (vm.attachmentsInError().length) { vm.attachmentsInErrorError(true); vm.attachmentsArea(); return false; }
        preparing = true;
        const unlock = lock(vm); vm.sending(true);
        let state;
        try {
            const queue = await hook({operation:'folder'});
            const folder = String(queue.folder || '');
            if (!folder) throw new Error('folder');
            // Park a message only where something is running that will come and take it.
            if (!(Number(queue.sender) > 0) || Date.now() / 1000 - Number(queue.sender) > 1800) throw new Error('sender');
            state = capture(vm);
            const copy = shadow(vm, state);
            const params = await proto(vm).getMessageRequestParams.call(copy, folder);
            params.pwSendAt = iso;
            if (!vm.modalVisible() || leaving) { state.attachments.forEach(item => item.onDestroy?.()); return false; }
            const job = {id:++serial, state, copy, account:identity(), armoredDraft:'', phase:'scheduling',
                seconds:0, persisted:true, durable:false, sendAt:iso, persist:Promise.resolve(), detail:when(iso)};
            jobs.push(job); render(job);
            vm.sending(false); unlock();
            await hideComposer(vm);
            store(job, params);
            return true;
        } catch (error) {
            vm.sendError(true); vm.sendErrorDesc(reason(error));
            state?.attachments.forEach(item => item.onDestroy?.());
            return false;
        } finally { vm.sending(false); unlock(); preparing = false; }
    }
    function store(job, params) {
        // The same serialized queue as every other draft write: an autosave cannot overtake it.
        rl.app.Remote.request('SaveMessage', (code, data) => {
            const result = data?.Result;
            if (!code && result?.folder && result.uid) {
                job.phase = 'scheduled'; job.durable = true;
                job.folder = result.folder; job.uid = result.uid; job.detail = when(job.sendAt);
                // The stored copy replaced the draft it came from; a resume must not delete a third.
                job.copy.draftsFolder(''); job.copy.draftUid(0);
                job.noticeTimer = clock.later(() => remove(job), 8000);
                listView?.reload?.();
                api.scheduledChanged?.();
            } else {
                job.phase = 'error';
                job.detail = t('Message non programmé. Reprenez-le pour réessayer.', 'The message was not scheduled. Resume it to try again.');
            }
            render(job);
        }, params, 200000);
    }
    // Cancelling hands the message back to the composer, which is why the stored copy goes
    // away instead of returning to Drafts: the content is on screen again, in one place.
    async function unschedule(job) {
        if (job.phase !== 'scheduled' || job.busy) return;
        job.busy = true; clock.clear(job.noticeTimer);
        job.detail = t('Annulation…', 'Cancelling…'); render(job);
        try {
            await hook({operation:'cancel', uid:job.uid, mode:'resume'});
            job.busy = false; job.phase = 'cancelled'; job.durable = false; job.detail = '';
            listView?.reload?.(); api.scheduledChanged?.();
            await restore(job);
        } catch (error) {
            job.busy = false; job.detail = reason(error); render(job);
            job.noticeTimer = clock.later(() => remove(job), 8000);
        }
    }
    api.scheduleSend = iso => schedule(compose, iso);
    api.formatSendAt = when;
    api.canSchedule = () => canSaveDraft();
    addEventListener('rl-view-model.create', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'PopupsCompose' && !vm.pwBackgroundSend) {
            compose=vm; vm.pwBackgroundSend=true; serializeDraftWrites();
            const original=vm.sendCommand;
            vm.sendCommand=(...args)=>send(vm,original,args); vm.sendCommand.canExecute=original.canExecute;
            if (typeof vm.doClose === 'function') {
                const close = vm.doClose;
                vm.doClose=(...args)=>closeAsDraft(vm,close,args);
            }
            const onShow=vm.onShow;
            vm.onShow=function(...args){vm.pwReplyMessage=Array.isArray(args[1])?args[1][0]:args[1];return onShow.apply(vm,args);};
        }
        if (vm.viewModelTemplateID === 'SystemDropDown') {
            // Changing the server account during an in-flight request can change its
            // authentication context. Keep those two session transitions explicit.
            ['accountClick','logoutClick'].forEach(name=>{
                const original=vm[name]; if (!original) return;
                vm[name]=function(...args){
                    if (occupied()) {
                        args[1]?.preventDefault?.(); args[1]?.stopPropagation?.();
                        jobs.forEach(job=>{job.detail=t('Le changement de compte sera possible une fois l’envoi terminé.', 'Account changes are available when sending finishes.');render(job);});
                        return false;
                    }
                    return original.apply(vm,args);
                };
            });
        }
    });
    addEventListener('rl-view-model',({detail:vm})=>{
        if(vm.viewModelTemplateID==='MailMessageList')listView=vm;
        vm.modalVisible?.subscribe(()=>setTimeout(placeHost,0));
    });
    addEventListener('beforeunload',event=>{
        if (occupied()) {event.preventDefault();event.returnValue='';}
    });
    addEventListener('pagehide',()=>{leaving=true;jobs.forEach(job=>job.timer?.cancel());});
})();
