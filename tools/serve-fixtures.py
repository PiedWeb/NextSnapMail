#!/usr/bin/env python3
"""Serve synthetic browser fixtures and an existing upstream checkout on localhost."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--upstream', type=Path, required=True, help='NextSnapMail source checkout, never its production data directory')
parser.add_argument('--port', type=int, default=8876)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
mounts = {'/app/': args.upstream.resolve() / 'app', '/.local-work/pied-web-ux/': root / 'plugin/pied-web-ux',
          '/.local-work/theme/': root / 'theme/PiedWeb/snappymail', '/.local-work/': root / 'tests/browser'}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Fixtures are rebuilt between runs; a cached theme or plugin file would
        # silently test the previous release.
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def translate_path(self, path):
        path = unquote(urlsplit(path).path)
        for prefix, base in mounts.items():
            if path.startswith(prefix):
                candidate = (base / path[len(prefix):]).resolve()
                if candidate.is_relative_to(base) and candidate.is_file():
                    return str(candidate)
        return str(root / '.not-found')


print(f'Fixtures: http://127.0.0.1:{args.port}/.local-work/images-native-preview.html', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
