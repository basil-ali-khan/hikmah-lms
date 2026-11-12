"""Site-wide configuration that admins edit in the staff panel (nothing here is hardcoded in code)."""

import uuid

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.storage import storages
from django.db import models

SITE_SETTINGS_CACHE_KEY = "core:site_settings"


def public_storage():
    return storages["public"]


FONT_CHOICES = [
    ("Raleway", "Raleway"),
    ("Roboto", "Roboto"),
    ("Inter", "Inter"),
    ("Lato", "Lato"),
    ("Open Sans", "Open Sans"),
    ("Poppins", "Poppins"),
    ("Merriweather", "Merriweather"),
    ("Noto Sans", "Noto Sans"),
]

HEX_HELP = "Hex colour, e.g. #003399"


def validate_hex(value):
    import re

    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value or ""):
        raise ValidationError("Use a 6-digit hex colour like #003399.")


def validate_offsets(value):
    if not isinstance(value, list) or not all(isinstance(v, int) and v > 0 for v in value):
        raise ValidationError("Enter a list of positive minute offsets, e.g. [1440, 60].")


class SiteSettings(models.Model):
    """Singleton (pk=1). Use SiteSettings.load()."""

    institute_name = models.CharField(max_length=120, default="Hikmah Online")
    tagline = models.CharField(max_length=200, default="Authentic Islamic learning, live and on demand")
    description = models.TextField(
        blank=True,
        default="Live classes, recorded lessons and certificates from Hikmah Institute — learn from anywhere.",
    )
    logo = models.ImageField(upload_to="branding/", storage=public_storage, blank=True)
    favicon = models.ImageField(upload_to="branding/", storage=public_storage, blank=True)
    color_primary = models.CharField(max_length=7, default="#003399", validators=[validate_hex], help_text=HEX_HELP)
    color_accent = models.CharField(max_length=7, default="#FFDF00", validators=[validate_hex], help_text=HEX_HELP)
    color_heading = models.CharField(max_length=7, default="#34495E", validators=[validate_hex], help_text=HEX_HELP)
    color_text = models.CharField(max_length=7, default="#1E1F25", validators=[validate_hex], help_text=HEX_HELP)
    color_surface = models.CharField(max_length=7, default="#F2F2F2", validators=[validate_hex], help_text=HEX_HELP)
    font_heading = models.CharField(max_length=40, choices=FONT_CHOICES, default="Raleway")
    font_body = models.CharField(max_length=40, choices=FONT_CHOICES, default="Roboto")
    support_email = models.EmailField(blank=True, default="support@hikmah.test")
    support_whatsapp = models.CharField(max_length=40, blank=True)
    social_links = models.JSONField(default=dict, blank=True, help_text='e.g. {"youtube": "https://..."}')
    institute_timezone = models.CharField(max_length=64, default="Asia/Karachi")
    default_refund_policy = models.TextField(
        blank=True, default="Fees are refundable within 7 days of approval if you have not attended any class."
    )
    payment_review_eta = models.CharField(max_length=60, default="1 working day")
    join_window_minutes = models.PositiveIntegerField(default=15, help_text="Join button opens this many minutes early.")
    live_reminder_offsets = models.JSONField(
        default=list, validators=[validate_offsets], help_text="Minutes before a live class, e.g. [1440, 60]."
    )
    deadline_reminder_offsets = models.JSONField(
        default=list, validators=[validate_offsets], help_text="Minutes before a quiz/assignment deadline, e.g. [1440]."
    )
    deletion_grace_days = models.PositiveIntegerField(default=14)
    at_risk_inactive_days = models.PositiveIntegerField(default=10)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Site settings"
        verbose_name_plural = "Site settings"

    def __str__(self):
        return "Site settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        if not self.live_reminder_offsets:
            self.live_reminder_offsets = [1440, 60]
        if not self.deadline_reminder_offsets:
            self.deadline_reminder_offsets = [1440]
        super().save(*args, **kwargs)
        cache.delete(SITE_SETTINGS_CACHE_KEY)

    def delete(self, *args, **kwargs):
        raise ValidationError("Site settings cannot be deleted.")

    @classmethod
    def load(cls):
        obj = cache.get(SITE_SETTINGS_CACHE_KEY)
        if obj is None:
            obj, _ = cls.objects.get_or_create(pk=1)
            cache.set(SITE_SETTINGS_CACHE_KEY, obj, 60)
        return obj


class FeatureFlag(models.Model):
    GOOGLE_LOGIN = "google_login"
    TURNSTILE = "turnstile"
    PWA_INSTALL_PROMPT = "pwa_install_prompt"
    FREE_NEEDS_APPROVAL = "free_courses_need_approval_default"
    AUTO_PUBLISH_RECORDINGS = "auto_publish_recordings_default"
    SELF_SERVICE_DELETION = "self_service_account_deletion"
    ANALYTICS = "analytics"

    DEFAULTS = {
        GOOGLE_LOGIN: (False, "Google sign-in. Also needs GOOGLE_OAUTH_CLIENT_ID/SECRET in .env."),
        TURNSTILE: (False, "Bot protection on sign-up and password reset. Needs TURNSTILE keys in .env."),
        PWA_INSTALL_PROMPT: (True, "Show the 'add to home screen' prompt on phones."),
        FREE_NEEDS_APPROVAL: (False, "New free courses default to approval-based enrollment."),
        AUTO_PUBLISH_RECORDINGS: (False, "New courses default to publishing recordings automatically."),
        SELF_SERVICE_DELETION: (True, "Students can request account deletion themselves."),
        ANALYTICS: (False, "Privacy-friendly analytics script on the web app."),
    }

    key = models.SlugField(max_length=64, unique=True)
    enabled = models.BooleanField(default=False)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return self.key

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        cache.delete(f"flag:{self.key}")

    @classmethod
    def is_enabled(cls, key):
        cached = cache.get(f"flag:{key}")
        if cached is not None:
            return cached
        flag = cls.objects.filter(key=key).first()
        value = flag.enabled if flag else cls.DEFAULTS.get(key, (False, ""))[0]
        cache.set(f"flag:{key}", value, 60)
        return value


def google_login_available():
    return FeatureFlag.is_enabled(FeatureFlag.GOOGLE_LOGIN) and bool(
        settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET
    )


class Page(models.Model):
    DRAFT, PUBLISHED = "draft", "published"
    slug = models.SlugField(max_length=80, unique=True)
    title = models.CharField(max_length=150)
    body = models.TextField(help_text="Markdown")
    show_in_footer = models.BooleanField(default=True)
    status = models.CharField(max_length=10, choices=[(DRAFT, "Draft"), (PUBLISHED, "Published")], default=DRAFT)
    order = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "title"]

    def __str__(self):
        return self.title


class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class EligibilityRule(models.Model):
    """'Open to all' has no field. Other rules restrict on an active profile field's value."""

    label = models.CharField(max_length=80, unique=True)
    field_key = models.SlugField(max_length=64, blank=True, help_text="Profile field key, e.g. gender. Blank = everyone.")
    allowed_values = models.JSONField(default=list, blank=True, help_text='e.g. ["Female"]')

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return self.label

    def allows(self, profile_data: dict) -> bool:
        if not self.field_key:
            return True
        value = (profile_data or {}).get(self.field_key)
        values = value if isinstance(value, list) else [value]
        allowed = {str(v).strip().lower() for v in self.allowed_values}
        return any(str(v).strip().lower() in allowed for v in values if v not in (None, ""))


class AuditLog(models.Model):
    """Append-only record of sensitive actions."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    actor_label = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=64, db_index=True)
    object_type = models.CharField(max_length=64, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    object_repr = models.CharField(max_length=200, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} {self.object_repr}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Audit log entries are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit log entries cannot be deleted.")
