/* Image controls live outside the editable message and never enter its HTML. */
(() => {
    'use strict';
    const {compress, busy, active, t} = window.PiedWebUx.images;
    addEventListener('squire-toolbar', ({detail:{squire:editor, actions}}) => {
        const container = editor.container, dialog = container.closest('#V-PopupsCompose');
        if (!dialog) return;
        const squire = editor.squire, body = editor.wysiwyg;
        let selected = null, epoch = 0, drag = null, disposed = false, resizeFrame = 0;
        const create = (tag, cls) => Object.assign(document.createElement(tag), {className:cls});
        const panel = create('div', 'pw-image-tools'), outline = create('div', 'pw-image-outline');
        const status = create('div', 'pw-image-status'), handle = create('button', 'pw-image-handle');
        panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', t('Image sélectionnée', 'Selected image'));
        status.setAttribute('role', 'status'); status.hidden = panel.hidden = outline.hidden = true;
        handle.type = 'button'; handle.title = t('Redimensionner l’image (flèches gauche et droite)', 'Resize image (left and right arrows)');
        handle.setAttribute('aria-label', handle.title); outline.append(handle);
        const buttons = [];
        const button = (label, command, cls = '') => {
            const el = create('button', cls); el.type = 'button'; el.textContent = label;
            el.addEventListener('click', command); panel.append(el); return el;
        };
        const announce = message => { status.textContent = message; status.hidden = !message; };
        const hide = () => { selected = null; panel.hidden = outline.hidden = true; };
        const usable = () => active() && editor.mode === 'wysiwyg' && !container.closest('[inert]') && !disposed;
        function position() {
            if (!selected || !body.contains(selected) || !usable() || !body.getClientRects().length) { hide(); return; }
            const r = selected.getBoundingClientRect(), c = container.getBoundingClientRect(), b = body.getBoundingClientRect();
            const visible = r.bottom > b.top && r.top < b.bottom;
            panel.hidden = outline.hidden = !visible;
            if (!visible) return;
            Object.assign(outline.style, {left:r.left-c.left+'px', top:r.top-c.top+'px', width:r.width+'px', height:r.height+'px'});
            outline.style.clipPath = 'inset('+(r.top<b.top?b.top-r.top:-24)+'px -24px '+(r.bottom>b.bottom?r.bottom-b.bottom:-24)+'px -24px)';
            handle.hidden = r.bottom > b.bottom || r.bottom < b.top;
            panel.style.maxWidth = Math.max(0, c.width-16)+'px';
            panel.style.left = Math.max(8, Math.min(r.left-c.left, c.width-panel.offsetWidth-8))+'px';
            panel.style.top = Math.max(b.top-c.top, Math.min(r.bottom-c.top+8, b.bottom-c.top-panel.offsetHeight-8))+'px';
            const width = parseInt(selected.getAttribute('width') || selected.style.width) || selected.naturalWidth;
            buttons.forEach(([el, size]) => el.setAttribute('aria-pressed', String(width === Math.min(size, selected.naturalWidth || size))));
        }
        function select(image) {
            if (!usable()) return;
            selected = image; altRow.hidden = true; panel.hidden = outline.hidden = false; position();
        }
        function setWidth(width, checkpoint = true) {
            if (!selected || !body.contains(selected)) return;
            if (checkpoint) squire.saveUndoState();
            width = Math.round(Math.max(24, Math.min(width, selected.naturalWidth || width)));
            selected.setAttribute('width', width);
            selected.removeAttribute('height');
            Object.assign(selected.style, {width:width+'px', height:'auto', maxWidth:'100%'});
            position();
        }
        for (const [label, size] of [[t('Petite', 'Small'),200], [t('Moyenne', 'Medium'),600], [t('Taille d’origine', 'Original size'),Infinity]]) {
            const el = button(label, () => setWidth(Math.min(size, selected?.naturalWidth || 600)));
            buttons.push([el, size]);
        }
        const altButton = button(t('Texte alternatif', 'Alt text'), () => { alt.value = selected?.alt || ''; altRow.hidden = !altRow.hidden; position(); if (!altRow.hidden) alt.focus(); });
        const removeButton = button(t('Retirer', 'Remove'), () => { if (selected) { squire.saveUndoState(); selected.remove(); hide(); squire.focus(); } }, 'pw-image-remove');
        const sizes = create('div', 'pw-image-sizes'), imageActions = create('div', 'pw-image-actions');
        sizes.append(...buttons.map(([el]) => el)); imageActions.append(altButton,removeButton); panel.append(sizes,imageActions);
        const altRow = create('div', 'pw-image-alt'), alt = document.createElement('input');
        alt.type = 'text'; alt.placeholder = t('Décrire l’image', 'Describe the image'); alt.setAttribute('aria-label', alt.placeholder);
        const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'OK';
        const applyAlt = () => { if (selected) { squire.saveUndoState(); selected.alt = alt.value; altRow.hidden = true; position(); panel.querySelector('button').focus(); } };
        apply.addEventListener('click', applyAlt); alt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); applyAlt(); } });
        altRow.hidden = true; altRow.append(alt, apply); panel.append(altRow);
        panel.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
        const click = e => {
            if (body.contains(e.target) && e.target.tagName === 'IMG') { e.preventDefault(); select(e.target); }
            else if (!panel.contains(e.target) && !outline.contains(e.target)) hide();
        };
        dialog.addEventListener('click', click);
        const escape = e => { if (e.key === 'Escape' && selected) { e.preventDefault(); e.stopImmediatePropagation(); hide(); squire.focus(); } };
        dialog.addEventListener('keydown', escape, true);
        handle.addEventListener('pointerdown', e => {
            if (e.button !== 0 || !selected) return;
            e.preventDefault(); squire.saveUndoState();
            drag = {x:e.clientX, width:selected.getBoundingClientRect().width}; handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', e => { if (drag) setWidth(drag.width+e.clientX-drag.x, false); });
        handle.addEventListener('pointerup', () => { drag = null; });
        handle.addEventListener('pointercancel', () => { drag = null; });
        handle.addEventListener('keydown', e => {
            if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setWidth(selected.getBoundingClientRect().width+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?50:10)); }
        });
        const read = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
        async function insert(file) {
            const version = epoch, range = squire.getSelection().cloneRange();
            announce(t('Préparation de l’image…', 'Preparing image…'));
            await busy(async () => {
                try {
                    let result;
                    try { result = await compress(file); } catch { result = file; }
                    const src = await read(result);
                    const image = new Image(); image.src = src; await image.decode();
                    if (version !== epoch || disposed || !usable() || !body.contains(range.startContainer)) return;
                    squire.setSelection(range); squire.saveUndoState();
                    const node = squire.insertImage(src, {alt:'', width:Math.min(600,image.naturalWidth), style:'max-width:100%;height:auto'});
                    node.addEventListener('load', position, {once:true});
                    select(node);
                    announce(result.size < file.size ? t('Image compressée · ', 'Image compressed · ')+Math.round((1-result.size/file.size)*100)+t(' % de moins','% smaller') : '');
                } catch { announce(t('Impossible d’insérer cette image. Réessayez avec le bouton Image.', 'Could not insert this image. Try the Image button.')); }
            });
        }
        const paste = e => {
            if (!usable() || !body.contains(e.target)) return;
            const file = [...(e.clipboardData?.items || [])].find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
            if (file) { e.preventDefault(); e.stopImmediatePropagation(); void insert(file); }
        };
        // Squire registers its own capture listener on the editable root first.
        // Intercept files on its parent so the native PNG insertion cannot run too.
        container.addEventListener('paste', paste, true);
        const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*';
        picker.addEventListener('change', () => { if (picker.files[0]) void insert(picker.files[0]); picker.value = ''; });
        const originalUpload = actions.targets.imageUpload.cmd;
        actions.targets.imageUpload.cmd = (...args) => usable() ? picker.click() : originalUpload(...args);
        const setData = editor.setData;
        editor.setData = function(...args) { ++epoch; hide(); announce(''); return setData.apply(this,args); };
        editor.on('mode', hide);
        const mutation = new MutationObserver(() => { if (selected) position(); });
        mutation.observe(body, {childList:true,subtree:true});
        const resize = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(position); }); resize.observe(container);
        container.addEventListener('scroll', position, true); window.addEventListener('resize', position);
        queueMicrotask(() => { container.classList.add('pw-image-editor'); container.append(outline,panel,status); });
        ko.utils.domNodeDisposal.addDisposeCallback(container, () => {
            disposed = true; ++epoch; cancelAnimationFrame(resizeFrame); resize.disconnect(); mutation.disconnect();
            window.removeEventListener('resize', position); dialog.removeEventListener('click', click); dialog.removeEventListener('keydown', escape, true);
            container.removeEventListener('paste', paste, true); container.removeEventListener('scroll', position, true);
        });
    });
})();
