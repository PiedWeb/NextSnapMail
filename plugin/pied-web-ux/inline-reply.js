/* Dock native Reply/Reply all composers at the end of the active conversation. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    const replyTypes = new Set([1, 2]); // SnappyMail 2.38.2 ComposeType.Reply / ReplyAll.
    const states = new WeakMap();
    let readerVM, composeVM;

    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const messageKey = message => message?.folder && Number(message.uid) > 0
        ? String(message.folder) + '\u0000' + Number(message.uid) : '';
    const activeHost = () => readerVM?.viewModelDom?.querySelector('.b-message.pw-conversation-active');
    const sourceMessage = value => Array.isArray(value) ? value[0] : value;
    const restoreAttribute = (node, name, value) => value == null
        ? node.removeAttribute(name) : node.setAttribute(name, value);

    function captureNode(dialog, node) {
        if (!node || !dialog.contains(node)) return null;
        const snapshot = {node};
        if (node.matches?.('input,textarea')) {
            snapshot.start = node.selectionStart;
            snapshot.end = node.selectionEnd;
            snapshot.direction = node.selectionDirection;
        } else {
            const selection = getSelection();
            if (selection?.rangeCount && node.matches?.('[contenteditable="true"],.squire-wysiwyg')) {
                const range = selection.getRangeAt(0);
                if (node.contains(range.commonAncestorContainer)) snapshot.range = {
                    startNode:range.startContainer,startOffset:range.startOffset,
                    endNode:range.endContainer,endOffset:range.endOffset
                };
            }
        }
        return snapshot;
    }
    const captureFocus = dialog => captureNode(dialog,document.activeElement);

    function restoreFocus(snapshot) {
        const node = snapshot?.node;
        if (!node?.isConnected) return;
        try { node.focus({preventScroll:true}); } catch (_error) { node.focus?.(); }
        try {
            if (Number.isInteger(snapshot.start) && node.setSelectionRange) {
                node.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction || 'none');
            } else if (snapshot.range) {
                const selection = getSelection();
                const range = document.createRange();
                range.setStart(snapshot.range.startNode,snapshot.range.startOffset);
                range.setEnd(snapshot.range.endNode,snapshot.range.endOffset);
                selection.removeAllRanges(); selection.addRange(range);
            }
        } catch (_error) {}
    }

    function lockReader(state) {
        if (state.locked?.length || !readerVM?.viewModelDom) return;
        state.locked = [...readerVM.viewModelDom.querySelectorAll(
            '[data-bind*="replyCommand"],[data-bind*="replyAllCommand"],[data-bind*="forwardCommand"]'
        )].filter(node => !state.dialog.contains(node)).map(node => {
            const saved = {node, inert:node.inert, aria:node.getAttribute('aria-disabled')};
            node.inert = true; node.setAttribute('aria-disabled','true');
            return saved;
        });
    }

    function unlockReader(state) {
        (state.locked || []).forEach(({node,inert,aria}) => {
            node.inert = inert; restoreAttribute(node,'aria-disabled',aria);
        });
        state.locked = [];
    }

    function restoreStructure(state) {
        const dialog = state.dialog;
        if (state.marker?.isConnected) state.marker.after(dialog);
        else document.getElementById('rl-app')?.append(dialog);
        state.slot?.remove(); state.slot = null;
    }

    function leaveInline(state) {
        state.inline = false;
        state.hostObserver?.disconnect(); state.hostObserver = null; state.host = null;
        state.dialog.classList.remove('pw-inline-reply');
        restoreAttribute(state.dialog,'role',state.role);
        restoreAttribute(state.dialog,'aria-label',state.label);
        unlockReader(state);
        restoreStructure(state);
    }

    function expand(vm, alreadyOpen = false) {
        const state = states.get(vm);
        if (!state?.inline) return;
        const focus = state.expandFocus || state.editorFocus || captureFocus(state.dialog);
        state.expandFocus = null;
        if (!alreadyOpen && state.dialog.open) state.dialog.close();
        leaveInline(state);
        if (!alreadyOpen) {
            try { state.dialog.showModal(); }
            catch (_error) { state.dialog.setAttribute('open',''); }
        }
        requestAnimationFrame(() => restoreFocus(focus));
    }

    function createSlot(host) {
        const slot = document.createElement('section');
        slot.className = 'pw-inline-reply-slot';
        slot.setAttribute('aria-label', t('Zone de réponse', 'Reply area'));
        const after = host.querySelector(':scope > .pw-conversation-after');
        (after || host.lastElementChild)?.after(slot);
        if (!slot.isConnected) host.append(slot);
        return slot;
    }

    function dock(vm, intent) {
        const state = states.get(vm), dialog = state?.dialog, host = activeHost();
        const currentKey = messageKey(readerVM?.message?.());
        if (!state || state.ticket !== intent.ticket || !vm.modalVisible?.() || !host
            || !document.documentElement.classList.contains('pw-theme')
            || intent.sourceKey && currentKey && intent.sourceKey !== currentKey
            || vm.aDraftInfo?.[0] !== 'reply') return;

        if (state.inline) return;
        if (!state.marker) {
            state.marker = document.createComment('Pied Web native composer');
            dialog.before(state.marker);
        }
        if (dialog.open) dialog.close();
        state.slot = createSlot(host);
        state.slot.append(dialog);
        state.inline = true;
        state.host = host;
        state.hostObserver = new MutationObserver(() => {
            if (state.inline && (!host.isConnected || !host.classList.contains('pw-conversation-active'))) expand(vm);
        });
        state.hostObserver.observe(host,{attributes:true,attributeFilter:['class']});
        dialog.classList.add('pw-inline-reply','animate');
        dialog.setAttribute('role','region');
        dialog.setAttribute('aria-label',t('Rédiger une réponse', 'Write a reply'));
        try { dialog.show(); }
        catch (_error) { dialog.setAttribute('open',''); }
        lockReader(state);
        requestAnimationFrame(() => state.slot?.scrollIntoView({block:'nearest'}));
    }

    function wantsInline(type, message) {
        const host = activeHost(), sourceKey = messageKey(message), currentKey = messageKey(readerVM?.message?.());
        return replyTypes.has(Number(type)) && !!host
            && document.documentElement.classList.contains('pw-theme')
            && (!sourceKey || !currentKey || sourceKey === currentKey);
    }

    function mountCompose(vm) {
        if (vm.viewModelTemplateID !== 'PopupsCompose' || states.has(vm)) return;
        composeVM = vm;
        const dialog = vm.viewModelDom, state = {
            dialog, inline:false, slot:null, marker:null, host:null, hostObserver:null, locked:[], ticket:0,
            role:dialog.getAttribute('role'), label:dialog.getAttribute('aria-label'),
            editorFocus:null, expandFocus:null
        };
        states.set(vm,state); vm.pwInlineReply = state;

        const expandButton = document.createElement('button');
        expandButton.type = 'button'; expandButton.className = 'btn pw-inline-expand';
        expandButton.title = t('Agrandir', 'Expand');
        expandButton.setAttribute('aria-label',expandButton.title);
        expandButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M9 3 3 9m12-6 6 6M9 21l-6-6m12 6 6-6"/></svg><span>'
            + t('Agrandir', 'Expand') + '</span>';
        const controls = dialog.querySelector(':scope > header .pull-right') || dialog.querySelector(':scope > header');
        controls?.insertBefore(expandButton,controls.querySelector('.minimize-custom,.close'));
        expandButton.addEventListener('pointerdown', event => {
            state.expandFocus = captureFocus(dialog) || state.editorFocus;
            event.preventDefault(); // Keep the editor selection until showModal() has moved focus.
        });
        expandButton.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation(); expand(vm);
        });
        dialog.addEventListener('focusout', event => {
            if (event.target.matches?.('textarea,.squire-plain,.squire-wysiwyg,[contenteditable="true"],iframe')) {
                state.editorFocus = captureNode(dialog,event.target) || state.editorFocus;
            }
        });

        const nativeOnShow = vm.onShow;
        vm.onShow = function(...args) {
            const message = sourceMessage(args[1]);
            state.intent = wantsInline(args[0],message)
                ? {sourceKey:messageKey(message),ticket:++state.ticket} : null;
            return nativeOnShow?.apply(this,args);
        };
        const nativeInit = vm.initOnShow;
        if (nativeInit) vm.initOnShow = function(options) {
            const result = nativeInit.apply(this,arguments), intent = state.intent;
            if (intent && replyTypes.has(Number(options?.mode))) setTimeout(() => dock(vm,intent),0);
            return result;
        };
        vm.modalVisible?.subscribe(value => {
            if (value && state.inline) expand(vm,true);
            else if (!value && state.inline) {
                if (dialog.open) dialog.close();
                leaveInline(state);
            }
        });
    }

    function bootstrap() {
        if (typeof ko === 'undefined') return;
        const reader = document.getElementById('V-MailMessageView');
        const compose = document.getElementById('V-PopupsCompose');
        const candidateReader = reader && ko.dataFor(reader);
        const candidateCompose = compose && ko.dataFor(compose);
        if (candidateReader?.viewModelTemplateID === 'MailMessageView') readerVM = candidateReader;
        if (candidateCompose?.viewModelTemplateID === 'PopupsCompose') mountCompose(candidateCompose);
    }
    addEventListener('rl-view-model.create',({detail:vm}) => mountCompose(vm));
    addEventListener('rl-view-model',({detail:vm}) => {
        if (vm.viewModelTemplateID === 'MailMessageView') readerVM = vm;
        else mountCompose(vm);
    });
    new MutationObserver(() => {
        const state = composeVM && states.get(composeVM);
        if (state?.inline && (!document.documentElement.classList.contains('pw-theme') || !activeHost())) expand(composeVM);
    }).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    queueMicrotask(bootstrap);
    api.inlineReply = {active:() => !!(composeVM && states.get(composeVM)?.inline), expand:() => expand(composeVM)};
})();
