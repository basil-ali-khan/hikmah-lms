import uuid

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone
from unfold.admin import ModelAdmin, StackedInline
from unfold.decorators import action
from unfold.forms import AdminPasswordChangeForm

from apps.core.admin_base import AuditedModelAdmin
from apps.core.services import audit

from .models import DeletionRequest, Profile, ProfileFieldDefinition, User


class UserCreateForm(forms.ModelForm):
    password1 = forms.CharField(label="Password", widget=forms.PasswordInput, strip=False)

    class Meta:
        model = User
        fields = ["email", "full_name"]

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user

    def clean_password1(self):
        from django.contrib.auth.password_validation import validate_password

        validate_password(self.cleaned_data["password1"])
        return self.cleaned_data["password1"]


class ProfileInline(StackedInline):
    model = Profile
    can_delete = False
    fields = ["data", "timezone", "privacy_consent_at", "terms_accepted_at", "completed_at", "class_reminders",
              "deadline_reminders"]
    readonly_fields = ["privacy_consent_at", "terms_accepted_at", "completed_at"]


@admin.register(User)
class UserAdmin(BaseUserAdmin, AuditedModelAdmin):
    add_form = UserCreateForm
    change_password_form = AdminPasswordChangeForm
    ordering = ["email"]
    list_display = ["email", "full_name", "is_staff", "is_active", "date_joined", "last_seen_at"]
    list_filter = ["is_staff", "is_superuser", "is_active", "groups"]
    search_fields = ["email", "full_name"]
    inlines = [ProfileInline]
    readonly_fields = ["date_joined", "last_login", "last_seen_at"]
    fieldsets = [
        (None, {"fields": ["email", "password", "full_name"]}),
        ("Access", {"fields": ["is_active", "is_staff", "is_superuser", "groups"],
                    "description": "Staff can sign in to this panel. Roles come from groups: Course Manager or Instructor. "
                                   "Instructors are scoped to the courses they're assigned to."}),
        ("Activity", {"fields": ["date_joined", "last_login", "last_seen_at"]}),
    ]
    add_fieldsets = [(None, {"fields": ["email", "full_name", "password1"]})]
    filter_horizontal = ["groups"]

    def get_readonly_fields(self, request, obj=None):
        ro = list(super().get_readonly_fields(request, obj))
        if not request.user.is_superuser:
            ro += ["is_superuser", "is_staff", "groups", "email"]
        return ro


@admin.register(ProfileFieldDefinition)
class ProfileFieldDefinitionAdmin(AuditedModelAdmin):
    list_display = ["label", "key", "field_type", "required", "visible_to_instructors", "locked_after_save", "active", "order"]
    list_editable = ["required", "visible_to_instructors", "locked_after_save", "active", "order"]
    fields = ["label", "key", "field_type", "options", "help_text", "required", "visible_to_instructors",
              "locked_after_save", "active", "order"]

    def get_readonly_fields(self, request, obj=None):
        return ["key"] if obj else []

    def has_delete_permission(self, request, obj=None):
        return False  # switch off instead, so stored answers are never lost


def anonymize_user(user, actor, request=None):
    """Right to erasure: strip personal data, keep financial/certificate records the institute must retain."""
    original = user.email
    user.email = f"deleted-{uuid.uuid4().hex[:12]}@deleted.invalid"
    user.full_name = "Deleted user"
    user.is_active = False
    user.set_unusable_password()
    user.save()
    Profile.objects.filter(user=user).update(data={}, timezone="")
    EmailAddress.objects.filter(user=user).delete()
    SocialAccount.objects.filter(user=user).delete()
    user.notifications.all().delete()
    audit(actor, "account.anonymized", user, {"original_email_domain": original.split("@")[-1]}, request=request)


@admin.register(DeletionRequest)
class DeletionRequestAdmin(ModelAdmin):
    list_display = ["user", "requested_at", "status", "processed_by", "processed_at"]
    list_filter = ["status"]
    readonly_fields = ["user", "requested_at", "reason", "status", "processed_by", "processed_at"]
    actions = ["complete_deletion", "cancel_request"]

    def has_add_permission(self, request):
        return False

    @action(description="Delete personal data for selected requests")
    def complete_deletion(self, request, queryset):
        if not request.user.is_superuser:
            messages.error(request, "Only a Super Admin can complete deletions.")
            return
        done = 0
        for req in queryset.filter(status=DeletionRequest.PENDING).select_related("user"):
            anonymize_user(req.user, request.user, request)
            req.status, req.processed_by, req.processed_at = DeletionRequest.COMPLETED, request.user, timezone.now()
            req.save()
            done += 1
        messages.success(request, f"{done} account(s) anonymized.")

    @action(description="Cancel selected requests")
    def cancel_request(self, request, queryset):
        n = queryset.filter(status=DeletionRequest.PENDING).update(
            status=DeletionRequest.CANCELLED, processed_by=request.user, processed_at=timezone.now())
        messages.success(request, f"{n} request(s) cancelled.")
