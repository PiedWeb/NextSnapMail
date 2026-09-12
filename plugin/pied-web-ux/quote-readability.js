/* Keep quoted questions visible next to inline answers. Only native reader
 * disclosures are enhanced; the original message and compose HTML stay intact. */
(() => {
    'use strict';
    const selector = 'details.sm-bq-switcher';
    const active = () => document.documentElement.classList.contains('pw-theme');
    const french = () => (document.documentElement.lang || 'fr').startsWith('fr');

    // Walk backwards once per body. A quote followed by non-quoted text at the
    // same quotation level belongs to an inline exchange. Nested history starts
    // a separate level; whitespace, tracking images and hidden text do not count.
    const inlineQuotes = root => {
        const result = new Set();
        const walk = (parent, following = false) => {
            for (let node = parent.lastChild; node; node = node.previousSibling) {
                if (node.nodeType === Node.TEXT_NODE) {
                    if (node.textContent.replace(/[\s\u200b-\u200d\ufeff]/g, '')) following = true;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.hidden || node.getAttribute('aria-hidden') === 'true'
                        || node.style.display === 'none' || node.style.visibility === 'hidden'
                        || node.matches('style,script,template,summary')) continue;
                    if (node.matches(selector)) {
                        if (following) result.add(node);
                        const quote = node.querySelector(':scope > blockquote');
                        if (quote) walk(quote);
                    } else if (node.tagName === 'BLOCKQUOTE') walk(node);
                    else following = walk(node, following);
                }
            }
            return following;
        };
        walk(root);
        return result;
    };

    addEventListener('rl-view-model', ({detail: vm}) => {
        if (vm.viewModelTemplateID !== 'MailMessageView' || vm.pwQuoteReadability) return;
        const container = vm.viewModelDom.querySelector('#messageItem');
        if (!container) return;
        vm.pwQuoteReadability = true;
        const states = new WeakMap();
        const label = (node, state) => {
            if (!active() || !states.has(node)) return;
            const fr = french();
            const text = node.open ? (fr ? 'Citation' : 'Quote')
                : (fr ? 'Afficher la citation' : 'Show quoted text');
            const action = node.open ? (fr ? 'Replier la citation' : 'Collapse quoted text') : text;
            if (state.summary.textContent !== text) state.summary.textContent = text;
            state.summary.setAttribute('aria-label', action);
            state.summary.title = action;
        };
        const scan = () => {
            container.querySelectorAll('.b-text-part').forEach(body => {
                const quotes = [...body.querySelectorAll(selector)];
                const inline = active() && quotes.some(node => !states.has(node)) ? inlineQuotes(body) : new Set();
                quotes.forEach(node => {
                    let state = states.get(node);
                    if (!active()) {
                        if (state) {
                            node.removeEventListener('toggle', state.toggle);
                            state.summary.replaceWith(state.originalSummary);
                            if (node.open === state.initialOpen) node.open = state.originalOpen;
                            states.delete(node);
                            node.classList.remove('pw-quote');
                        }
                        return;
                    }
                    if (!state) {
                        const summary = node.querySelector(':scope > summary');
                        // Preserve lastElementChild = blockquote: SnappyMail relies
                        // on this exact structure when replying, forwarding or printing.
                        if (!summary || node.lastElementChild?.tagName !== 'BLOCKQUOTE') return;
                        state = {summary, originalSummary: summary.cloneNode(true), originalOpen: node.open};
                        if (inline.has(node)) node.open = true;
                        state.initialOpen = node.open;
                        state.toggle = () => label(node, state);
                        states.set(node, state);
                        node.classList.add('pw-quote');
                        node.addEventListener('toggle', state.toggle);
                    }
                    label(node, state);
                });
            });
        };
        // No open-attribute observer: a user's click or native B shortcut must
        // stay authoritative, including when a cached body is shown again.
        const observer = new MutationObserver(scan);
        observer.observe(container, {childList:true, subtree:true});
        const themeObserver = new MutationObserver(scan);
        themeObserver.observe(document.documentElement, {attributes:true, attributeFilter:['class','lang']});
        ko.utils.domNodeDisposal.addDisposeCallback(vm.viewModelDom, () => {
            observer.disconnect();
            themeObserver.disconnect();
        });
        scan();
    });
})();
