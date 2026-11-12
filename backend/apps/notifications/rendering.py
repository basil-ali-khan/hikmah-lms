"""Sandboxed {{ variable }} substitution for admin-editable email templates (no code, no filters)."""

import re

from django.utils.html import escape

VAR_RE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}")


def find_variables(text):
    return set(VAR_RE.findall(text or ""))


def _lookup(context, path):
    value = context
    for part in path.split("."):
        if isinstance(value, dict):
            value = value.get(part, "")
        else:
            return ""
    return "" if value is None else value


def render_text(text, context, html_escape=False):
    def repl(match):
        value = str(_lookup(context, match.group(1)))
        return escape(value) if html_escape else value

    return VAR_RE.sub(repl, text or "")
