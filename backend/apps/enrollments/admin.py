from django import forms
from django.contrib import admin
from import_export import fields, resources
from import_export.admin import ExportActionModelAdmin
from unfold.admin import TabularInline
from unfold.contrib.import_export.forms import ExportForm
from unfold.decorators import display
from unfold.widgets import UnfoldAdminSelectWidget, UnfoldAdminSplitDateTimeWidget, UnfoldAdminTextareaWidget

from apps.core.admin_base import CourseScopedAdmin, run_service
from apps.core.services import audit

from .models import Enrollment, EnrollmentAudit
from .services import admin_enroll, approve_request, extend_access, reject_request, revoke


class EnrollmentResource(resources.ModelResource):
    student = fields.Field(attribute="user__full_name", column_name="Student")
    email = fields.Field(attribute="user__email", column_name="Email")
    course = fields.Field(attribute="course__title", column_name="Course")

    class Meta:
        model = Enrollment
        fields = ["student", "email", "course", "status", "payment_reference", "activated_at", "expires_at",
                  "completed_at", "created_at"]
        export_order = fields


class AuditInline(TabularInline):
    model = EnrollmentAudit
    extra = 0
    can_delete = False
    fields = ["created_at", "action", "from_status", "to_status", "actor", "note"]
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


ACTIONS = [("", "— no change —"), ("approve", "Approve request"), ("reject", "Reject request"),
           ("extend", "Extend / restore access"), ("revoke", "Revoke access")]


class EnrollmentChangeForm(forms.ModelForm):
    decision = forms.ChoiceField(choices=ACTIONS, required=False, widget=UnfoldAdminSelectWidget)
    new_expires_at = forms.SplitDateTimeField(required=False, widget=UnfoldAdminSplitDateTimeWidget,
                                              help_text="For 'Extend': the new end of access.")
    reason = forms.CharField(required=False, widget=UnfoldAdminTextareaWidget(attrs={"rows": 2}),
                             help_text="Required for reject, extend and revoke. Shown to the student.")

    class Meta:
        model = Enrollment
        fields = []


class EnrollmentAddForm(forms.ModelForm):
    note = forms.CharField(widget=UnfoldAdminTextareaWidget(attrs={"rows": 2}),
                           help_text="Why this student is enrolled without the normal flow (e.g. scholarship).")

    class Meta:
        model = Enrollment
        fields = ["user", "course"]


@admin.register(Enrollment)
class EnrollmentAdmin(CourseScopedAdmin, ExportActionModelAdmin):
    export_form_class = ExportForm
    resource_classes = [EnrollmentResource]
    list_display = ["user", "course", "status_badge", "payment_reference", "activated_at", "expires_at", "created_at"]
    list_filter = ["status", "course"]
    search_fields = ["user__email", "user__full_name", "payment_reference", "course__title"]
    date_hierarchy = "created_at"
    inlines = [AuditInline]
    autocomplete_fields = ["user"]

    def get_form(self, request, obj=None, **kwargs):
        kwargs["form"] = EnrollmentAddForm if obj is None else EnrollmentChangeForm
        return super().get_form(request, obj, **kwargs)

    def get_fieldsets(self, request, obj=None):
        if obj is None:
            return [(None, {"fields": ["user", "course", "note"]})]
        fs = [(None, {"fields": ["user", "course", "status", "payment_reference", "activated_at", "expires_at",
                                 "completed_at", "created_at"]})]
        if request.user.is_superuser or request.user.has_perm("enrollments.manage_enrollments"):
            fs.append(("Take action", {"fields": ["decision", "new_expires_at", "reason"]}))
        return fs

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return []
        return ["user", "course", "status", "payment_reference", "activated_at", "expires_at", "completed_at", "created_at"]

    def save_model(self, request, obj, form, change):
        if not change:
            run_service(request, admin_enroll, form.cleaned_data["user"], form.cleaned_data["course"], request.user,
                        form.cleaned_data.get("note"), request=request, success="Student enrolled.")
            return
        decision = form.cleaned_data.get("decision")
        reason = form.cleaned_data.get("reason") or ""
        if decision == "approve":
            run_service(request, approve_request, obj, request.user, reason, request=request, success="Request approved.")
        elif decision == "reject":
            run_service(request, reject_request, obj, request.user, reason, request=request, success="Request rejected.")
        elif decision == "extend":
            run_service(request, extend_access, obj, request.user, form.cleaned_data.get("new_expires_at"), reason,
                        request=request, success="Access extended.")
        elif decision == "revoke":
            run_service(request, revoke, obj, request.user, reason, request=request, success="Access revoked.")

    def save_related(self, request, form, formsets, change):
        if change:
            super().save_related(request, form, formsets, change)

    def response_add(self, request, obj, post_url_continue=None):
        from django.shortcuts import redirect
        from django.urls import reverse

        return redirect(reverse("admin:enrollments_enrollment_changelist"))

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    def export_admin_action(self, request, queryset):
        audit(request.user, "export.run", None, {"model": "enrollment", "rows": queryset.count()}, request=request,
              object_repr="Enrollments export")
        return super().export_admin_action(request, queryset)

    @display(description="Status", label={"active": "success", "pending_payment": "warning", "pending_approval": "warning",
                                          "rejected": "danger", "revoked": "danger", "expired": "info"})
    def status_badge(self, obj):
        return obj.status

