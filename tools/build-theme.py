from pathlib import Path
from urllib.parse import quote

root = Path(__file__).resolve().parent.parent
theme = root / 'theme-src'
paths = {
    '📥': '<path d="m4 4-3 10v6h22v-6L20 4Z M1 14h6l2 3h6l2-3h6"/>',
    '📧': '<path d="m22 2-7 20-4-9-9-4Z M11 13 22 2"/>',
    '🗎': '<path d="m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5"/>',
    '⚠': '<path d="m12 3 10 18H2Z M12 9v5"/><circle cx="12" cy="17.5" r=".7" fill="currentColor"/>',
    '🗑': '<path d="M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7"/>',
    '🗄': '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8 M10 12h4"/>',
    'folder': '<path d="M3 5h6l2 3h10v12H3Z"/>',
}
icons = []
for kind, path in paths.items():
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'
    selector = '#rl-app .b-folders .b-folders-user a:not(.system)' if kind == 'folder' else '#rl-app .b-folders .b-folders-system a[data-icon="' + kind + '"]'
    icons.append(selector + ' { --mail-folder-icon: url("data:image/svg+xml,' + quote(svg, safe='') + '"); }')
base = (theme / 'nextcloud-v25.css').read_text()
(root / 'theme/PiedWeb/snappymail/style.css').write_text((theme / 'font-face.css').read_text() + base + '\n' + (theme / 'overrides.css').read_text() + '\n' + (theme / 'studio.css').read_text() + '\n' + (theme / 'list-metadata.css').read_text() + '\n' + (theme / 'conversation-thread.css').read_text() + '\n' + (theme / 'app-shell.css').read_text() + '\n' + '\n'.join(icons) + '\n' + (theme / 'comfort-desktop.css').read_text())
print('Built Pied Web theme with seven monochrome SVG folder icons.')
