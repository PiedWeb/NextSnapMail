/* Remember the compact folder rail between page loads.
   The native observable behind `.toggleLeft` is also the mobile folder drawer, and the
   application opens the panel by itself while a message is dragged over the folders, so
   only an explicit desktop toggle is stored and restored. */
(() => {
    'use strict';
    const KEY = 'pw-left-panel', html = document.documentElement;
    const mobile = () => html.classList.contains('rl-mobile');
    const collapsed = () => html.classList.contains('rl-left-panel-disabled');
    const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
    const write = value => { try { localStorage.setItem(KEY, value); } catch { /* private mode or full quota */ } };
    let folderView, wasMobile = mobile();
    const restore = () => {
        const stored = read();
        if (!stored || mobile() || typeof folderView?.toggleLeftPanel !== 'function') return;
        if (('1' === stored) !== collapsed()) folderView.toggleLeftPanel();
    };
    addEventListener('rl-view-model', ({detail: vm}) => {
        if ('MailFolderList' !== vm.viewModelTemplateID || folderView) return;
        folderView = vm;
        // The pane is still hidden while it is being built, so the restored width is the first painted one.
        restore();
    });
    addEventListener('click', event => {
        // The native handler runs on the way up, so the class already carries the new state.
        if (event.target instanceof Element && event.target.closest('.toggleLeft') && !mobile()) {
            write(collapsed() ? '1' : '0');
        }
    });
    // Crossing the mobile breakpoint resets the panel natively; put the desktop choice back.
    new MutationObserver(() => {
        const now = mobile();
        if (now !== wasMobile) { wasMobile = now; now || restore(); }
    }).observe(html, {attributes: true, attributeFilter: ['class']});
})();
