/* Native Nextcloud picker + composer hook. Only popup lifecycle and network are fixtures. */
export async function setupNextcloudImages() {
    window.ncFiles = new Map(); window.ncTempFiles = new Map(); window.ncRequests = [];
    window.OC = {webroot:'', requestToken:'fixture-token', config:{modRewriteWorking:true}};
    const config = {WebDAV:'/remote.php/dav', UID:'fixture-user'};
    const get = rl.settings.get;
    rl.settings.get = key => key === 'Nextcloud' ? config : get(key);
    window.ncConfig = config;
    const fetchOriginal = window.fetch;
    const popupMarkup = await (await fetch('/app/bundled-plugins/nextcloud/templates/PopupsNextcloudFiles.html')).text();
    rl.pluginPopupView = class {
        constructor(name) { this.name = name; }
        addObservables(values) { for (const [key,value] of Object.entries(values)) this[key] = ko.observable(value); }
        static showModal(args) {
            const vm = new this(), dialog = document.createElement('dialog');
            dialog.id = 'V-PopupsNextcloudFiles'; dialog.innerHTML = popupMarkup;
            dialog.className = 'animate';
            dialog.style.cssText = 'width:min(540px,90vw);padding:20px;max-height:80vh;inset:0;margin:auto;height:fit-content';
            dialog.querySelector('h3').textContent = 'Fichiers Nextcloud'; dialog.querySelectorAll('h3')[1].remove();
            dialog.querySelector('[name=select]').textContent = 'Joindre';
            document.body.append(dialog); vm.dom = dialog; vm.onBuild(dialog);
            dialog.querySelector('.close').onclick = event => { event.preventDefault(); vm.close(); };
            dialog.querySelector('[name=select]').onclick = () => vm.attach();
            dialog.addEventListener('cancel', event => { event.preventDefault(); vm.close(); });
            vm.beforeShow(...args); dialog.showModal(); window.ncPopup = vm;
        }
        close() { this.dom.close(); this.dom.remove(); this.onHide(); }
    };
    const style = document.createElement('link'); style.rel = 'stylesheet';
    style.href = '/app/bundled-plugins/nextcloud/style.css'; document.head.append(style);
    const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;');
    window.fetch = async function(url, options = {}) {
        if (String(url).includes('/remote.php/dav/files/')) {
            ncRequests.push({url:String(url), options});
            if (window.ncHold) await new Promise(resolve => window.ncRelease = resolve);
            if (window.ncFailure) return new Response('', {status:403});
            if (options.method === 'PROPFIND') {
                const rows = [...ncFiles].map(([name,file]) => `<d:response><d:href>/remote.php/dav/files/fixture-user${escape(name.split('/').map(encodeURIComponent).join('/'))}</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>${file.size}</d:getcontentlength></d:prop></d:propstat></d:response>`);
                return new Response(`<d:multistatus xmlns:d="DAV:">${rows.join('')}</d:multistatus>`);
            }
            const path = decodeURIComponent(new URL(url, location.href).pathname.split('/files/fixture-user')[1]);
            const file = ncFiles.get(path);
            return file ? new Response(file, {headers:{'content-type':file.type,'content-length':String(file.size)}}) : new Response('',{status:404});
        }
        if (String(url).endsWith('/?/Upload/&q[]=/0/')) return fetchOriginal('/fixture-upload', options);
        return fetchOriginal.apply(this, arguments);
    };
    rl.pluginRemoteRequest = (callback, action, params) => {
        const read = file => new Promise(resolve => { const reader = new FileReader(); reader.onload=()=>resolve(reader.result); reader.readAsDataURL(file); });
        setTimeout(async () => {
            if (action === 'NextcloudAttachFile') {
                const file = ncFiles.get(params.file), token = 'nextcloud-file-' + (ncTempFiles.size+1);
                if (!file) return callback(1,{});
                ncTempFiles.set(token,file);
                callback(0,{Result:{success:true,fileName:file.name,size:file.size,mimeType:file.type,tempName:token}});
            } else if (action === 'PiedWebAttachmentImage') {
                const file = ncTempFiles.get(params.tempName);
                callback(0,{Result:file && !window.ncReadFailure ? {data:await read(file)} : {error:'image'}});
            } else callback(1,{});
        },20);
    };
    const template = document.createElement('template'); template.id = 'PopupsCompose';
    template.innerHTML = await (await fetch('/app/snappymail/v/2.38.2/app/templates/Views/User/PopupsCompose.html')).text();
    document.body.append(template);
    const script = url => new Promise((resolve,reject) => { const el = document.createElement('script'); el.src=url; el.onload=resolve; el.onerror=reject; document.head.append(el); });
    await script('/app/bundled-plugins/nextcloud/js/webdav.js');
    await script('/app/bundled-plugins/nextcloud/js/composer.js');
}
