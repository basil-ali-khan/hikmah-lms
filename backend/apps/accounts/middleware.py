import time

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.urls import reverse


def has_totp(user):
    from allauth.mfa.models import Authenticator

    return Authenticator.objects.filter(user=user, type=Authenticator.Type.TOTP).exists()


def staff_panel_csp():
    """The admin UI (Unfold) uses Alpine.js, which evaluates expressions — it needs 'unsafe-eval'.
    Only the staff panel gets this relaxation; every other response keeps the strict SECURE_CSP."""
    from django.utils.csp import CSP

    policy = {k: list(v) for k, v in settings.SECURE_CSP.items()}
    policy["script-src"] = [*policy.get("script-src", []), CSP.UNSAFE_EVAL]
    return policy


class StaffSecurityMiddleware:
    """For the staff panel: idle timeout, mandatory TOTP 2FA (when STAFF_2FA_REQUIRED), admin-only CSP."""

    SESSION_KEY = "staff_last_activity"

    def __init__(self, get_response):
        self.get_response = get_response
        self.admin_prefix = f"/{settings.ADMIN_URL_PATH}/"
        self.admin_csp = staff_panel_csp()

    def __call__(self, request):
        response = self._handle(request)
        if request.path.startswith(self.admin_prefix):
            response._csp_config = self.admin_csp
        return response

    def _handle(self, request):
        user = getattr(request, "user", None)
        if request.path.startswith(self.admin_prefix) and user is not None and user.is_authenticated and user.is_staff:
            now = time.time()
            last = request.session.get(self.SESSION_KEY)
            timeout = settings.STAFF_SESSION_TIMEOUT_MINUTES * 60
            if last and now - last > timeout:
                logout(request)
                messages.info(request, "You were signed out after a period of inactivity.")
                return redirect(f"{reverse('account_login')}?next={request.path}")
            request.session[self.SESSION_KEY] = now
            if settings.STAFF_2FA_REQUIRED and not has_totp(user):
                messages.warning(request, "Two-factor authentication is required for staff accounts. Please set it up.")
                return redirect(reverse("mfa_activate_totp"))
        return self.get_response(request)
