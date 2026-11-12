import hashlib
import logging

import requests
from django.conf import settings
from django.core.exceptions import ValidationError

log = logging.getLogger(__name__)


class BreachedPasswordValidator:
    """Rejects passwords found in known breaches (HaveIBeenPwned k-anonymity API).

    Only the first 5 chars of the SHA-1 hash leave the server. Fails open on network errors
    so an outage never blocks sign-ups. Toggle with PWNED_PASSWORD_CHECK.
    """

    url = "https://api.pwnedpasswords.com/range/{prefix}"

    def validate(self, password, user=None):
        if not getattr(settings, "PWNED_PASSWORD_CHECK", False):
            return
        digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()  # noqa: S324 (protocol requires SHA-1)
        prefix, suffix = digest[:5], digest[5:]
        try:
            resp = requests.get(self.url.format(prefix=prefix), timeout=2, headers={"Add-Padding": "true"})
            resp.raise_for_status()
        except requests.RequestException:
            log.warning("Breached-password check unavailable; skipping")
            return
        for line in resp.text.splitlines():
            candidate, _, count = line.partition(":")
            if candidate == suffix and int(count or 0) > 0:
                raise ValidationError(
                    "This password has appeared in a data breach. Please choose a different one.",
                    code="password_breached",
                )

    def get_help_text(self):
        return "Your password must not appear in known data breaches."
