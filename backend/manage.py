#!/usr/bin/env python
import os
import sys

_BREW_LIB = "/opt/homebrew/lib"


def _macos_weasyprint_libs():
    """macOS dev only: WeasyPrint needs Homebrew's pango on the dyld path, which dyld reads at
    process start, so re-exec once with DYLD_FALLBACK_LIBRARY_PATH set. No effect elsewhere."""
    if (
        sys.platform == "darwin"
        and os.path.isdir(_BREW_LIB)
        and _BREW_LIB not in os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
        and not os.environ.get("HIKMAH_NO_REEXEC")
    ):
        env = dict(os.environ, HIKMAH_NO_REEXEC="1")
        env["DYLD_FALLBACK_LIBRARY_PATH"] = ":".join(filter(None, [_BREW_LIB, os.environ.get("DYLD_FALLBACK_LIBRARY_PATH")]))
        os.execve(sys.executable, [sys.executable, *sys.argv], env)


if __name__ == "__main__":
    _macos_weasyprint_libs()
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)
