/* Account-safe, confirmed mailbox operations. No optimistic success or blind retries. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const t = (fr,en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const active = () => document.documentElement.classList.contains('pw-theme');
    const account = () => String(window.rl?.settings?.get?.('accountHash') || '');
    const request = params => new Promise((resolve,reject) => {
        if (!window.rl?.pluginRemoteRequest) return reject(new Error('mail'));
        rl.pluginRemoteRequest((code,data) => {
            const result = data?.Result;
            code || !result || result.error ? reject(new Error(result?.error || 'mail')) : resolve(result);
        }, 'PiedWebFeed', params, 120000);
    });
    const reason = error => ({
        changed:t('Le dossier a changé. Actualisez avant de refaire la sélection.','The folder changed. Refresh before selecting again.'),
        expired:t('La sélection a expiré. Sélectionnez de nouveau les messages.','The selection expired. Select the messages again.'),
        capability:t('Ce serveur ne permet pas ce déplacement réversible. Aucune suppression définitive ne sera tentée.','This server does not support this reversible move. Permanent deletion will not be attempted.'),
        missing:t('Certains messages ne sont plus à cet emplacement. Actualisez la liste.','Some messages are no longer here. Refresh the list.'),
        uncertain:t('Résultat non confirmé. Actualisez et vérifiez avant de recommencer.','Unconfirmed result. Refresh and check before trying again.'),
        sender:t('Le service de rappel est indisponible.','The reminder service is unavailable.'),
        scope:t('La portée de la sélection a changé. Sélectionnez à nouveau.','The selection scope changed. Select again.'),
        trash:t('Configurez le dossier Corbeille dans les paramètres.','Configure the Trash folder in settings.')
        ,busy:t('Une opération est déjà en cours. Patientez avant de recommencer.','An operation is already running. Wait before trying again.')
    })[error?.message] || t('Opération interrompue. Vérifiez la liste avant de recommencer.','Operation interrupted. Check the list before trying again.');
    let notice, label, undoButton, closeButton, undoTokens = [], timer, busy = false, running = false;
    const mountNotice = () => {
        if (notice?.isConnected) return;
        notice = document.createElement('aside'); notice.className = 'pw-mailbox-notice'; notice.hidden = true;
        label = document.createElement('span'); label.setAttribute('role','status'); label.setAttribute('aria-live','polite');
        undoButton = document.createElement('button'); undoButton.type = 'button'; undoButton.textContent = t('Annuler','Undo');
        closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = '×';
        closeButton.setAttribute('aria-label',t('Fermer la notification','Dismiss notification'));
        notice.append(label,undoButton,closeButton); (document.getElementById('rl-app') || document.body).append(notice);
        closeButton.addEventListener('click',() => { if (!busy) notice.hidden = true; });
        undoButton.addEventListener('click',async () => {
            if (busy || running || !undoTokens.length) return;
            busy = true; undoButton.disabled = closeButton.disabled = true; clearTimeout(timer);
            const tokens = undoTokens.splice(0); let restored = 0;
            try {
                for (const undoToken of tokens) {
                    let cursor = 0, result;
                    do {
                        label.textContent = t('Restauration…','Restoring…');
                        result = await request({operation:'undo',undoToken,cursor});
                        if (!Number.isSafeInteger(Number(result.cursor)) || Number(result.cursor) < cursor
                            || (!result.done && Number(result.cursor) <= cursor)) throw new Error('uncertain');
                        cursor = Number(result.cursor); if (result.failures?.length) throw new Error('uncertain');
                    } while (!result.done);
                    restored += cursor;
                }
                show(t(`${restored} message(s) restauré(s).`,`${restored} message(s) restored.`));
            } catch (error) { show(reason(error),[],true); }
            finally { busy = false; undoButton.disabled = closeButton.disabled = false; changed(); }
        });
    };
    const show = (text,tokens = [],failed = false) => {
        mountNotice(); clearTimeout(timer); undoTokens = tokens;
        label.textContent = text; notice.hidden = false; notice.dataset.state = failed ? 'error' : '';
        undoButton.hidden = !tokens.length;
        undoButton.disabled = busy || running;
        // Do not expire a focused Undo control while someone is deciding.
        timer = setTimeout(() => { if (!notice.contains(document.activeElement) && !busy) notice.hidden = true; },30000);
    };
    const changed = () => {
        rl.app?.messageList?.reload?.(true,true);
        dispatchEvent(new CustomEvent('pw-mailbox-changed'));
    };
    const prepare = params => request({operation:'prepare',...params});
    const run = async (snapshot,action,extra = {},progress) => {
        if (busy || running) throw new Error('busy');
        running = true;
        let cursor = Number(snapshot.cursor || 0), result;
        const tokens = [];
        try {
            if (!Number.isSafeInteger(Number(snapshot.count)) || Number(snapshot.count) < 0) throw new Error('uncertain');
            if (!Number(snapshot.count)) {
                show(t('Aucun message à modifier.','No messages to update.'));
                return {cursor:0,count:0,done:true,failures:[]};
            }
            do {
                progress?.(cursor,Number(snapshot.count || 0));
                result = await request({operation:'action',token:snapshot.token,cursor,action,confirmed:'1',...extra});
                if (!Number.isSafeInteger(Number(result.cursor)) || Number(result.cursor) < cursor || Number(result.cursor) > Number(snapshot.count)
                    || (!result.done && Number(result.cursor) <= cursor)) throw new Error('uncertain');
                cursor = Number(result.cursor);
                // Failures recorded before mutation are certain. Process the
                // remaining groups; an undo snapshot is usable only at done.
                if (result.done && result.undoToken) tokens.push(result.undoToken);
            } while (!result.done);
            const failed = (result.failures || []).reduce((sum,failure) => sum + Math.max(0,Number(failure.count) || 0),0);
            const confirmed = Math.max(0,cursor-failed), partial = !!result.partial || !!result.failures?.length;
            const description = action === 'trash' ? t(`${confirmed} message(s) mis à la corbeille.`,`${confirmed} message(s) moved to Trash.`)
                : t(`${confirmed} message(s) mis à jour.`,`${confirmed} message(s) updated.`);
            show(description + (partial ? t(' Certaines opérations ont échoué ; vérifiez les comptes concernés.',' Some operations failed; check the affected accounts.') : ''),tokens,partial);
            return {...result,confirmed,partial};
        } catch (error) { show(reason(error),[],true); error.mailboxNotified = true; throw error; }
        finally { running = false; if (undoButton) undoButton.disabled = busy; changed(); }
    };
    const perform = async (params,action,extra = {}) => {
        if (busy || running) throw new Error('busy');
        const snapshot = await prepare(params);
        return run(snapshot,action,extra);
    };
    const uids = message => [...new Set([Number(message.uid),...(typeof message.threads === 'function' ? message.threads() : message.threads || [])]
        .map(Number).filter(uid => Number.isSafeInteger(uid) && uid > 0))];
    const nativeValidity = () => {
        const value = window.rl?.app?.messageList?.uidValidity;
        return Number(typeof value === 'function' ? value() : value) || 0;
    };
    const nativeScope = message => ({folder:String(message.folder),uids:JSON.stringify(uids(message)),
        uidValidity:nativeValidity(),accountHashes:JSON.stringify([account()])});
    const reportError = error => {
        if (error?.mailboxNotified) return;
        if (error?.message === 'busy') { mountNotice(); label.textContent = reason(error); notice.hidden = false; }
        else show(reason(error),[],true);
    };
    const glyph = (name,label) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'pw-row-action';
        button.setAttribute('aria-label',label); button.title = label;
        const svg = api.composerIcons?.[name];
        if (svg) { const template = document.createElement('template'); template.innerHTML = svg; button.append(template.content.cloneNode(true)); }
        else button.textContent = name === 'trash-2' ? '×' : '◷';
        return button;
    };
    const rowActions = (scope,onDone,allowReminder = false) => {
        const group = document.createElement('span'); group.className = 'pw-row-actions';
        const trash = glyph('trash-2',t('Supprimer','Delete'));
        trash.addEventListener('click',async event => {
            event.preventDefault(); event.stopPropagation(); if (!active() || trash.disabled) return;
            trash.disabled = true;
            try { await perform(scope(),'trash'); onDone?.(); }
            catch (error) { reportError(error); }
            finally { trash.disabled = false; }
        });
        group.append(trash);
        if (allowReminder) {
            const remind = glyph('clock',t('Me le rappeler','Remind me'));
            remind.classList.add('pw-remind-action');
            remind.setAttribute('aria-haspopup','dialog');
            remind.addEventListener('click',event => {
                event.preventDefault(); event.stopPropagation();
                if (!active() || busy || running) return;
                // A refresh or account change may recycle the row while the
                // picker is open. Capture the exact target before asking when.
                const params = scope();
                api.reminders?.choose?.(remind,async date => {
                    const result = await perform(params,'remind',{remindAt:date.toISOString()}); onDone?.();
                    return {...result,remindAt:date.toISOString()};
                });
            });
            group.append(remind);
        }
        return group;
    };
    api.mailbox = {request,prepare,run,perform,reason,show,rowActions,nativeScope,uids};
    let nativeWrapped = false;
    const mountNative = vm => {
        if (vm.viewModelTemplateID !== 'MailMessageList' || vm.pwMailboxActions) return;
        vm.pwMailboxActions = true;
        const root = vm.viewModelDom;
        const paint = () => {
            if (!active()) { root.querySelectorAll('.pw-row-actions').forEach(n => n.remove()); return; }
            root.querySelectorAll('.messageListItem').forEach(row => {
                const message = window.ko?.dataFor?.(row);
                if (!message?.uid || !message.folder || row.querySelector('.pw-row-actions')) return;
                const folder = String(message.folder);
                // Trash uses the native permanent-delete confirmation, never our reversible shortcut.
                const isTrash = folder === rl.app.mailboxFolders?.().trash;
                if (!isTrash) row.append(rowActions(() => nativeScope(window.ko.dataFor(row)),null,/^inbox$/i.test(folder)));
            });
        };
        let frame = 0;
        const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
        const observer = new MutationObserver(schedule); observer.observe(root,{childList:true,subtree:true});
        const themeObserver = new MutationObserver(schedule); themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
        const subscription = vm.messageList?.subscribe?.(schedule); paint();
        window.ko?.utils?.domNodeDisposal?.addDisposeCallback(root,() => { observer.disconnect(); themeObserver.disconnect(); subscription?.dispose?.(); cancelAnimationFrame(frame); });
        if (!nativeWrapped && typeof rl.app.moveMessagesToFolderType === 'function') {
            const native = rl.app.moveMessagesToFolderType;
            rl.app.moveMessagesToFolderType = function(type,folder,ids,permanent) {
                if (!active() || type !== 5 || permanent || !ids?.size
                    || [rl.app.mailboxFolders?.().trash,rl.app.mailboxFolders?.().spam].includes(folder))
                    return native.call(this,type,folder,ids,permanent);
                return perform({folder,uids:JSON.stringify([...ids]),uidValidity:nativeValidity(),
                    accountHashes:JSON.stringify([account()])},'trash')
                    .catch(reportError);
            };
            nativeWrapped = true;
        }
    };
    addEventListener('rl-view-model',({detail:vm}) => mountNative(vm));
})();
