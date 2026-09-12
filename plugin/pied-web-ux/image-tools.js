/* Browser-only compression, shared by pasted images and newly added attachments. */
(() => {
    'use strict';
    const api = window.PiedWebUx;
    const t = (fr, en) => (document.documentElement.lang || 'fr').startsWith('fr') ? fr : en;
    const active = () => document.documentElement.classList.contains('pw-theme');
    const pending = ko.observable(0);
    const supported = file => /^image\/(jpeg|png|webp)$/.test(file?.type);
    async function compress(file) {
        if (!supported(file)) return file;
        // Canvas would flatten animated PNG/WebP. Keep their original bytes.
        if (file.type !== 'image/jpeg') {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const view = new DataView(bytes.buffer);
            if (file.type === 'image/png') {
                for (let offset = 8; offset + 12 <= bytes.length;) {
                    if (view.getUint32(offset + 4) === 0x6163544c) return file; // acTL
                    offset += view.getUint32(offset) + 12;
                }
            } else {
                for (let offset = 12; offset + 8 <= bytes.length;) {
                    if (view.getUint32(offset) === 0x414e494d) return file; // ANIM
                    const size = view.getUint32(offset + 4, true);
                    offset += 8 + size + (size % 2);
                }
            }
        }
        const result = await api.imageCompression(file, {maxSizeMB:1.8, maxWidthOrHeight:1980,
            initialQuality:0.85, preserveExif:false, fileType:file.type, useWebWorker:false});
        return result.size < file.size ? new File([result], file.name, {type:result.type, lastModified:file.lastModified}) : file;
    }
    const busy = async work => {
        pending(pending() + 1);
        try { return await work(); } finally { pending(pending() - 1); }
    };
    const maxBytes = 20 * 1024 * 1024;
    const fromData = (data, name) => {
        const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(data);
        if (!match || match[2].length > maxBytes * 1.4) throw new Error('image');
        const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
        if (bytes.length > maxBytes) throw new Error('size');
        return new File([bytes], name, {type:match[1]});
    };
    async function nextcloudFile(file) {
        const cfg = rl.settings.get('Nextcloud'), oc = parent.OC;
        if (!cfg?.WebDAV || !cfg.UID || !oc?.requestToken || !file?.name || file.size > maxBytes) throw new Error('file');
        const parts = file.name.split('/').filter(Boolean);
        if (!parts.length || parts.some(part => part === '.' || part === '..')) throw new Error('path');
        const url = new URL(cfg.WebDAV.replace(/\/$/,'') + '/files/' + encodeURIComponent(cfg.UID)
            + '/' + parts.map(encodeURIComponent).join('/'), location.href);
        if (url.origin !== location.origin) throw new Error('origin');
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
        try {
            const response = await fetch(url.href, {method:'GET', mode:'same-origin', credentials:'same-origin',
                cache:'no-store', redirect:'error', headers:{requesttoken:oc.requestToken}, signal:controller.signal});
            if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) throw new Error('download');
            const reader = response.body.getReader(), chunks = []; let size = 0;
            for (;;) {
                const {done, value} = await reader.read(); if (done) break;
                size += value.length;
                if (size > maxBytes) { await reader.cancel(); throw new Error('size'); }
                chunks.push(value);
            }
            const type = response.headers.get('content-type')?.split(';')[0].toLowerCase();
            if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) throw new Error('type');
            return new File(chunks, parts.at(-1), {type});
        } finally { clearTimeout(timer); }
    }
    const attachmentFile = item => new Promise((resolve, reject) => {
        rl.pluginRemoteRequest((error, response) => {
            try {
                if (error || !response?.Result?.data) throw new Error('download');
                resolve(fromData(response.Result.data, item.fileName()));
            } catch (error) { reject(error); }
        }, 'PiedWebAttachmentImage', {tempName:item.tempName()}, 60000);
    });
    // SnappyMail 2.38.2 serverRequest('Upload'), also used by the native Jua uploader.
    const uploadOptions = () => ({name:'uploader', action:location.pathname.replace(/\/+$/, '') + '/?/Upload/&q[]=/0/'});
    api.images = {compress, supported, busy, pending, active, t, fromData, nextcloudFile, attachmentFile, uploadOptions};
    addEventListener('rl-view-model.create', ({detail:vm}) => {
        if (vm.viewModelTemplateID !== 'PopupsCompose') return;
        // Both keyboard commands and autosave use these same entry points.
        // Do not serialize a message while an inline image or replacement is incomplete.
        for (const name of ['sendCommand', 'saveCommand']) {
            const original = vm[name];
            vm[name] = function(...args) { if (!pending()) return original.apply(vm, args); };
            vm[name].canExecute = ko.computed(() => !pending() && original.canExecute(), {pure:true});
        }
    });
})();
