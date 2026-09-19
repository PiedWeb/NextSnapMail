/* A compact, account-scoped folder rail. Native links keep every mail command;
 * this presentation layer only mirrors them and proxies activation. */
(() => {
    'use strict';
    const html = document.documentElement;
    const desktop = matchMedia('(min-width: 800px)');
    const HOLD_MS = 450, MOVE_TOLERANCE = 8;
    const CACHE_PREFIX = 'pw-folder-order:';
    const value = candidate => typeof candidate === 'function' ? candidate() : candidate;
    const french = () => (html.lang || 'fr').startsWith('fr');
    const text = (fr, en) => french() ? fr : en;
    const active = () => html.classList.contains('pw-theme');
    const compact = () => active() && desktop.matches && html.classList.contains('rl-left-panel-disabled');
    const accountHash = () => String(window.rl?.settings?.get?.('accountHash') || 'default');
    const readCache = account => {
        try {
            const parsed = JSON.parse(localStorage.getItem(CACHE_PREFIX + account) || '[]');
            return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : [];
        } catch { return []; }
    };
    const writeCache = (account, next) => {
        try { localStorage.setItem(CACHE_PREFIX + account, JSON.stringify(next)); } catch {}
    };
    const pluginRequest = (params, callback) => {
        if (!window.rl?.pluginRemoteRequest) return callback(new Error('remote'));
        window.rl.pluginRemoteRequest((code, data) => {
            const result = data?.Result;
            code || !result || result.error || !Array.isArray(result.order)
                ? callback(new Error(result?.error || 'folder-order')) : callback(null, result.order);
        }, 'PiedWebFolderOrder', params, 30000);
    };

    let root, content, rail, observer, themeObserver, frame = 0;
    let sources = new Map(), order = [], account = '', generation = 0;
    let drag = null, suppressClickUntil = 0, tooltipTimer = 0, tooltipTarget = null;

    const status = document.createElement('span');
    status.className = 'pw-folder-rail-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const tooltip = document.createElement('span');
    tooltip.id = 'pw-folder-rail-tooltip'; tooltip.className = 'pw-folder-rail-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
    const tooltipLabel = document.createElement('strong'), tooltipHint = document.createElement('span');
    tooltip.append(tooltipLabel, tooltipHint);
    const ensureGlobalNodes = () => {
        if (!status.isConnected) document.body.append(status);
        if (!tooltip.isConnected) document.body.append(tooltip);
    };
    const announce = message => {
        ensureGlobalNodes(); status.textContent = '';
        requestAnimationFrame(() => { status.textContent = message; });
    };
    const hideTooltip = () => {
        clearTimeout(tooltipTimer); tooltipTimer = 0; tooltipTarget = null; tooltip.hidden = true;
    };
    const positionTooltip = button => {
        tooltip.hidden = false;
        const anchor = button.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
        const left = Math.min(innerWidth - box.width - 8, anchor.right + 10);
        const top = Math.max(8, Math.min(innerHeight - box.height - 8, anchor.top + (anchor.height - box.height) / 2));
        tooltip.style.left = Math.max(8, left) + 'px'; tooltip.style.top = top + 'px';
    };
    const showTooltip = (button, delayed) => {
        hideTooltip(); tooltipTarget = button;
        tooltipTimer = setTimeout(() => {
            if (tooltipTarget !== button || !button.isConnected || drag?.active || !compact()) return;
            ensureGlobalNodes(); tooltipLabel.textContent = button.dataset.pwTooltip || button.getAttribute('aria-label') || '';
            tooltipHint.textContent = text('Maintenir pour réorganiser', 'Hold to reorder');
            positionTooltip(button);
        }, delayed ? 260 : 0);
    };

    const directLabel = link => {
        const explicit = link.querySelector('.pw-feed-nav-label')?.textContent?.trim();
        if (explicit) return explicit;
        return [...link.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent.trim()).filter(Boolean).join(' ').trim()
            || link.getAttribute('aria-label') || link.title || '';
    };
    const modelFor = link => window.ko?.dataFor?.(link);
    const sourceIdentity = (link, index) => {
        if (link.dataset.pwFeed) return 'feed:' + link.dataset.pwFeed;
        const folder = modelFor(link), fullName = String(value(folder?.fullName) || '');
        if (fullName) return 'folder:' + fullName;
        const group = link.closest('.b-folders-user') ? 'user' : 'system';
        const href = link.getAttribute('href') || '';
        return 'fallback:' + group + ':' + (href || directLabel(link) || index);
    };
    const graphemes = candidate => {
        if (window.Intl?.Segmenter) return [...new Intl.Segmenter(html.lang || 'fr', {granularity:'grapheme'}).segment(candidate)].map(part => part.segment);
        return Array.from(candidate);
    };
    const monogram = label => {
        const words = String(label || '').trim().split(/[\s_\-]+/u).filter(Boolean);
        const letters = words.length > 1 ? words.slice(0, 2).map(word => graphemes(word)[0] || '') : graphemes(words[0] || '').slice(0, 2);
        return letters.join('').toLocaleUpperCase(html.lang || 'fr').slice(0, 3) || '•';
    };
    const iconFor = (link, custom) => {
        if (link.dataset.pwFeed === 'global') return 'var(--pw-global-feed-icon)';
        if (link.dataset.pwFeed) return 'var(--pw-feed-icon)';
        return getComputedStyle(link).getPropertyValue('--mail-folder-icon').trim()
            || (custom ? 'var(--pw-folder-rail-folder-icon)' : 'var(--pw-folder-rail-folder-icon)');
    };
    const rowFor = (link, index) => {
        const folder = modelFor(link), id = sourceIdentity(link, index), label = directLabel(link) || id;
        const fullName = String(value(folder?.fullName) || '');
        const custom = !!link.closest('.b-folders-user') && !link.classList.contains('system');
        const unread = Math.max(0, Number(link.dataset.unread) || 0);
        const path = custom && fullName && fullName !== label ? fullName : label;
        const count = unread ? (french() ? `${unread} non lu${unread > 1 ? 's' : ''}` : `${unread} unread`) : '';
        return {id, link, label, path, custom, unread, icon:iconFor(link, custom), selected:link.classList.contains('selected'),
            tooltip:count ? `${path} · ${count}` : path};
    };
    const sourceRows = () => {
        const found = new Map();
        root.querySelectorAll('.b-folders-system a.selectable, .b-folders-user a.selectable').forEach((link, index) => {
            if (link.closest('.pw-folder-rail') || link.closest('li')?.hidden || link.closest('ul.collapsed')) return;
            const row = rowFor(link, index);
            if (!found.has(row.id)) found.set(row.id, row);
        });
        sources = found;
        const arranged = [], pending = new Map(found);
        order.forEach(id => { if (pending.has(id)) { arranged.push(pending.get(id)); pending.delete(id); } });
        pending.forEach(row => arranged.push(row));
        return arranged;
    };
    const createItem = id => {
        const item = document.createElement('li'); item.className = 'pw-folder-rail-item'; item.dataset.pwFolderId = id;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'pw-folder-rail-button';
        button.setAttribute('aria-describedby', tooltip.id); button.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
        const sigle = document.createElement('span'); sigle.className = 'pw-folder-rail-monogram'; sigle.setAttribute('aria-hidden', 'true');
        const count = document.createElement('span'); count.className = 'pw-folder-rail-count'; count.setAttribute('aria-hidden', 'true');
        button.append(sigle, count); item.append(button); return item;
    };
    const render = () => {
        frame = 0;
        if (!root || !rail || drag?.active) return;
        const nextAccount = accountHash();
        if (nextAccount !== account) {
            account = nextAccount; order = readCache(account); loadOrder();
        }
        const rows = sourceRows(), existing = new Map([...rail.children].map(item => [item.dataset.pwFolderId, item]));
        rows.forEach((row, index) => {
            const item = existing.get(row.id) || createItem(row.id), button = item.querySelector('.pw-folder-rail-button');
            existing.delete(row.id); item.hidden = false;
            button.dataset.pwTooltip = row.tooltip; button.dataset.pwLabel = row.label;
            button.setAttribute('aria-label', row.tooltip);
            button.setAttribute('aria-description', text('Maintenir, puis faire glisser pour réorganiser. Alt et flèche pour déplacer au clavier.', 'Hold, then drag to reorder. Use Alt and an arrow key to move with the keyboard.'));
            button.style.setProperty('--pw-rail-icon', row.icon);
            button.classList.toggle('pw-folder-custom', row.custom); button.classList.toggle('selected', row.selected);
            if (row.selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
            button.querySelector('.pw-folder-rail-monogram').textContent = row.custom ? monogram(row.label) : '';
            const count = button.querySelector('.pw-folder-rail-count'); count.textContent = row.unread ? String(row.unread) : ''; count.hidden = !row.unread;
            const current = rail.children[index];
            if (current !== item) rail.insertBefore(item, current || null);
        });
        existing.forEach(item => item.remove());
        root.classList.add('pw-folder-rail-ready');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    const currentIds = () => [...rail.children].filter(item => !item.hidden).map(item => item.dataset.pwFolderId);
    const loadOrder = () => {
        const requestedAccount = account, request = ++generation;
        pluginRequest({}, (error, saved) => {
            if (error || request !== generation || requestedAccount !== accountHash()) return;
            account = requestedAccount; order = [...new Set(saved)]; writeCache(account, order); schedule();
        });
    };
    const persistOrder = ids => {
        order = [...new Set(ids)]; const requestedAccount = account;
        writeCache(requestedAccount, order);
        pluginRequest({order:JSON.stringify(order)}, (error, saved) => {
            if (requestedAccount !== accountHash()) return;
            if (error) {
                announce(text('Ordre enregistré sur cet appareil seulement', 'Order saved on this device only'));
                return;
            }
            order = [...new Set(saved)]; writeCache(requestedAccount, order); schedule();
        });
    };
    const restoreDragOrder = () => drag?.original?.forEach(id => {
        const item = [...rail.children].find(candidate => candidate.dataset.pwFolderId === id);
        if (item) rail.append(item);
    });
    const cleanupDrag = () => {
        if (!drag) return;
        const current = drag; drag = null;
        clearTimeout(current.timer); const button = current.button;
        button.classList.remove('pw-dragging'); button.removeAttribute('aria-grabbed'); rail.classList.remove('pw-reordering');
        html.classList.remove('pw-folder-dragging');
        try { if (rail.hasPointerCapture(current.pointerId)) rail.releasePointerCapture(current.pointerId); } catch {}
    };
    const cancelDrag = () => {
        if (!drag) return;
        const label = drag.button.dataset.pwLabel;
        if (drag.active) { restoreDragOrder(); announce(text(`Déplacement de ${label} annulé`, `Moving ${label} cancelled`)); }
        cleanupDrag();
    };
    const activateDrag = () => {
        if (!drag || !compact()) return cancelDrag();
        try { rail.setPointerCapture(drag.pointerId); } catch {}
        drag.active = true; hideTooltip(); rail.classList.add('pw-reordering'); drag.button.classList.add('pw-dragging');
        drag.button.setAttribute('aria-grabbed', 'true'); html.classList.add('pw-folder-dragging');
        announce(text(`Déplacement de ${drag.button.dataset.pwLabel}`, `Moving ${drag.button.dataset.pwLabel}`));
    };
    const pointerDown = event => {
        const button = event.target.closest?.('.pw-folder-rail-button');
        if (!button || !rail.contains(button) || !compact() || event.button !== 0 || !event.isPrimary) return;
        drag = {button, item:button.parentElement, pointerId:event.pointerId, startX:event.clientX, startY:event.clientY,
            original:currentIds(), active:false, timer:setTimeout(activateDrag, HOLD_MS)};
    };
    const pointerMove = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.active) {
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > MOVE_TOLERANCE) cleanupDrag();
            return;
        }
        event.preventDefault();
        const siblings = [...rail.children].filter(item => item !== drag.item && !item.hidden);
        const before = siblings.find(item => event.clientY < item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2);
        before ? rail.insertBefore(drag.item, before) : rail.append(drag.item);
    };
    const pointerUp = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.active) return cleanupDrag();
        event.preventDefault(); suppressClickUntil = performance.now() + 600;
        const label = drag.button.dataset.pwLabel, ids = currentIds(), position = ids.indexOf(drag.item.dataset.pwFolderId) + 1;
        cleanupDrag(); persistOrder(ids);
        announce(text(`${label}, position ${position}. Ordre enregistré.`, `${label}, position ${position}. Order saved.`));
    };
    const keyboard = event => {
        const button = event.target.closest?.('.pw-folder-rail-button');
        if (!button || !rail.contains(button)) return;
        if (event.key === 'Escape' && drag?.active) { event.preventDefault(); cancelDrag(); return; }
        if (!event.altKey || !['ArrowUp','ArrowDown'].includes(event.key) || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault(); const item = button.parentElement;
        const sibling = event.key === 'ArrowUp' ? item.previousElementSibling : item.nextElementSibling;
        if (!sibling) return;
        event.key === 'ArrowUp' ? rail.insertBefore(item, sibling) : rail.insertBefore(sibling, item);
        const ids = currentIds(), position = ids.indexOf(item.dataset.pwFolderId) + 1;
        persistOrder(ids); button.focus();
        announce(text(`${button.dataset.pwLabel}, position ${position}. Ordre enregistré.`, `${button.dataset.pwLabel}, position ${position}. Order saved.`));
    };
    const mount = dom => {
        if (!dom || root === dom) return;
        root = dom; content = root.querySelector('.b-content');
        if (!content) return;
        rail = document.createElement('ul'); rail.className = 'pw-folder-rail'; rail.setAttribute('aria-label', text('Boîtes aux lettres', 'Mailboxes'));
        content.append(rail); ensureGlobalNodes(); account = accountHash(); order = readCache(account);
        rail.addEventListener('click', event => {
            const button = event.target.closest?.('.pw-folder-rail-button');
            if (!button) return;
            if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
            sources.get(button.parentElement.dataset.pwFolderId)?.link.click();
        });
        rail.addEventListener('pointerdown', pointerDown);
        rail.addEventListener('pointermove', pointerMove);
        rail.addEventListener('pointerup', pointerUp);
        rail.addEventListener('pointercancel', cancelDrag);
        rail.addEventListener('lostpointercapture', () => drag?.active && cancelDrag());
        rail.addEventListener('keydown', keyboard);
        rail.addEventListener('contextmenu', event => { if (drag?.active) event.preventDefault(); });
        rail.addEventListener('pointerover', event => {
            const button = event.target.closest?.('.pw-folder-rail-button');
            if (button && !button.contains(event.relatedTarget)) showTooltip(button, true);
        });
        rail.addEventListener('pointerout', event => {
            const button = event.target.closest?.('.pw-folder-rail-button');
            if (button && !button.contains(event.relatedTarget)) hideTooltip();
        });
        rail.addEventListener('focusin', event => {
            const button = event.target.closest?.('.pw-folder-rail-button'); if (button) showTooltip(button, false);
        });
        rail.addEventListener('focusout', hideTooltip);
        observer = new MutationObserver(records => {
            if (records.some(record => !rail.contains(record.target))) schedule();
        });
        observer.observe(content, {subtree:true, childList:true, characterData:true, attributes:true,
            attributeFilter:['class','data-unread','hidden','title']});
        themeObserver = new MutationObserver(() => { compact() || hideTooltip(); schedule(); });
        themeObserver.observe(html, {attributes:true, attributeFilter:['class','lang','data-theme','data-themes']});
        addEventListener('resize', hideTooltip); content.addEventListener('scroll', hideTooltip, {passive:true});
        loadOrder(); schedule();
    };
    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID === 'MailFolderList') mount(vm.viewModelDom);
    });
    addEventListener('pw-feed-mode-changed', schedule);
    const existing = document.getElementById('V-MailFolderList');
    if (existing) mount(existing);
})();
