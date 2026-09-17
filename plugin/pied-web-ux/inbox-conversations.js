/* Keep SnappyMail's global thread preference local to the Inbox. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const isInbox = folder => String(folder || '').toUpperCase() === 'INBOX';
    const decode = value => {
        value = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
        value += '='.repeat((4 - value.length % 4) % 4);
        const binary = atob(value), bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
    };
    const encode = value => {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        let binary = '';
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const scopedPath = (action, path) => {
        if (!path || (action !== 'MessageList' && action !== 'Message')) return path;
        const separator = path.lastIndexOf('/');
        if (separator < 0) return path;
        try {
            const value = decode(path.slice(separator + 1));
            if (action === 'MessageList' && value && !Array.isArray(value) && value.folder && !isInbox(value.folder)) {
                delete value.useThreads;
                delete value.threadAlgorithm;
                value.threadUid = 0;
            } else if (action === 'Message' && Array.isArray(value) && value[0] && !isInbox(value[0])) {
                value[2] = 0;
            } else {
                return path;
            }
            return path.slice(0, separator + 1) + encode(value);
        } catch {
            // Leave an unknown native request shape untouched rather than breaking mail loading.
            return path;
        }
    };
    const scopeRequest = (action, params, path) => {
        let scoped = params;
        if (action === 'MessageList' && params?.folder && !isInbox(params.folder)) {
            scoped = {...params, threadUid:0};
            delete scoped.useThreads;
            delete scoped.threadAlgorithm;
        }
        return {params:scoped, path:scopedPath(action,path)};
    };
    api.inboxConversations = {isInbox, scopeRequest};

    const remote = window.rl?.app?.Remote;
    if (!remote?.request || remote.pwInboxConversations) return;
    const request = remote.request;
    remote.request = function(action, callback, params, timeout, path) {
        const scoped = scopeRequest(action,params,path);
        return request.call(this,action,callback,scoped.params,timeout,scoped.path);
    };
    remote.pwInboxConversations = true;
})();
