#!/usr/bin/env bash
# Run the backend test suite. On macOS, points WeasyPrint at Homebrew's libraries.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname)" == "Darwin" && -d /opt/homebrew/lib ]]; then
  export DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/lib${DYLD_FALLBACK_LIBRARY_PATH:+:$DYLD_FALLBACK_LIBRARY_PATH}"
fi
exec uv run pytest "$@"
