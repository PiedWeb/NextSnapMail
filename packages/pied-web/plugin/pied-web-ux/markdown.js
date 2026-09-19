/* Markdown is an HTML editing view. Native draft/send paths always receive HTML. */
(() => {
    'use strict';
    const api = window.PiedWebUx = window.PiedWebUx || {};
    if (api.markdown || !api.markdownDeps || typeof TurndownService === 'undefined') return;
    const deps = api.markdownDeps;
    const parser = new deps.marked.Marked({gfm: true, breaks: false, async: false});
    // Noninteractive task markers survive mail clients and the native paste cleaner.
    parser.use({renderer: {checkbox: ({checked}) => checked ? '☑ ' : '☐ '}});
    const createConverter = () => {
        const service = new TurndownService({headingStyle: 'atx', codeBlockStyle: 'fenced',
            bulletListMarker: '-', emDelimiter: '*'});
        service.use(deps['turndown-plugin-gfm'].gfm);
        return service;
    };
    const converter = createConverter();
    // Reading a message should yield Markdown, not the raw styled HTML that
    // the compose view keeps to protect signatures when a draft is edited.
    const messageConverter = createConverter();
    converter.addRule('piedWebRichHtml', {
        filter: node => node.matches('.rl-signature, [style], [align], [dir], img[width], img[height], img[src^="cid:"]'),
        replacement: (_content, node) => {
            // Keep rich signatures/layout as a single raw-HTML block, even with blank lines.
            const html = node.outerHTML.replace(/\r?\n/g, '&#10;');
            return node.isBlock ? '\n\n' + html + '\n\n' : html;
        }
    });
    const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
    const render = text => deps.dompurify.sanitize(parser.parse(String(text).replace(/^\uFEFF/, '')), {
        USE_PROFILES: {html: true}, FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
        FORBID_ATTR: ['id', 'name'], ALLOW_DATA_ATTR: false
    });
    const cleanSignatureTables = html => {
        const template = document.createElement('template');
        template.innerHTML = html;
        const tables = [...template.content.querySelectorAll('table')];
        const signature = table => {
            const text = table.textContent.replace(/\s+/g, ' ').trim();
            const email = !!table.querySelector('a[href^="mailto:"]') || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text);
            const phone = /(?:\+?\d[\d\s()./-]{7,}\d)/.test(text);
            const website = !!table.querySelector('a[href^="http"]') || /\b(?:www\.|[a-z\d-]+\.(?:com|fr|org|net))\b/i.test(text);
            return text.length >= 20 && text.length <= 900 && email && (phone || website)
                && !table.querySelector('th,thead') && table.querySelector('img')
                && (table.querySelector('table') || table.querySelectorAll('img').length >= 2);
        };
        const candidates = tables.filter(signature);
        const topLevel = candidates.filter(table => !candidates.some(other => other !== table && other.contains(table)));
        topLevel.forEach(table => {
            const lines = [];
            let parts = [];
            const flush = () => {
                const text = parts.map(part => typeof part === 'string' ? part : part.textContent).join('').replace(/\s+/g, ' ').trim();
                if (text) lines.push(parts);
                parts = [];
            };
            const walk = node => {
                if (node.nodeType === Node.TEXT_NODE) { parts.push(node.textContent.replace(/\s+/g, ' ')); return; }
                if (node.nodeType !== Node.ELEMENT_NODE || node.matches('img,svg,script,style,template,[hidden],[aria-hidden="true"]') || node.style.display === 'none') return;
                if (node.tagName === 'BR') { flush(); return; }
                if (node.tagName === 'A') {
                    const href = node.getAttribute('href') || '';
                    if (/^(https?:|mailto:|tel:)/i.test(href) && !/[\r\n]/.test(href)) {
                        const link = document.createElement('a'); link.setAttribute('href', href); link.textContent = node.textContent;
                        parts.push(link);
                    } else parts.push(node.textContent);
                    return;
                }
                const block = /^(?:TABLE|TBODY|THEAD|TFOOT|TR|TD|TH|DIV|P|H[1-6]|UL|OL|LI|SECTION|HEADER|FOOTER)$/.test(node.tagName);
                if (block) flush();
                [...node.childNodes].forEach(walk);
                if (block) flush();
            };
            walk(table);
            flush();
            const paragraph = document.createElement('p');
            lines.forEach((line, index) => {
                if (index) paragraph.append(document.createElement('br'));
                line.forEach(part => paragraph.append(typeof part === 'string' ? document.createTextNode(part) : part));
            });
            table.replaceWith(paragraph);
        });
        return template.innerHTML;
    };
    api.markdown = {render, fromHtml: html => converter.turndown(html),
        fromMessageHtml: html => messageConverter.turndown(cleanSignatureTables(html))};

    addEventListener('squire-toolbar', event => {
        const {squire: editor, actions} = event.detail;
        const container = editor.container;
        if (!container.closest('#V-PopupsCompose') || container.classList.contains('pw-markdown-editor')) return;
        container.classList.add('pw-markdown-editor');
        const french = () => (document.documentElement.lang || rl.settings?.get('Language') || 'en').startsWith('fr');
        const t = (fr, en) => french() ? fr : en;
        const base = {};
        ['setMode', 'getData', 'setData', 'execCommand', 'focus', 'blur'].forEach(name => base[name] = editor[name].bind(editor));
        let originalHtml = '', initialMarkdown = '', cachedText = null, cachedHtml = '', pendingPaste = 0;
        const note = document.createElement('p');
        note.className = 'pw-markdown-note';
        note.setAttribute('role', 'status');
        const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ + ⇧ + V' : 'Ctrl + Maj + V';
        const updateNote = () => {
            note.textContent = editor.mode === 'markdown'
                ? t('Markdown · Revenez à Visuel pour vérifier la mise en forme.', 'Markdown · Switch to Visual to review formatting.')
                : editor.mode === 'plain'
                    ? t('Passez à Markdown pour mettre en forme votre texte.', 'Switch to Markdown to format your text.')
                    : editor.mode === 'source'
                        ? t('Code HTML · Cliquez sur Source pour revenir à la vue visuelle.', 'HTML source · Click Source to return to the visual editor.')
                        : t('Coller du Markdown : ', 'Paste Markdown: ') + shortcut;
            if (editor.mode === 'markdown' && /<(?:div|table|span|img)\b/i.test(editor.plain.value)) {
                note.textContent += t(' Les éléments à mise en forme avancée restent en HTML.', ' Rich formatting is kept as HTML.');
            }
        };
        const view = {html: 'Markdown', cmd: () => editor.setMode(editor.mode === 'markdown' ? 'wysiwyg' : 'markdown')};
        const source = actions.changes.source;
        source.html = 'Source';
        // Keep both text views within reach before the horizontally scrollable formatting tools.
        delete actions.changes.source;
        const groups = {mode: actions.mode, views: {source, markdown: view}, ...actions};
        Object.keys(actions).forEach(key => delete actions[key]);
        Object.assign(actions, groups);
        const updateControls = () => {
            const md = editor.mode === 'markdown';
            if (view.input) {
                view.input.textContent = md ? t('Visuel', 'Visual') : 'Markdown';
                view.input.title = md ? t('Revenir à l’éditeur visuel', 'Return to visual editor') : t('Afficher et modifier le Markdown', 'View and edit Markdown');
                view.input.setAttribute('aria-label', view.input.title);
            }
            if (source.input) {
                source.input.classList.toggle('active', editor.mode === 'source');
                source.input.setAttribute('aria-pressed', String(editor.mode === 'source'));
            }
            updateNote();
        };
        const snapshot = html => {
            originalHtml = html;
            initialMarkdown = converter.turndown(html);
            editor.plain.value = initialMarkdown;
            cachedText = null;
        };
        const markdownHtml = () => {
            const text = editor.plain.value;
            // Merely viewing Markdown must not rewrite a rich draft/signature.
            if (text === initialMarkdown) return originalHtml;
            if (cachedText !== text) {
                try { cachedHtml = render(text); updateNote(); }
                catch (_error) {
                    // HtmlEditor swallows exceptions and returns an empty string. Preserve text instead.
                    cachedHtml = '<div>' + escape(text).replace(/\n/g, '<br>') + '</div>';
                    note.textContent = t('Conversion indisponible : votre texte est conservé sans mise en forme.', 'Conversion unavailable: your text is preserved without formatting.');
                }
                cachedText = text;
            }
            return cachedHtml;
        };
        const setView = mode => {
            container.classList.remove('squire-mode-' + editor.mode);
            editor.mode = mode;
            container.classList.add('squire-mode-' + mode);
            if (editor.modeSelect) editor.modeSelect.selectedIndex = mode === 'plain' ? 1 : 0;
            updateControls();
            editor.onModeChange?.();
            editor.focus();
        };
        editor.getData = () => editor.mode === 'markdown' ? markdownHtml() : base.getData();
        editor.setMode = mode => {
            if (mode === editor.mode) return;
            if (mode === 'markdown') {
                const html = editor.mode === 'plain' ? rl.Utils.plainToHtml(editor.plain.value) : base.getData();
                snapshot(html);
                // Source/plain may differ from the hidden visual editor.
                if (editor.mode !== 'wysiwyg') base.setData(html);
                setView('markdown');
            } else if (editor.mode === 'markdown') {
                const changed = editor.plain.value !== initialMarkdown;
                const html = markdownHtml();
                if (changed) base.setData(html);
                if (mode === 'source') editor.plain.value = html;
                else if (mode === 'plain') editor.plain.value = rl.Utils.htmlToPlain(html);
                setView(mode);
            } else {
                base.setMode(mode);
                updateControls();
            }
        };
        editor.setData = html => {
            base.setData(html);
            if (editor.mode === 'markdown') snapshot(base.getData());
        };
        editor.execCommand = (command, config) => {
            if (editor.mode !== 'markdown' || config?.clearCache) return base.execCommand(command, config);
            base.setData(markdownHtml());
            const result = base.execCommand(command, config);
            snapshot(base.getData());
            updateControls();
            return result;
        };
        editor.focus = () => ['markdown', 'source'].includes(editor.mode) ? editor.plain.focus() : base.focus();
        editor.blur = () => ['markdown', 'source'].includes(editor.mode) ? editor.plain.blur() : base.blur();
        editor.plain.addEventListener('input', updateNote);
        const editable = () => editor.mode === 'wysiwyg' && !container.closest('[inert]') && !editor.wysiwyg.closest('[inert]');
        container.addEventListener('keydown', e => {
            if (e.key.toLowerCase() === 'v') pendingPaste = editable() && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey ? Date.now() : 0;
        }, true);
        container.addEventListener('focusout', e => { if (!container.contains(e.relatedTarget)) pendingPaste = 0; });
        container.addEventListener('paste', e => {
            const markdownPaste = pendingPaste && Date.now() - pendingPaste < 2000;
            pendingPaste = 0;
            if (!markdownPaste || !editable() || !e.clipboardData?.types.includes('text/plain')) return;
            let html;
            try { html = render(e.clipboardData.getData('text/plain')); }
            catch (_error) { return; } // Let normal native paste preserve the clipboard on conversion failure.
            e.preventDefault();
            e.stopImmediatePropagation();
            editor.squire.insertHTML(html, true);
        }, true);
        queueMicrotask(() => {
            view.input.tabIndex = source.input.tabIndex = 0;
            source.input.title = t('Afficher le code HTML', 'View HTML source');
            source.input.setAttribute('aria-label', source.input.title);
            editor.plain.setAttribute('aria-label', t('Corps du message', 'Message body'));
            container.append(note);
            updateControls();
        });
    });
})();
