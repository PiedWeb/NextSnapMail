#!/usr/bin/env python3
"""Create an installable archive from the explicitly listed release files."""
from pathlib import Path
import hashlib
import json
import tarfile

root = Path(__file__).resolve().parent.parent
release = json.loads((root / 'release.json').read_text())
out = root / 'dist'
out.mkdir(exist_ok=True)
archive = out / ('nextsnapmail-pied-web-' + release['version'] + '.tar.gz')
with tarfile.open(archive, 'w:gz') as target:
    for name, expected in release['files'].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
            raise SystemExit('Release fingerprint mismatch: ' + name)
        target.add(root / name, arcname=name)
    for name in ['README.md', 'LICENSE', 'THIRD_PARTY.md', 'release.json', 'docs/INSTALL.md', 'docs/UPDATES.md', 'tools/check-install.py']:
        target.add(root / name, arcname=name)
print(archive)
