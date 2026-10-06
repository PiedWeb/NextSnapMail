/* Consume the native post-binding view event. Keep the bound controls and their
 * commands; add names, keyboard activation and feedback to shared primitives. */
(() => {
    'use strict';
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    let sequence = 0;
    const id = node => node.id || (node.id = `pw-native-${++sequence}`);
    const set = (node, name, value) => {
        if (node.getAttribute(name) !== String(value)) node.setAttribute(name, value);
    };
    const named = node => node.labels?.length || node.hasAttribute('aria-label') || node.hasAttribute('aria-labelledby');
    const fieldNames = root => {
        root.querySelectorAll('input:not([type=hidden]),select,textarea,.select').forEach(field => {
            if (named(field)) return;
            const group = field.closest('.control-group');
            const label = group?.querySelector(':scope > label')
                || field.closest('.e-component')?.querySelector('[data-i18n]')
                || group?.querySelector('label');
            if (label?.textContent.trim()) {
                if (label.tagName === 'LABEL' && !label.querySelector('input,select,textarea') && !label.htmlFor) {
                    label.htmlFor = id(field);
                } else set(field, 'aria-labelledby', id(label));
            } else if (field.matches('textarea') && root.id === 'V-PopupsSieveScript') {
                set(field, 'aria-label', t('Code du filtre Sieve', 'Sieve filter code'));
            } else if (field.title || field.placeholder) {
                set(field, 'aria-label', field.title || field.placeholder);
            }
        });
    };
    const actionInfo = node => {
        const binding = node.dataset.bind || '';
        const row = node.closest('tr');
        const subject = row?.querySelector('.account-name,.identity-name,.folder-name,.script-name,.key-id')?.textContent.trim() || '';
        let label = node.title || node.closest('td[title]')?.title;
        let icon;
        if (/Deletion|delete|remove|openForDeletion/.test(binding) || node.matches('.delete,.delete-key')) {
            label = t('Supprimer', 'Delete'); icon = 'trash';
        } else if (/toggleFolderSubscription/.test(binding)) {
            label ||= t('Afficher ou masquer le dossier', 'Show or hide folder'); icon = 'eye';
            set(node, 'aria-pressed', !node.classList.contains('unsubscribed-folder'));
        } else if (/toggleFolderCheckable/.test(binding)) {
            label ||= t('Vérifier les nouveaux messages', 'Check for new messages'); icon = 'check';
            set(node, 'aria-pressed', node.classList.contains('check-folder'));
        } else if (/disableScripts/.test(binding)) {
            label = t('Désactiver les filtres', 'Disable filters'); icon = 'check';
            set(node, 'aria-pressed', node.textContent.trim() === '⦿');
        } else if (/enableScript/.test(binding)) {
            label = t('Activer le filtre', 'Enable filter'); icon = 'check';
            set(node, 'aria-pressed', node.textContent.trim() === '⦿');
        } else if (/testSoundNotification|testSystemNotification/.test(binding)) {
            label = /testSound/.test(binding) ? t('Tester le son', 'Test sound') : t('Tester la notification', 'Test notification');
            icon = 'play';
        } else if (/editACL/.test(binding)) {
            label = t('Modifier les droits du dossier', 'Edit folder permissions'); icon = 'edit';
        } else if (/createACL/.test(binding)) {
            label = t('Ajouter des droits au dossier', 'Add folder permissions'); icon = 'add';
        } else if (node.matches('td.e-action,td[class*=deep-],.editMainIdentity') || /click:\s*(?:edit|view)\b/.test(binding)) {
            label = t('Modifier', 'Edit');
        }
        if (label) set(node, 'aria-label', label + (subject ? ` : ${subject}` : ''));
        else if (!node.hasAttribute('aria-label') && !/[\p{L}\p{N}]/u.test(node.textContent)) {
            set(node, 'aria-label', t('Ouvrir', 'Open'));
        }
        if (icon) node.dataset.pwNativeIcon = icon;
    };
    const keyboardActions = root => {
        root.querySelectorAll('[data-bind],td.e-action,a.btn,a.close').forEach(node => {
            if (node.matches('button')) { actionInfo(node); return; }
            if (node.matches('input,select,textarea,label') || node.isContentEditable) return;
            const binding = node.dataset.bind || '';
            if (!/(?:^|[,\s])(?:click|command)\s*:/.test(binding) && !node.matches('td.e-action,a.close')) return;
            if (node.matches('a[href]:not([href="#"])')) return;
            // Containers with independent controls are not an additional Tab stop.
            if (node.querySelector('button,input,select,textarea,a.btn,[role=button]')) return;
            set(node, 'role', 'button'); node.tabIndex = 0;
            if (node.classList.contains('disabled') || node.dataset.pwNativeDisabled) {
                node.dataset.pwNativeDisabled = '1';
                set(node, 'aria-disabled', node.classList.contains('disabled'));
            }
            actionInfo(node);
            if (node.matches('a.close')) set(node, 'aria-label', t('Fermer', 'Close'));
            if (node.dataset.pwNativeKeyboard) return;
            node.dataset.pwNativeKeyboard = '1';
            node.addEventListener('keydown', event => {
                if (event.target !== node || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
                const binding = node.dataset.bind || '';
                const enter = event.key === 'Enter' && !/onEnter\s*:/.test(binding) && !node.hasAttribute('href');
                const space = event.key === ' ' && !/onSpace\s*:/.test(binding);
                if (enter || space) {
                    event.preventDefault();
                    if (!node.matches('.disabled,[aria-disabled=true]')) node.click();
                }
            });
        });
    };
    const sortableActions = (root, vm) => {
        root.querySelectorAll('tr[draggable=true] .drag-handle').forEach(handle => {
            const row = handle.closest('tr');
            const list = row.closest('.accounts-list') ? vm.accounts : vm.identities;
            if (typeof list?.splice !== 'function') return;
            set(handle, 'role', 'button'); handle.tabIndex = 0;
            set(handle, 'aria-label', t('Réordonner, Alt et flèches haut/bas', 'Reorder, Alt and up/down arrows'));
            set(handle, 'aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
            handle.dataset.pwNativeIcon = 'grip';
            if (handle.dataset.pwNativeReorder) return;
            handle.dataset.pwNativeReorder = '1';
            handle.addEventListener('keydown', event => {
                if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                const item = window.ko?.dataFor(row), items = window.ko?.unwrap(list) || [];
                const from = items.indexOf(item), to = from + (event.key === 'ArrowUp' ? -1 : 1);
                if (from < 0 || to < 0 || to >= items.length || row.closest('.accounts-list') && !items[to].isAdditional?.()) return;
                list.splice(Math.min(from, to), 2, items[Math.max(from, to)], items[Math.min(from, to)]);
                vm.accountsAndIdentitiesAfterMove?.();
                queueMicrotask(() => root.querySelectorAll('tr[draggable=true] .drag-handle').forEach(next => {
                    if (window.ko?.dataFor(next.closest('tr')) === item) next.focus();
                }));
            });
        });
    };
    const feedback = root => {
        root.querySelectorAll('.settings-save-trigger').forEach(node => {
            if (node.matches('input,select,textarea')) return;
            set(node, 'role', 'status'); set(node, 'aria-live', 'polite');
            const state = node.classList.contains('error') ? t('Échec de l’enregistrement', 'Save failed')
                : node.classList.contains('success') ? t('Enregistré', 'Saved')
                : node.classList.contains('saving') ? t('Enregistrement en cours', 'Saving') : '';
            let text = node.querySelector('.pw-native-status-text');
            if (!text) { text = document.createElement('span'); text.className = 'pw-native-status-text'; node.append(text); }
            if (text.textContent !== state) text.textContent = state;
            const field = node.previousElementSibling?.matches('input,select,textarea') ? node.previousElementSibling
                : node.closest('.e-component')?.querySelector('input,select,textarea');
            if (field?.matches('input,select,textarea')) {
                set(field, 'aria-invalid', node.classList.contains('error'));
                const description = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
                description.add(id(text)); set(field, 'aria-describedby', [...description].join(' '));
            }
        });
        root.querySelectorAll('.alert-error').forEach(node => { if (!node.hasAttribute('role')) set(node, 'role', 'alert'); });
    };
    addEventListener('rl-view-model', ({detail: vm}) => {
        const root = vm.viewModelDom, name = vm.viewModelTemplateID || '';
        if (!root || root.dataset.pwNativeComponents || !/^(?:Settings|Popups|Login)/.test(name) || ['PopupsCompose','SettingsPane','SettingsMenu'].includes(name)) return;
        root.dataset.pwNativeComponents = '1';
        const update = () => { fieldNames(root); keyboardActions(root); sortableActions(root, vm); feedback(root); };
        update();
        // Components and foreach rows can render after the post-binding event.
        // One observer per native view, no whole-workspace rescanning.
        const observer = new MutationObserver(update);
        observer.observe(root, {childList:true, subtree:true, characterData:true, attributes:true,
            attributeFilter:['class','data-i18n']});
        window.ko?.utils?.domNodeDisposal?.addDisposeCallback?.(root, () => observer.disconnect());
    });
})();
