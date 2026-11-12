import requests
from django.conf import settings

from .models import FeatureFlag

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def turnstile_enabled():
    return FeatureFlag.is_enabled(FeatureFlag.TURNSTILE) and bool(settings.TURNSTILE_SECRET_KEY)


def verify_turnstile(token, remote_ip=None):
    """True when Turnstile is off, or the token checks out."""
    if not turnstile_enabled():
        return True
    if not token:
        return False
    try:
        resp = requests.post(
            VERIFY_URL,
            data={"secret": settings.TURNSTILE_SECRET_KEY, "response": token, "remoteip": remote_ip or ""},
            timeout=5,
        )
        return bool(resp.json().get("success"))
    except (requests.RequestException, ValueError):
        return False
