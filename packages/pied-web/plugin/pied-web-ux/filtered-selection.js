(() => {
    'use strict';
    let readerView;
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const errors = {
        scope: ['La recherche a changé ou couvre plusieurs dossiers. Relancez la sélection dans un seul dossier.', 'The search changed or covers several folders. Select results in one folder.'],
        trash: ['Définissez votre dossier Corbeille dans les paramètres avant de supprimer ces résultats.', 'Configure your Trash folder in settings first.'],
        capability: ['Ce serveur ne permet pas une suppression limitée à cette sélection.', 'This server cannot safely delete only this selection.'],
        expired: ['La sélection a expiré. Fermez cette fenêtre et sélectionnez à nouveau les résultats.', 'The selection expired. Close this window and select the results again.'],
        changed: ['Le dossier a changé sur le serveur. Fermez cette fenêtre et relancez la recherche.', 'The folder changed on the server. Close this window and search again.'],
        uncertain: ['Une opération précédente n’a pas été confirmée. Vérifiez la liste actualisée avant de refaire une sélection.', 'A previous operation was not confirmed. Check the refreshed list before selecting again.'],
        limit: ['Trop de sélections récentes. Réessayez dans 30 minutes.', 'Too many recent selections. Try again in 30 minutes.']
    };
    const request = params => {
        if (api.mailbox && params.folder !== window.rl.app.mailboxFolders?.().trash) {
            if (params.operation === 'prepare') return api.mailbox.prepare({scope:'folder',folder:params.folder,search:params.search,
                accountHashes:JSON.stringify([String(rl.settings.get('accountHash') || '')])});
            return api.mailbox.request({...params,operation:'action',action:params.action || 'trash'});
        }
        return new Promise((resolve, reject) => {
        window.rl.pluginRemoteRequest((code, data) => {
            const result = data?.Result;
            if (code || !result || result.error) reject(result?.error || 'mail');
            else resolve(result);
        }, 'PiedWebFilteredSelection', params, 60000);
        });
    };
    addEventListener('rl-view-model', event => {
        const vm = event.detail, dom = vm.viewModelDom, list = vm.messageList;
        if (vm.viewModelTemplateID === 'MailMessageView') readerView = vm;
        if (vm.viewModelTemplateID !== 'MailMessageList' || !dom || dom.querySelector('.pw-filtered-selection')) return;
        const bar = document.createElement('span');
        bar.className = 'pw-filtered-selection';
        const select = document.createElement('button');
        select.type = 'button'; select.className = 'pw-select-results';
        select.textContent = t('Sélectionner toutes les pages…', 'Select all pages…');
        select.title = t('Inclure toutes les pages du filtre dans ce dossier', 'Include all pages matching this folder’s filter');
        bar.append(select);
        const mount = () => {
            const selection = dom.querySelector('.pw-selection-bar');
            if (selection && bar.parentNode !== selection) selection.insertBefore(bar,selection.querySelector('.pw-selection-finish'));
        };
        queueMicrotask(mount);
        const dialog = document.createElement('dialog');
        dialog.className = 'pw-bulk-dialog animate';
        dialog.setAttribute('aria-labelledby', 'pw-bulk-title');
        dialog.setAttribute('aria-describedby', 'pw-bulk-scope');
        dialog.innerHTML = `<h2 id="pw-bulk-title"></h2><p id="pw-bulk-scope"></p>
            <p class="pw-bulk-status" role="status" aria-live="polite"></p>
            <div class="pw-bulk-buttons"><button type="button" class="btn pw-bulk-cancel"></button>
            <button type="button" class="btn pw-bulk-delete" hidden></button></div>`;
        document.getElementById('rl-app').append(dialog);
        const title = dialog.querySelector('h2'), scope = dialog.querySelector('#pw-bulk-scope');
        const status = dialog.querySelector('.pw-bulk-status'), cancel = dialog.querySelector('.pw-bulk-cancel');
        const remove = dialog.querySelector('.pw-bulk-delete');
        const secondary = ['read','unread'].map(action => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'btn pw-bulk-' + action; button.hidden = true;
            button.textContent = action === 'read' ? t('Marquer lu','Mark read') : t('Marquer non lu','Mark unread');
            remove.before(button); button.addEventListener('click',() => runAction(action)); return button;
        });
        let snapshot, selectedContext, generation = 0, busy = false, changed = false;
        const context = () => ({folder: list()?.folder || '', search: list()?.search || ''});
        const sameContext = () => JSON.stringify(context()) === JSON.stringify(selectedContext) && !list.threadUid?.();
        const refresh = () => {
            const current = context();
            mount();
            const pageSelected = !!list().length && list().every(message => !!ko.unwrap(message.checked));
            bar.hidden = !current.folder || !!list.threadUid?.() || !!api.feed?.isGlobal?.() || !pageSelected;
            select.disabled = !!list.loading?.() || !!list.isIncomplete?.() || !list()?.length;
            if (dialog.open && selectedContext && !sameContext() && !busy) dialog.close();
        };
        ko.computed(refresh);
        addEventListener('pw-feed-mode-changed',refresh);
        addEventListener('pw-native-selection-changed',event => {
            if (event.detail?.dom !== dom) return;
            if (!event.detail.all) {
                snapshot = null;
                if (dialog.open && !busy) dialog.close();
            }
            refresh();
        });
        dialog.addEventListener('keydown', e => e.stopPropagation());
        dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
        dialog.addEventListener('close', () => {
            ++generation;
            if (changed) {
                changed = false;
                if (readerView?.message()?.folder === selectedContext.folder) readerView.message(null);
                list.reload(true, true);
                window.rl.app.folderInformation?.(selectedContext.folder);
                if (snapshot?.trash && snapshot.trash !== selectedContext.folder) window.rl.app.folderInformation?.(snapshot.trash);
            }
            snapshot = null;
            if (select.isConnected && !bar.hidden) select.focus();
        });
        cancel.addEventListener('click', () => { if (!busy) dialog.close(); });
        const failed = code => {
            const message = errors[code] || [
                'Impossible de terminer l’opération. Vérifiez la liste actualisée avant de recommencer.',
                'The operation could not finish. Check the refreshed list before trying again.'
            ];
            status.textContent = t(...message);
            if (changed) status.textContent += t(
                ` ${snapshot?.cursor || 0} messages traités avec confirmation. Le dernier lot peut avoir été traité avant l’interruption.`,
                ` ${snapshot?.cursor || 0} messages confirmed processed. The last batch may have completed before the interruption.`);
            status.setAttribute('role', 'alert');
            remove.hidden = true; cancel.disabled = false;
            secondary.forEach(button => button.hidden = true);
            cancel.textContent = t('Fermer', 'Close'); cancel.focus();
        };
        select.addEventListener('click', async () => {
            if (select.disabled) return;
            selectedContext = context();
            const version = ++generation;
            title.textContent = t('Sélection de toutes les pages', 'Selecting every page');
            scope.textContent = t(`Compte actif · Dossier : ${selectedContext.folder} · Filtre : ${selectedContext.search || 'aucun'}`,
                `Active account · Folder: ${selectedContext.folder} · Filter: ${selectedContext.search || 'none'}`);
            status.setAttribute('role', 'status');
            status.textContent = t('Comptage des messages…', 'Counting messages…');
            cancel.textContent = t('Annuler', 'Cancel'); cancel.disabled = false;
            remove.hidden = true; dialog.showModal(); cancel.focus();
            secondary.forEach(button => button.hidden = true);
            try {
                const result = await request({...selectedContext, operation: 'prepare'});
                if (version !== generation || !dialog.open || !sameContext()) return;
                snapshot = {...result,cursor:Number(result.cursor || 0)};
                dialog.classList.toggle('pw-permanent', result.permanent);
                title.textContent = t(`${result.count} messages sélectionnés`, `${result.count} messages selected`);
                status.textContent = result.count ? (result.permanent
                    ? t('Toutes les pages sont incluses. Ces messages seront supprimés définitivement de la corbeille.', 'Every page is included. These messages will be permanently deleted from Trash.')
                    : t('Toutes les pages sont incluses. Ces messages seront déplacés dans la corbeille.', 'Every page is included. These messages will be moved to Trash.'))
                    : t('Aucun message ne correspond encore à ce filtre.', 'No messages still match this filter.');
                remove.textContent = result.permanent ? t('Supprimer définitivement', 'Delete permanently') : t('Mettre à la corbeille', 'Move to Trash');
                remove.hidden = !result.count; remove.disabled = false;
                secondary.forEach(button => { button.hidden = !result.count || !!result.permanent; button.disabled = false; });
            } catch (code) { if (version === generation && dialog.open) failed(code); }
        });
        const runAction = async (action = 'trash') => {
            if (busy || !snapshot || !sameContext()) return;
            busy = true; changed = true;
            remove.disabled = true; cancel.disabled = true;
            secondary.forEach(button => button.disabled = true);
            const selected = snapshot;
            const undoTokens = [];
            let failures = [];
            try {
                do {
                    if (!sameContext()) throw 'scope';
                    status.textContent = t(`Traitement : ${selected.cursor} / ${selected.count} messages…`, `Processing: ${selected.cursor} / ${selected.count} messages…`);
                    const result = await request({...selectedContext, operation: 'delete', action, confirmed: '1',
                        token: selected.token, cursor: selected.cursor});
                    if (result.undoToken && !undoTokens.includes(result.undoToken)) undoTokens.push(result.undoToken);
                    failures = result.failures || [];
                    if (!result.done && result.cursor <= selected.cursor) throw 'uncertain';
                    selected.cursor = result.cursor; selected.done = result.done;
                } while (!selected.done);
                status.textContent = failures.length ? t('Opération partielle. Certains messages n’ont pas été modifiés.','Partial operation. Some messages were not changed.')
                    : action !== 'trash' ? t('Messages mis à jour.','Messages updated.') : selected.permanent
                    ? t('Suppression terminée.', 'Deletion complete.') : t('Déplacement dans la corbeille terminé.', 'Moved to Trash.');
                remove.hidden = true; cancel.disabled = false;
                secondary.forEach(button => button.hidden = true);
                if (undoTokens.length) api.mailbox.show(status.textContent,undoTokens,failures.length>0);
                cancel.textContent = t('Fermer', 'Close'); cancel.focus();
            } catch (code) {
                failed(code?.message || code);
                if (undoTokens.length) api.mailbox.show(t('Opération partielle. Vérifiez la liste.','Partial operation. Check the list.'),undoTokens,true);
            }
            finally { busy = false; }
        };
        remove.addEventListener('click',() => runAction('trash'));
    });
})();
