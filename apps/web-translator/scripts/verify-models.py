#!/usr/bin/env python3
"""Offline, read-only check against the reviewed lock; no model downloads."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=ROOT / "public",
                        help="Directory containing models/ and models-manifest.json")
    args = parser.parse_args()
    lock = json.loads((ROOT / "models.lock.json").read_text())
    directory = args.directory.resolve()
    manifest = directory / "models-manifest.json"
    if not manifest.is_file() or json.loads(manifest.read_text()) != lock:
        raise ValueError("models-manifest.json missing or differs from models.lock.json")
    count, total = 0, 0
    for model in lock["models"]:
        for artifact in model["files"]:
            file = (directory / "models" / model["id"] / artifact["path"]).resolve()
            if not file.is_relative_to(directory / "models"):
                raise ValueError("Model path outside the models directory")
            if not file.is_file() or file.stat().st_size != artifact["bytes"]:
                raise ValueError(f"Missing artifact or wrong size: {model['id']}/{artifact['path']}")
            with file.open("rb") as handle:
                digest = hashlib.file_digest(handle, "sha256").hexdigest()
            if digest != artifact["sha256"]:
                raise ValueError(f"SHA-256 mismatch: {model['id']}/{artifact['path']}")
            count += 1
            total += artifact["bytes"]
    print(f"Verified {count} artifacts, {total} bytes; SHA-256 and manifest match models.lock.json.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        sys.exit(1)
