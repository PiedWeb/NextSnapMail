#!/usr/bin/env python3
"""Validate the published payload and rebuild the stylesheet reproducibly."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
release = json.loads((root / 'release.json').read_text())
inventory = {str(path.relative_to(root)) for directory in ['plugin/pied-web-ux', 'theme/PiedWeb/snappymail']
             for path in (root / directory).iterdir() if path.is_file()}
if inventory != set(release['files']):
    raise SystemExit('Release manifest does not match the complete runtime inventory')
match = re.search(r"VERSION = '([^']+)'", (root / 'plugin/pied-web-ux/index.php').read_text())
if not match or match[1] != release['version']:
    raise SystemExit('Plugin version and release manifest differ')
for name, expected in release['files'].items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
        raise SystemExit('Release fingerprint mismatch: ' + name)
subprocess.run([sys.executable, str(root / 'tools/build-theme.py')], check=True)
name = 'theme/PiedWeb/snappymail/style.css'
if hashlib.sha256((root / name).read_bytes()).hexdigest() != release['files'][name]:
    raise SystemExit('Theme build is not reproducible')
for path in sorted((root / 'plugin/pied-web-ux').glob('*.js')):
    subprocess.run(['node', '--check', str(path)], check=True)
for path in sorted((root / 'plugin/pied-web-ux').glob('*.php')):
    subprocess.run(['php', '-l', str(path)], check=True)
print(json.dumps({'payload_files': len(release['files']), 'theme_reproducible': True, 'syntax': 'passed'}))
