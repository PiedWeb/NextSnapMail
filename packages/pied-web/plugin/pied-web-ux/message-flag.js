/* The reader star calls the native message-store command directly. Its placement
 * must not decide whether a click reaches the mail action. */
(() => {
    'use strict';
    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID !== 'MailMessageView' || vm.pwFlagAction) return;
        vm.pwFlagAction = true;
        const dom = vm.viewModelDom, pending = ko.observableArray([]), error = ko.observable('');
        const active = () => document.documentElement.classList.contains('pw-theme');
        const fr = () => (document.documentElement.lang || 'fr').startsWith('fr');
        const same = (a,b) => a && b && a.folder === b.folder && String(a.uid) === String(b.uid);
        const busy = message => pending().some(item => same(item, message));
        const notice = document.createElement('div');
        notice.className = 'pw-flag-error'; notice.setAttribute('role','alert'); notice.hidden = true;
        dom.querySelector('.top-toolbar')?.after(notice);
        const update = () => {
            const message = vm.message(), flagged = !!message?.isFlagged(), waiting = busy(message);
            dom.querySelectorAll('.messageItemHeader .flagParent').forEach(control => {
                const label = flagged ? (fr() ? 'Retirer le suivi du message' : 'Unflag message') : (fr() ? 'Suivre ce message' : 'Flag message');
                control.setAttribute('role','button'); control.tabIndex = 0;
                control.setAttribute('aria-pressed',String(flagged));
                control.setAttribute('aria-busy',String(waiting));
                control.setAttribute('aria-disabled',String(!message || waiting));
                control.setAttribute('aria-label',label); control.title = label;
                control.classList.toggle('pw-flag-pending',waiting);
            });
            if (notice.textContent !== error()) notice.textContent = error();
            notice.hidden = !error() || !active();
        };
        ko.computed(update,null,{disposeWhenNodeIsRemoved:dom});
        new MutationObserver(update).observe(dom,{childList:true,subtree:true});
        new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
        vm.message.subscribe(() => error(''));
        dom.addEventListener('click',event => {
            if (!active() || !(event.target instanceof Element) || !event.target.closest('.messageItemHeader .flagParent')) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const message = vm.message();
            if (!message || busy(message) || !message.folder || !message.uid) return;
            const previous = !!message.isFlagged(), desired = !previous, remote = rl.app.Remote;
            const action = rl.app.messageList?.setAction, request = remote.request;
            let captured = false, finished = false;
            const finish = (code, data, callback, rest=[]) => {
                if (finished) return;
                finished = true;
                if (code) {
                    // Restore only the flag, preserving any other message flags.
                    // Do not undo a more recent change to the opposite state.
                    if (!!message.isFlagged() === desired) {
                        previous ? message.flags.push('\\flagged') : message.flags.remove('\\flagged');
                    }
                    if (same(vm.message(),message)) error(fr()
                        ? 'Impossible d’enregistrer le suivi du message. Réessayez.'
                        : 'Could not save the message flag. Please try again.');
                }
                pending.remove(message);
                callback?.(code,data,...rest);
            };
            error(''); pending.push(message);
            // Native setAction updates the shared model and issues one synchronous
            // Remote.request. Add its missing completion callback, then immediately
            // restore Remote.request so unrelated operations keep their own behavior.
            remote.request = function(name, callback, params, ...rest) {
                if (name === 'MessageSetFlagged' && params?.folder === message.folder
                    && String(params.uids) === String(message.uid)) {
                    captured = true;
                    return request.call(this,name,(code,data,...extra)=>finish(code,data,callback,extra),params,...rest);
                }
                return request.call(this,name,callback,params,...rest);
            };
            try {
                if (typeof action !== 'function') throw new Error('Native flag action unavailable');
                action.call(rl.app.messageList,message.folder,desired ? 2 : 3,[message]);
                if (!captured) finish(1);
            } catch (_) { finish(1); }
            finally { remote.request = request; }
        },true);
    });
})();
