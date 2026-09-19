#!/usr/bin/env python3
"""Read-only comparison of installed Calendar workspace files against its manifest."""
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
expected = json.loads((root / 'release.json').read_text())['files']
script = '''import pathlib,hashlib,json
r=pathlib.Path('/home/robindfr/nextcloud/apps/piedwebcalendar')
print(json.dumps({str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(r.rglob('*')) if p.is_file()}))
'''
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
                         '-p', '5022', 'robindfr@node212-eu.n0c.com', 'python3', '-'],
                        input=script, text=True, capture_output=True, check=True)
actual = json.loads(result.stdout)
missing = sorted(expected.keys() - actual.keys())
extra = sorted(actual.keys() - expected.keys())
changed = sorted(k for k in expected.keys() & actual.keys() if expected[k] != actual[k])
ok = not (missing or extra or changed)
print(json.dumps(dict(ok=ok, files=len(expected), missing=missing, extra=extra, changed=changed), indent=2))
sys.exit(not ok)
