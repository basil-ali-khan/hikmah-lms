from django import forms
from django.utils import timezone

from apps.core.services import client_ip
from apps.core.turnstile import verify_turnstile


class SignupForm(forms.Form):
    """Extra sign-up fields (allauth calls `signup`). Used by both the API and server-rendered flows."""

    full_name = forms.CharField(max_length=150, required=True)
    accept_terms = forms.BooleanField(
        required=True, error_messages={"required": "Please accept the Terms and Privacy policy."}
    )
    turnstile_token = forms.CharField(required=False)

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop("request", None)
        super().__init__(*args, **kwargs)

    def clean_full_name(self):
        name = " ".join(self.cleaned_data["full_name"].split())
        if len(name) < 2:
            raise forms.ValidationError("Please enter your full name.")
        return name

    def clean(self):
        cleaned = super().clean()
        request = getattr(self, "request", None)
        if not verify_turnstile(cleaned.get("turnstile_token"), client_ip(request)):
            raise forms.ValidationError("Bot check failed. Please try again.")
        return cleaned

    def signup(self, request, user):
        from .services import get_profile

        user.full_name = self.cleaned_data["full_name"]
        user.save(update_fields=["full_name"])
        profile = get_profile(user)
        now = timezone.now()
        profile.terms_accepted_at = now
        profile.privacy_consent_at = now
        profile.save(update_fields=["terms_accepted_at", "privacy_consent_at", "updated_at"])
