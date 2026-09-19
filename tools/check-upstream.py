#!/usr/bin/env python3
"""Compare the accepted NextSnapMail commit with its remote branch."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parent.parent
LOCK_PATH = ROOT / "UPSTREAM.lock.json"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def remote_head(repository: str, branch: str) -> str:
    result = subprocess.run(
        ["git", "ls-remote", repository, f"refs/heads/{branch}"],
        check=True,
        text=True,
        capture_output=True,
    )
    fields = result.stdout.strip().split()
    if len(fields) != 2 or not SHA_RE.fullmatch(fields[0]):
        raise SystemExit(f"Unable to resolve {repository} {branch}")
    return fields[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--github-output", type=Path)
    parser.add_argument("--update", action="store_true")
    args = parser.parse_args()

    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    component = lock["components"]["nextsnapmail"]
    current = remote_head(component["repository"], component["branch"])
    locked = component["commit"]
    changed = current != locked

    if args.update:
        component["commit"] = current
        lock["updated"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        LOCK_PATH.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")

    state = {"changed": changed, "locked": locked, "current": current}
    print(json.dumps(state))
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            for key, value in state.items():
                output.write(f"{key}={str(value).lower() if isinstance(value, bool) else value}\n")


if __name__ == "__main__":
    main()
