#!/usr/bin/env python3
"""Refresh only public runtime fingerprints from the current reviewed source tree."""
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
core = root.parent.parent / 'apps/nextsnapmail'
path = root / 'release.json'
release = json.loads(path.read_text())
release['version'] = re.search(r"VERSION = '([^']+)'", (root / 'plugin/pied-web-ux/index.php').read_text())[1]
release['tested']['nextsnapmail'] = (core / 'VERSION').read_text().strip()
release['files'] = {str(file.relative_to(root)): hashlib.sha256(file.read_bytes()).hexdigest()
                    for folder in ['plugin/pied-web-ux', 'theme/PiedWeb/snappymail']
                    for file in sorted((root / folder).iterdir()) if file.is_file()}
for relative in release['core_patch']['files']:
    release['core_patch']['files'][relative] = hashlib.sha256(
        (core / 'app/snappymail/v' / release['tested']['snappymail'] / relative).read_bytes()).hexdigest()
path.write_text(json.dumps(release, indent=2) + '\n')
print(json.dumps({'version':release['version'],'payload_files':len(release['files'])}))
