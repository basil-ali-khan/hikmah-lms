from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

from apps.core.models import google_login_available


class AccountAdapter(DefaultAccountAdapter):
    """Routes verification and password-reset emails through admin-editable branded templates."""

    def send_mail(self, template_prefix, email, context):
        from apps.notifications.models import Event
        from apps.notifications.services import send_templated_email

        user = context.get("user")
        if "email_confirmation" in template_prefix and context.get("activate_url"):
            send_templated_email(Event.VERIFY_EMAIL, email, user, {"links": {"action": context["activate_url"]}})
            return
        if template_prefix.endswith("password_reset_key") and context.get("password_reset_url"):
            send_templated_email(Event.PASSWORD_RESET, email, user, {"links": {"action": context["password_reset_url"]}})
            return
        super().send_mail(template_prefix, email, context)

    def is_open_for_signup(self, request):
        # Students sign up through the web app (headless API). The server-rendered allauth pages
        # exist only for staff sign-in + 2FA, so self-service sign-up is closed there.
        return bool(request and request.path.startswith("/_allauth/"))


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(self, request, sociallogin):
        return google_login_available()

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        name = " ".join(filter(None, [data.get("first_name"), data.get("last_name")])) or data.get("name") or ""
        if name and not user.full_name:
            user.full_name = name.strip()
        return user
