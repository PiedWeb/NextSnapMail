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
    api.images = {compress, supported, busy, pending, active, t};
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
