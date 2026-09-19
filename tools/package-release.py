#!/usr/bin/env python3
"""Build the two deployable components from one monorepo commit."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
CORE = ROOT / "apps" / "nextsnapmail"
PRODUCT = ROOT / "packages" / "pied-web"
CORE_EXCLUDES = {".git", ".github", ".agents", "legacy-upstream", "tests"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def core_files():
    for path in sorted(CORE.rglob("*")):
        relative = path.relative_to(CORE)
        if path.is_file() and not any(part in CORE_EXCLUDES for part in relative.parts):
            yield path, relative


def main() -> None:
    DIST.mkdir(exist_ok=True)
    core_version = (CORE / "VERSION").read_text(encoding="utf-8").strip()
    product_release = json.loads((PRODUCT / "release.json").read_text(encoding="utf-8"))
    product_version = product_release["version"]

    core_archive = DIST / f"nextsnapmail-{core_version}-piedweb.tar.gz"
    with tarfile.open(core_archive, "w:gz") as archive:
        for path, relative in core_files():
            archive.add(path, arcname=Path("nextsnapmail") / relative)

    result = subprocess.run(
        ["python3", "tools/package.py"], cwd=PRODUCT, check=True, text=True, capture_output=True
    )
    product_source = Path(result.stdout.strip())
    product_archive = DIST / product_source.name
    shutil.copy2(product_source, product_archive)

    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, text=True, capture_output=True
    ).stdout.strip()
    manifest = {
        "monorepo_commit": commit,
        "components": {
            "nextsnapmail": {
                "version": core_version,
                "archive": core_archive.name,
                "sha256": sha256(core_archive),
            },
            "pied-web": {
                "version": product_version,
                "archive": product_archive.name,
                "sha256": sha256(product_archive),
            },
        },
    }
    manifest_path = DIST / "release-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(manifest_path)


if __name__ == "__main__":
    main()
