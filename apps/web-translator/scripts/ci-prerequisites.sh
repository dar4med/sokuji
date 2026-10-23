#!/usr/bin/env bash
# Standard free Ubuntu runner only. No host changes, credentials or extra repos.
set -euo pipefail
node --version
npm --version
python3 --version
printf 'Checking preinstalled Chrome (15-second bound)\n'
timeout 15 "$CHROMIUM_PATH" --version
if ! command -v ffmpeg > /dev/null; then
  printf 'Installing existing fictional-audio prerequisite from system repositories\n'
  # Only the disposable Ubuntu runner: avoid the observed stalled Azure mirror.
  # Keep Ubuntu suites, signing keys and signature verification unchanged.
  sudo python3 - <<'PY'
from pathlib import Path
for file in [Path('/etc/apt/sources.list'), Path('/etc/apt/sources.list.d/ubuntu.sources')]:
    if file.is_file():
        original = file.read_text()
        updated = original.replace('http://azure.archive.ubuntu.com/ubuntu/', 'https://archive.ubuntu.com/ubuntu/').replace('https://azure.archive.ubuntu.com/ubuntu/', 'https://archive.ubuntu.com/ubuntu/')
        if updated != original:
            file.write_text(updated)
            print('Using the official signed Ubuntu archive in', file)
PY
  sudo timeout 120 apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 update
  sudo timeout 300 apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 install --yes --no-install-recommends ffmpeg
fi
printf 'Checking FFmpeg flite filter (15-second bound)\n'
timeout 15 ffmpeg -hide_banner -filters 2>&1 | grep ' flite '
