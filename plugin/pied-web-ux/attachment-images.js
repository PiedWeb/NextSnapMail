/* Compress local, Nextcloud and restored image attachments without losing the original on failure. */
(() => {
    'use strict';
    const {compress, supported, busy, active, t, attachmentFile, uploadOptions} = window.PiedWebUx.images;
    const originals = new WeakMap(), uploaders = new WeakSet();
    addEventListener('rl-view-model.create', ({detail:vm}) => {
        if (vm.viewModelTemplateID !== 'PopupsCompose') return;
        const add = vm.addAttachment;
        vm.addAttachment = function(attachment, view, uploader) {
            if (uploader && !uploaders.has(uploader)) {
                uploaders.add(uploader);
                const upload = uploader.uploadTask;
                uploader.uploadTask = function(id, info) {
                    const item = vm.getAttachmentById(id);
                    if (item && supported(info?.file)) originals.set(item, {file:info.file, uploader, working:false, done:false});
                    return upload.apply(this, arguments);
                };
            }
            return add.apply(this, arguments);
        };
    });
    addEventListener('rl-view-model', ({detail:vm}) => {
        if (vm.viewModelTemplateID !== 'PopupsCompose') return;
        const dom = vm.viewModelDom, list = dom.querySelector('.attachmentList');
        if (!list) return;
        const rows = new WeakSet(), renders = new Set();
        const scan = () => {
            list.querySelectorAll('.attachmentItem').forEach(row => {
                const item = ko.dataFor(row);
                if (rows.has(row) || !item?.complete) return;
                rows.add(row);
                const tools = document.createElement('div'); tools.className = 'pw-attachment-compression';
                const button = document.createElement('button'); button.type = 'button'; button.textContent = t('Compresser', 'Compress');
                const note = document.createElement('span'); note.setAttribute('role','status');
                tools.append(button,note); row.querySelector('.attachmentNameParent').append(tools);
                const render = () => {
                    let entry = originals.get(item);
                    if (!entry && supported({type:item.mimeType()}) && item.tempName()) {
                        entry = {working:false, done:false}; originals.set(item, entry);
                    }
                    tools.hidden = !active() || !entry || !supported({type:item.mimeType()});
                    button.hidden = !!entry?.done;
                    const tooLarge = !entry?.file && item.size() > 20*1024*1024;
                    button.disabled = tooLarge || !item.complete() || !!item.error() || !!entry?.working || vm.sending() || vm.saving();
                    button.title = tooLarge ? t('Compression disponible jusqu’à 20 Mo', 'Compression available up to 20 MB') : t('Réduire le poids de cette image', 'Reduce this image’s file size');
                    button.textContent = entry?.working ? t('Compression…', 'Compressing…') : t('Compresser', 'Compress');
                };
                const subscriptions = [item.complete,item.error,item.type,item.tempName,item.size,vm.sending,vm.saving].map(value => value.subscribe(render));
                renders.add(render);
                ko.utils.domNodeDisposal.addDisposeCallback(row, () => { subscriptions.forEach(s => s.dispose()); renders.delete(render); });
                button.addEventListener('click', async () => {
                    const entry = originals.get(item);
                    if (!entry || entry.working || button.disabled) return;
                    entry.working = true; note.textContent = ''; render();
                    const token = item.tempName(), controller = new AbortController();
                    const stillCurrent = () => vm.attachments().includes(item) && item.tempName() === token;
                    const subscription = vm.attachments.subscribe(() => { if (!stillCurrent()) controller.abort(); });
                    await busy(async () => {
                        // Native send and autosave cannot omit this attachment during replacement.
                        item.complete(false); item.uploading(true);
                        let timer;
                        try {
                            const original = entry.file || await attachmentFile(item);
                            if (!stillCurrent()) return;
                            const file = await compress(original);
                            if (!stillCurrent()) return;
                            if (file === original) {
                                entry.done = true; note.textContent = t('Original conservé : aucun gain', 'Original kept: no size reduction'); return;
                            }
                            const options = entry.uploader?.options || uploadOptions();
                            const form = new FormData(); form.append(options.name, file);
                            timer = setTimeout(() => controller.abort(), 60000);
                            const response = await fetch(options.action, {method:'POST', body:form, credentials:'same-origin', signal:controller.signal});
                            if (!response.ok) throw new Error('upload');
                            const data = (await response.json())?.Result;
                            const next = data?.Attachment;
                            if (data?.code != null || !next?.tempName || !next.name || !Number(next.size)) throw new Error('upload');
                            if (!stillCurrent()) return;
                            item.fileName(next.name); item.size(Number(next.size)); item.type(next.mimeType || file.type); item.tempName(next.tempName);
                            entry.done = true;
                            note.textContent = t('Compressée · ', 'Compressed · ')+Math.round((1-file.size/original.size)*100)+t(' % de moins','% smaller');
                            entry.file = file;
                        } catch {
                            if (stillCurrent()) note.textContent = t('Échec. Original conservé, réessayez.', 'Failed. Original kept, try again.');
                        } finally {
                            clearTimeout(timer); subscription.dispose(); entry.working = false;
                            if (vm.attachments().includes(item)) { item.uploading(false); item.complete(true); render(); }
                        }
                    });
                });
                render();
            });
        };
        const observer = new MutationObserver(scan); observer.observe(list, {childList:true,subtree:true}); scan();
        // The uploader starts after KO has rendered the row. Completion refreshes its controls.
        const theme = new MutationObserver(() => renders.forEach(render => render()));
        theme.observe(document.documentElement, {attributes:true,attributeFilter:['class']});
        ko.utils.domNodeDisposal.addDisposeCallback(dom, () => { observer.disconnect(); theme.disconnect(); });
    });
})();
