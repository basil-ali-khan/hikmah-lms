from django import forms
from django.contrib import admin
from django.utils.html import format_html
from import_export import fields, resources
from import_export.admin import ExportActionModelAdmin
from unfold.contrib.import_export.forms import ExportForm
from unfold.decorators import display
from unfold.widgets import UnfoldAdminSelectWidget, UnfoldAdminTextareaWidget

from apps.core.admin_base import AuditedModelAdmin, CourseScopedAdmin, run_service
from apps.core.files import secure_url
from apps.core.services import audit

from .models import BankAccount, PaymentSubmission
from .services import approve_payment, reject_payment, request_resubmission


@admin.register(BankAccount)
class BankAccountAdmin(AuditedModelAdmin):
    list_display = ["display_name", "currency", "bank_name", "active", "order"]
    list_editable = ["active", "order"]


class PaymentResource(resources.ModelResource):
    student = fields.Field(attribute="enrollment__user__full_name", column_name="Student")
    email = fields.Field(attribute="enrollment__user__email", column_name="Email")
    course = fields.Field(attribute="enrollment__course__title", column_name="Course")
    reference = fields.Field(attribute="enrollment__payment_reference", column_name="Reference")
    reviewer_email = fields.Field(attribute="reviewer__email", column_name="Reviewer")

    class Meta:
        model = PaymentSubmission
        fields = ["created_at", "student", "email", "course", "reference", "transaction_ref", "amount", "currency",
                  "paid_on", "status", "flags", "reviewer_email", "reviewed_at", "remarks"]
        export_order = fields


DECISIONS = [("", "— choose —"), ("approve", "Approve & unlock course"), ("resubmit", "Request resubmission"),
             ("reject", "Reject")]


class DecisionForm(forms.ModelForm):
    decision = forms.ChoiceField(choices=DECISIONS, required=False, widget=UnfoldAdminSelectWidget)
    decision_remarks = forms.CharField(label="Remarks", required=False, widget=UnfoldAdminTextareaWidget(attrs={"rows": 3}),
                                       help_text="Shown to the student. Required to reject or request resubmission.")

    class Meta:
        model = PaymentSubmission
        fields = []


FLAG_LABELS = {"duplicate_receipt": "Duplicate receipt", "amount_mismatch": "Amount ≠ price"}


@admin.register(PaymentSubmission)
class PaymentSubmissionAdmin(CourseScopedAdmin, ExportActionModelAdmin):
    course_path = "enrollment__course"
    form = DecisionForm
    export_form_class = ExportForm
    resource_classes = [PaymentResource]
    list_display = ["created_at", "student", "course", "amount_display", "reference", "flag_badges", "status_badge"]
    list_filter = ["status", "enrollment__course", "currency"]
    search_fields = ["enrollment__user__email", "enrollment__user__full_name", "enrollment__payment_reference",
                     "transaction_ref"]
    date_hierarchy = "created_at"
    list_select_related = ["enrollment__user", "enrollment__course"]
    readonly_fields = ["receipt_preview", "student", "course", "expected", "amount_display", "reference", "transaction_ref",
                       "paid_on", "bank_account", "flag_badges", "status", "reviewer", "reviewed_at", "remarks", "created_at",
                       "duplicates"]

    def get_fieldsets(self, request, obj=None):
        fs = [
            ("Receipt", {"fields": ["receipt_preview"]}),
            ("Details", {"fields": ["student", "course", "expected", "amount_display", "reference", "transaction_ref",
                                    "paid_on", "bank_account", "flag_badges", "duplicates", "created_at"]}),
            ("Review", {"fields": ["status", "reviewer", "reviewed_at", "remarks"]}),
        ]
        if obj and obj.status == PaymentSubmission.PENDING and self._can_review(request):
            fs.append(("Decision", {"fields": ["decision", "decision_remarks"],
                                    "description": "Only 'Approve' unlocks the course. Decisions are final and audited."}))
        return fs

    def _can_review(self, request):
        return request.user.is_superuser or request.user.has_perm("payments.verify_payments")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def change_view(self, request, object_id, form_url="", extra_context=None):
        obj = self.get_object(request, object_id)
        if obj is not None:
            audit(request.user, "payment.view_receipt", obj, request=request)
        return super().change_view(request, object_id, form_url, extra_context)

    def save_model(self, request, obj, form, change):
        decision = form.cleaned_data.get("decision")
        remarks = form.cleaned_data.get("decision_remarks") or ""
        if decision == "approve":
            run_service(request, approve_payment, obj, request.user, remarks, request=request,
                        success="Payment approved — the student now has access and has been emailed.")
        elif decision == "resubmit":
            run_service(request, request_resubmission, obj, request.user, remarks, request=request,
                        success="Resubmission requested.")
        elif decision == "reject":
            run_service(request, reject_payment, obj, request.user, remarks, request=request, success="Payment rejected.")

    def save_related(self, request, form, formsets, change):
        pass

    def export_admin_action(self, request, queryset):
        audit(request.user, "export.run", None, {"model": "payment", "rows": queryset.count()}, request=request,
              object_repr="Payments export")
        return super().export_admin_action(request, queryset)

    @display(description="Receipt")
    def receipt_preview(self, obj):
        url = secure_url(obj.receipt)
        if not url:
            return "—"
        if (obj.receipt_mime or "").startswith("image/"):
            return format_html('<a href="{}" target="_blank" rel="noopener"><img src="{}" alt="Payment receipt" '
                               'style="max-width:100%;max-height:560px;border:1px solid #DADADA;border-radius:8px"></a>'
                               '<p style="margin-top:6px">Link expires in a few minutes — reload to refresh.</p>', url, url)
        return format_html('<a href="{}" target="_blank" rel="noopener">Open receipt (PDF)</a>', url)

    @display(description="Student")
    def student(self, obj):
        u = obj.enrollment.user
        return f"{u.full_name} <{u.email}>"

    @display(description="Course")
    def course(self, obj):
        return obj.enrollment.course.title

    @display(description="Expected")
    def expected(self, obj):
        c = obj.enrollment.course
        return f"{c.currency} {c.price:,.2f}"

    @display(description="Declared amount")
    def amount_display(self, obj):
        return f"{obj.currency} {obj.amount:,.2f}"

    @display(description="Reference")
    def reference(self, obj):
        return obj.enrollment.payment_reference

    @display(description="Flags")
    def flag_badges(self, obj):
        if not obj.flags:
            return "—"
        return format_html(" ".join(
            '<span style="background:#FBE4E4;color:#9B1C1C;border-radius:10px;padding:2px 8px;font-size:12px">{}</span>'
            for _ in obj.flags), *[FLAG_LABELS.get(f, f) for f in obj.flags])

    @display(description="Same file submitted by")
    def duplicates(self, obj):
        others = PaymentSubmission.objects.filter(file_hash=obj.file_hash).exclude(pk=obj.pk).select_related(
            "enrollment__user", "enrollment__course")
        if not others:
            return "—"
        return "; ".join(f"{o.enrollment.user.email} · {o.enrollment.course.title} · {o.created_at:%d %b %Y}" for o in others)

    @display(description="Status", label={"pending": "warning", "approved": "success", "rejected": "danger", "resubmit": "info"})
    def status_badge(self, obj):
        return obj.status
