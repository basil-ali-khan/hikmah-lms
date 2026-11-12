import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def normalize_email(self, email):
        return (email or "").strip().lower()

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True)
        return self._create_user(email, password, **extra)

    def get_by_natural_key(self, email):
        return self.get(email__iexact=email)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    is_staff = models.BooleanField(default=False, help_text="Can sign in to the staff panel.")
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["email"]

    def __str__(self):
        return self.full_name or self.email

    def save(self, *args, **kwargs):
        self.email = (self.email or "").strip().lower()
        super().save(*args, **kwargs)

    @property
    def first_name(self):
        return (self.full_name or self.email).split()[0]

    def get_full_name(self):
        return self.full_name or self.email

    def get_short_name(self):
        return self.first_name


class ProfileFieldDefinition(models.Model):
    TEXT, TEXTAREA, PHONE, DATE, SELECT, MULTISELECT, COUNTRY, NUMBER = (
        "text", "textarea", "phone", "date", "select", "multiselect", "country", "number",
    )
    TYPES = [
        (TEXT, "Text"), (TEXTAREA, "Long text"), (PHONE, "Phone"), (DATE, "Date"),
        (SELECT, "Select (one)"), (MULTISELECT, "Select (many)"), (COUNTRY, "Country"), (NUMBER, "Number"),
    ]

    key = models.SlugField(max_length=64, unique=True, help_text="Stable machine name, e.g. gender. Don't change after use.")
    label = models.CharField(max_length=120)
    field_type = models.CharField(max_length=20, choices=TYPES, default=TEXT)
    required = models.BooleanField(default=False)
    options = models.JSONField(default=list, blank=True, help_text='For select types: ["Male", "Female"]')
    help_text = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    visible_to_instructors = models.BooleanField(default=False)
    locked_after_save = models.BooleanField(default=False, help_text="Students can't change it after first save.")

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.label


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    data = models.JSONField(default=dict, blank=True)
    timezone = models.CharField(max_length=64, blank=True, help_text="IANA zone; blank = detect from browser.")
    privacy_consent_at = models.DateTimeField(null=True, blank=True)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    class_reminders = models.BooleanField(default=True)
    deadline_reminders = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile of {self.user}"


class DeletionRequest(models.Model):
    PENDING, COMPLETED, CANCELLED = "pending", "completed", "cancelled"
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="deletion_requests")
    requested_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=12, choices=[(PENDING, "Pending"), (COMPLETED, "Completed"), (CANCELLED, "Cancelled")], default=PENDING
    )
    processed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self):
        return f"Deletion request · {self.user} · {self.status}"
