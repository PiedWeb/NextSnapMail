/* Document the shared list contract without changing native editor shortcuts. */
(() => {
    'use strict';
    const french = () => (document.documentElement.lang || 'fr').startsWith('fr');
    const rows = [
        ['↑ / ↓','Parcourir la liste active','Navigate the active list'],
        ['Entrée / Enter','Ouvrir le message ou activer le contrôle focalisé','Open the message or activate the focused control'],
        ['Espace / Space','Cocher ou décocher la ligne focalisée','Toggle the focused row selection'],
        ['Shift + ↑ / ↓','Étendre la sélection dans la liste','Extend the list selection'],
        ['Ctrl / ⌘ + A','Sélectionner cette page, pas toutes les pages','Select this page, not every page'],
        ['Delete','Mettre les messages sélectionnés à la corbeille','Move selected messages to Trash'],
        ['Q / U','Marquer lu / non lu','Mark read / unread'],
        ['Esc','Fermer le menu, terminer la sélection ou revenir à la liste','Close the menu, clear selection or return to the list'],
        ['Alt + ↑ / ↓','Réordonner un dossier dans le rail compact','Reorder a folder in the compact rail']
    ];
    addEventListener('rl-view-model',({detail:vm}) => {
        if (vm.viewModelTemplateID !== 'PopupsKeyboardShortcutsHelp' || vm.viewModelDom?.querySelector('.pw-keyboard-help')) return;
        const body = vm.viewModelDom?.querySelector('.modal-body'); if (!body) return;
        const section = document.createElement('section'); section.className = 'pw-keyboard-help';
        const title = document.createElement('h4'); title.textContent = french() ? 'Listes et Flux global' : 'Lists and All accounts';
        const table = document.createElement('table'); table.className = 'table';
        for (const [keys,fr,en] of rows) {
            const row = document.createElement('tr'), key = document.createElement('td'), description = document.createElement('td');
            key.textContent = keys; description.textContent = french() ? fr : en; row.append(key,description); table.append(row);
        }
        const note = document.createElement('p'); note.textContent = french()
            ? 'Dans un champ de saisie, les raccourcis d’édition restent prioritaires. Les menus gardent leurs flèches et Échap. Toutes les pages se sélectionnent par l’action explicitement nommée.'
            : 'Text fields keep their editing shortcuts. Menus retain arrows and Escape. Select every page using the explicitly labelled action.';
        section.append(title,table,note); body.append(section);
    });
})();
