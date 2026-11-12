from django.contrib import admin
from django.shortcuts import redirect
from django.urls import reverse
from unfold.admin import ModelAdmin
from unfold.decorators import display

from .admin_base import AuditedModelAdmin
from .models import AuditLog, Category, EligibilityRule, FeatureFlag, Page, SiteSettings


@admin.register(SiteSettings)
class SiteSettingsAdmin(AuditedModelAdmin):
    fieldsets = [
        ("Identity", {"fields": ["institute_name", "tagline", "description", "logo", "favicon"]}),
        ("Colours & fonts", {"fields": [("color_primary", "color_accent"), ("color_heading", "color_text"), "color_surface",
                                        ("font_heading", "font_body")],
                             "description": "Text colours must keep a 4.5:1 contrast with their background."}),
        ("Contact", {"fields": ["support_email", "support_whatsapp", "social_links", "institute_timezone"]}),
        ("Policies & timings", {"fields": ["default_refund_policy", "payment_review_eta", "join_window_minutes",
                                           "live_reminder_offsets", "deadline_reminder_offsets", "deletion_grace_days",
                                           "at_risk_inactive_days"]}),
    ]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        obj = SiteSettings.load()
        return redirect(reverse("admin:core_sitesettings_change", args=[obj.pk]))


@admin.register(FeatureFlag)
class FeatureFlagAdmin(AuditedModelAdmin):
    list_display = ["key", "description", "enabled"]
    list_editable = ["enabled"]
    readonly_fields = ["key"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Page)
class PageAdmin(AuditedModelAdmin):
    list_display = ["title", "slug", "status", "show_in_footer", "order", "updated_at"]
    list_editable = ["status", "show_in_footer", "order"]
    prepopulated_fields = {"slug": ["title"]}
    search_fields = ["title", "body"]


@admin.register(Category)
class CategoryAdmin(AuditedModelAdmin):
    list_display = ["name", "slug", "order"]
    list_editable = ["order"]
    prepopulated_fields = {"slug": ["name"]}


@admin.register(EligibilityRule)
class EligibilityRuleAdmin(AuditedModelAdmin):
    list_display = ["label", "field_key", "allowed_values"]


@admin.register(AuditLog)
class AuditLogAdmin(ModelAdmin):
    list_display = ["created_at", "actor_label", "action_badge", "object_repr", "details", "ip_address"]
    list_filter = ["action", "object_type"]
    search_fields = ["actor_label", "object_repr", "action", "object_id"]
    date_hierarchy = "created_at"
    list_per_page = 50

    @display(description="Action", label=True)
    def action_badge(self, obj):
        return obj.action

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
