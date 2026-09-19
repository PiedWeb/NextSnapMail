(() => {
    'use strict';
    let readerView;
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
    const request = params => new Promise((resolve, reject) => {
        window.rl.pluginRemoteRequest((code, data) => {
            const result = data?.Result;
            if (code || !result || result.error) reject(result?.error || 'mail');
            else resolve(result);
        }, 'PiedWebFilteredSelection', params, 60000);
    });
    addEventListener('rl-view-model', event => {
        const vm = event.detail, dom = vm.viewModelDom, list = vm.messageList;
        if (vm.viewModelTemplateID === 'MailMessageView') readerView = vm;
        if (vm.viewModelTemplateID !== 'MailMessageList' || !dom || dom.querySelector('.pw-filtered-selection')) return;
        const bar = document.createElement('div');
        bar.className = 'pw-filtered-selection';
        const select = document.createElement('button');
        select.type = 'button'; select.className = 'pw-select-results';
        select.textContent = t('Sélectionner tous les résultats', 'Select all results');
        select.title = t('Inclure toutes les pages du filtre dans ce dossier', 'Include all pages matching this folder’s filter');
        bar.append(select);
        const searchbar = dom.querySelector('.messageList > .second-toolbar');
        if (searchbar) searchbar.after(bar); else dom.querySelector('.messageList')?.prepend(bar);
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
        let snapshot, selectedContext, generation = 0, busy = false, changed = false;
        const context = () => ({folder: list()?.folder || '', search: list()?.search || ''});
        const sameContext = () => JSON.stringify(context()) === JSON.stringify(selectedContext) && !list.threadUid?.();
        const refresh = () => {
            const current = context();
            bar.hidden = !current.search.trim() || !current.folder || !!list.threadUid?.();
            select.disabled = !!list.loading?.() || !!list.isIncomplete?.() || !list()?.length;
            if (dialog.open && selectedContext && !sameContext() && !busy) dialog.close();
        };
        ko.computed(refresh);
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
            cancel.textContent = t('Fermer', 'Close'); cancel.focus();
        };
        select.addEventListener('click', async () => {
            if (select.disabled) return;
            selectedContext = context();
            const version = ++generation;
            title.textContent = t('Sélection de toutes les pages', 'Selecting every page');
            scope.textContent = t(`Dossier : ${selectedContext.folder} · Filtre : ${selectedContext.search}`,
                `Folder: ${selectedContext.folder} · Filter: ${selectedContext.search}`);
            status.setAttribute('role', 'status');
            status.textContent = t('Comptage des messages…', 'Counting messages…');
            cancel.textContent = t('Annuler', 'Cancel'); cancel.disabled = false;
            remove.hidden = true; dialog.showModal(); cancel.focus();
            try {
                const result = await request({...selectedContext, operation: 'prepare'});
                if (version !== generation || !dialog.open || !sameContext()) return;
                snapshot = result;
                dialog.classList.toggle('pw-permanent', result.permanent);
                title.textContent = t(`${result.count} messages sélectionnés`, `${result.count} messages selected`);
                status.textContent = result.count ? (result.permanent
                    ? t('Toutes les pages sont incluses. Ces messages seront supprimés définitivement de la corbeille.', 'Every page is included. These messages will be permanently deleted from Trash.')
                    : t('Toutes les pages sont incluses. Ces messages seront déplacés dans la corbeille.', 'Every page is included. These messages will be moved to Trash.'))
                    : t('Aucun message ne correspond encore à ce filtre.', 'No messages still match this filter.');
                remove.textContent = result.permanent ? t('Supprimer définitivement', 'Delete permanently') : t('Mettre à la corbeille', 'Move to Trash');
                remove.hidden = !result.count; remove.disabled = false;
            } catch (code) { if (version === generation && dialog.open) failed(code); }
        });
        remove.addEventListener('click', async () => {
            if (busy || !snapshot || !sameContext()) return;
            busy = true; changed = true;
            remove.disabled = true; cancel.disabled = true;
            const selected = snapshot;
            try {
                do {
                    if (!sameContext()) throw 'scope';
                    status.textContent = t(`Traitement : ${selected.cursor} / ${selected.count} messages…`, `Processing: ${selected.cursor} / ${selected.count} messages…`);
                    const result = await request({...selectedContext, operation: 'delete', confirmed: '1',
                        token: selected.token, cursor: selected.cursor});
                    if (!result.done && result.cursor <= selected.cursor) throw 'uncertain';
                    selected.cursor = result.cursor; selected.done = result.done;
                } while (!selected.done);
                status.textContent = selected.permanent
                    ? t('Suppression terminée.', 'Deletion complete.') : t('Déplacement dans la corbeille terminé.', 'Moved to Trash.');
                remove.hidden = true; cancel.disabled = false;
                cancel.textContent = t('Fermer', 'Close'); cancel.focus();
            } catch (code) { failed(code); }
            finally { busy = false; }
        });
    });
})();
