#!/usr/bin/env python3
"""Read-only file/version check. Does not bootstrap Nextcloud or inspect mail accounts."""
import argparse
import configparser
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET


def inspect(root, data, app, release):
    checks = []

    def record(name, ok, detail):
        checks.append({'check': name, 'ok': bool(ok), 'detail': detail})

    nc_version = root / 'version.php'
    match = re.search(r"OC_VersionString\s*=\s*['\"]([^'\"]+)", nc_version.read_text() if nc_version.is_file() else '')
    record('Nextcloud version', bool(match) and match[1] == release['tested']['nextcloud'], match[1] if match else 'missing')
    xml = app / 'appinfo/info.xml'
    version = ET.parse(xml).findtext('version') if xml.is_file() else 'missing'
    record('NextSnapMail version', version == release['tested']['nextsnapmail'], version)
    entry = app / 'app/index.php'
    match = re.search(r"define\('APP_VERSION',\s*'([^']+)'\)", entry.read_text() if entry.is_file() else '')
    engine = match[1] if match else 'missing'
    record('SnappyMail version', engine == release['tested']['snappymail'], engine)
    private = data / 'appdata_nextsnapmail/_data_/_default_'
    for relative, expected in release['files'].items():
        # The hosting account may still provide Python 3.8 (no str.removeprefix).
        path = private / 'plugins' / relative[len('plugin/'):] if relative.startswith('plugin/') else root / 'themes' / relative[len('theme/'):]
        status = 'missing' if not path.is_file() else ('match' if hashlib.sha256(path.read_bytes()).hexdigest() == expected else 'modified')
        record(relative, status == 'match', status)
    config = configparser.ConfigParser(interpolation=None, strict=False)
    config.read(private / 'configs/application.ini')
    enabled = config.get('plugins', 'enabled_list', fallback='').strip('"\'')
    active = config.get('plugins', 'enable', fallback='').strip('"\'').lower()
    record('Plugin enabled', 'pied-web-ux' in [part.strip() for part in enabled.split(',')] and active in ['1', 'on', 'true', 'yes'], 'Only plugin activation was read; no configuration values are printed.')
    record('Core unread patch', engine == release['tested']['snappymail'] and all(
        (app / 'app/snappymail/v' / engine / path).is_file()
        and hashlib.sha256((app / 'app/snappymail/v' / engine / path).read_bytes()).hexdigest() == expected
        for path, expected in release['core_patch']['files'].items()
    ), 'Optional patch fingerprint. A mismatch requires checking upstream PR #41, not blindly reapplying.')
    return {'release': release['version'], 'checks': checks, 'files_and_versions_match': all(c['ok'] for c in checks),
            'limitation': 'File checks do not prove UI/API compatibility. Run browser checks after upgrading.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--nextcloud', required=True, type=Path)
    parser.add_argument('--data-dir', type=Path, help='Defaults to NEXTCLOUD/data; specify an external data directory explicitly.')
    parser.add_argument('--app-dir', type=Path, help='Defaults to NEXTCLOUD/apps/nextsnapmail.')
    args = parser.parse_args()
    release = json.loads((Path(__file__).resolve().parent.parent / 'release.json').read_text())
    try:
        result = inspect(args.nextcloud, args.data_dir or args.nextcloud / 'data', args.app_dir or args.nextcloud / 'apps/nextsnapmail', release)
    except (OSError, ET.ParseError, configparser.Error):
        print('Cannot read installation metadata. Check paths and permissions.', file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0 if result['files_and_versions_match'] else 2


if __name__ == '__main__':
    sys.exit(main())
