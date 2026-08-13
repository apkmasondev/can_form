#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe is required" >&2; exit 1; }
node scripts/process-videos.mjs
