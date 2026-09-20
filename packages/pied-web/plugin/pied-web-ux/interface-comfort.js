/* Presentation hooks only. Never rewrite IMAP names, flags, or user tags.
 * Loaded before bootstart creates the native folder and message models. */
(() => {
    'use strict';
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const native = window.rl.mailUi = window.rl.mailUi || {};
    const internalKeyword = /^(?:\$pwremind-[0-9a-z]+|\$pwsending)$/i;
    const priorKeyword = native.isInternalKeyword;
    const priorFolder = native.folderLabel;
    native.isInternalKeyword = value => internalKeyword.test(String(value)) || !!priorKeyword?.(value);
    native.folderLabel = (folder, name, draftsFolder) => {
        const drafts = String(draftsFolder || '');
        if (!drafts || drafts === '__UNUSE__' || drafts.toUpperCase() === 'INBOX'
            || typeof folder?.isSystemFolder === 'function' && folder.isSystemFolder())
            return priorFolder?.(folder, name, draftsFolder) ?? name;
        // The server queues are siblings of the configured Drafts folder. Do
        // not translate a user's unrelated Projects/Scheduled folder.
        const delimiter = String(folder?.delimiter || '');
        const cut = delimiter ? drafts.lastIndexOf(delimiter) : -1;
        const prefix = cut > -1 ? drafts.slice(0, cut + delimiter.length) : '';
        if (String(folder?.fullName || '') === prefix + 'Reminders') return t('Rappels', 'Reminders');
        if (String(folder?.fullName || '') === prefix + 'Scheduled') return t('Envois programmés', 'Scheduled');
        return priorFolder?.(folder, name, draftsFolder) ?? name;
    };
})();
