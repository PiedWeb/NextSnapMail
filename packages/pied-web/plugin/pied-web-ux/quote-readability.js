/* Keep quoted questions visible next to inline answers. Only native reader
 * disclosures are enhanced; the original message and compose HTML stay intact. */
(() => {
    'use strict';
    const selector = 'details.sm-bq-switcher';
    const outlookSelector = selector + '.pw-outlook-quote';
    const active = () => document.documentElement.classList.contains('pw-theme');
    const french = () => (document.documentElement.lang || 'fr').startsWith('fr');
    const collapseEnabled = () => {
        const value = window.rl?.settings?.get?.('CollapseBlockquotes');
        return value == null || !!Number(value);
    };

    // Outlook desktop and web often leave earlier messages after a visual
    // four-field mail header instead of using blockquote. SnappyMail cannot
    // fold that history, so turn only this strict shape into its native details
    // contract. Field names are deliberately not language-dependent.
    const outlookHeader = node => {
        if (node.tagName !== 'DIV' || node.closest('blockquote,' + selector)) return false;
        const fields = [...node.querySelectorAll('b,strong')].filter(label =>
            label.closest('div') === node
            && /[:\uff1a]\s*$/.test(label.textContent.replace(/[\s\u00a0\u200b-\u200d\ufeff]+/g, ' ').trim())
        );
        const breaks = [...node.querySelectorAll('br')].filter(br => br.closest('div') === node);
        if (fields.length < 4 || breaks.length < 3) return false;
        const style = node.style;
        const ruled = !!style.borderTopStyle && style.borderTopStyle !== 'none'
            && !!style.borderTopWidth && style.borderTopWidth !== '0px';
        const precededByRule = node.previousElementSibling?.tagName === 'HR';
        const outlookClasses = [...(node.parentElement?.classList || [])].some(name =>
            /^(?:msg-)?(?:WordSection|Mso)/i.test(name)
        );
        return ruled || precededByRule || outlookClasses || node.getAttribute('dir') === 'ltr';
    };
    const hasContent = node => {
        if (node.nodeType === Node.TEXT_NODE) {
            return !!node.textContent.replace(/[\s\u00a0\u200b-\u200d\ufeff]/g, '');
        }
        if (node.nodeType !== Node.ELEMENT_NODE || node.matches('style,script,template')
            || node.hidden || node.getAttribute('aria-hidden') === 'true'
            || node.style.display === 'none' || node.style.visibility === 'hidden') return false;
        if (node.matches('img,svg,video,audio,canvas,object')) return true;
        return [...node.childNodes].some(hasContent);
    };
    const hasContentBefore = (body, marker) => {
        // An Outlook-shaped header at the start can be the message itself, not
        // quoted history. Never hide the whole mail behind a disclosure.
        for (let branch = marker; branch && branch !== body; branch = branch.parentNode) {
            for (let sibling = branch.previousSibling; sibling; sibling = sibling.previousSibling) {
                if (hasContent(sibling)) return true;
            }
        }
        return false;
    };
    const foldOutlookHistory = body => {
        if (body.querySelector(outlookSelector)) return;
        const marker = [...body.querySelectorAll('div')].find(outlookHeader);
        if (!marker || !hasContentBefore(body, marker)) return;
        const trailing = [marker];
        for (let node = marker.nextSibling; node; node = node.nextSibling) trailing.push(node);
        if (!trailing.slice(1).some(hasContent) && marker.querySelectorAll('p,div,table').length < 2) return;
        const details = document.createElement('details');
        details.className = 'sm-bq-switcher pw-outlook-quote';
        const summary = document.createElement('summary');
        summary.textContent = '•••';
        const quote = document.createElement('blockquote');
        marker.before(details);
        details.append(summary, quote);
        trailing.forEach(node => quote.append(node));
    };
    const unfoldOutlookHistory = body => body.querySelectorAll(outlookSelector).forEach(details => {
        const quote = details.querySelector(':scope > blockquote');
        if (quote) details.replaceWith(...quote.childNodes);
    });

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
                if (active() && collapseEnabled()) foldOutlookHistory(body);
                else unfoldOutlookHistory(body);
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
