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
  sudo timeout 120 apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 update
  sudo timeout 120 apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 install --yes --no-install-recommends ffmpeg
fi
printf 'Checking FFmpeg flite filter (15-second bound)\n'
timeout 15 ffmpeg -hide_banner -filters 2>&1 | grep ' flite '
