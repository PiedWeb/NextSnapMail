/* Temporary operator UI. The existing native hook owns authentication and CSRF. */
(() => {
    'use strict';
    if (new URL(location.href).searchParams.get('pw-runtime-maintenance') !== '1') return;
    const mount = () => {
        if (document.getElementById('pw-runtime-maintenance')) return;
        const panel = document.createElement('aside');panel.id = 'pw-runtime-maintenance';
        panel.setAttribute('aria-label','Maintenance Mail');
        panel.style.cssText = 'position:fixed;z-index:2147483647;inset:12px 12px auto auto;max-width:calc(100vw - 24px);padding:12px;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:6px;display:grid;gap:8px';
        const check = document.createElement('button'),activate = document.createElement('button'),status = document.createElement('output');
        check.type = activate.type = 'button';
        check.textContent = 'Vérifier la version Mail';activate.textContent = 'Activer les fichiers installés';
        status.setAttribute('role','status');status.textContent = 'Contrôle administrateur uniquement.';
        const run = invalidate => {
            check.disabled = activate.disabled = true;status.textContent = 'Contrôle en cours…';
            window.rl.pluginRemoteRequest((error,data) => {
                check.disabled = activate.disabled = false;
                if (error || !data?.Result?.version) {status.textContent = 'Échec du contrôle administrateur.';return;}
                const result = data.Result;
                panel.dataset.version = result.version;
                status.textContent = 'Version web : ' + result.version + (invalidate
                    ? '. Fichiers invalidés : ' + Object.values(result.files || {}).filter(file => file.invalidated).length + '. Relancer la vérification.' : '.');
            },'PiedWebRuntimeCheck',invalidate ? {invalidate:'1'} : {},15000);
        };
        check.addEventListener('click',() => run(false));activate.addEventListener('click',() => run(true));
        panel.append(check,activate,status);document.body.append(panel);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
