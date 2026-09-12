#!/usr/bin/env python3
"""Create an installable archive with its source, licenses, docs and checks."""
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
    extras = {'README.md', 'LICENSE', 'THIRD_PARTY.md', 'CHANGELOG.md', 'release.json'}
    for directory in ['docs', 'theme-src', 'tools', 'tests', 'patches']:
        extras.update(str(path.relative_to(root)) for path in (root / directory).rglob('*')
                      if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc')
    for name in sorted(extras):
        target.add(root / name, arcname=name)
print(archive)
