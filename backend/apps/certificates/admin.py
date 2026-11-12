from django import forms
from django.contrib import admin
from django.http import HttpResponse
from django.utils.html import format_html
from unfold.decorators import action, display

from apps.core.admin_base import AuditedModelAdmin, CourseScopedAdmin, run_service
from apps.core.files import secure_url

from .models import Certificate, CertificateTemplate
from .services import ensure_pdf, render_certificate_pdf, revoke_certificate


@admin.register(CertificateTemplate)
class CertificateTemplateAdmin(AuditedModelAdmin):
    list_display = ["name", "is_default", "title_text", "signatory_name"]
    fieldsets = [
        (None, {"fields": ["name", "is_default", "title_text", "signatory_name", "signatory_title", "signature_image",
                           "show_grade"]}),
        ("Advanced layout", {"classes": ["collapse"], "fields": ["html", "css"],
                             "description": "Django template syntax with variables only. External images/URLs are blocked; "
                                            "the logo and signature are embedded automatically."}),
    ]
    actions_detail = ["preview_pdf"]

    @action(description="Preview PDF", url_path="preview")
    def preview_pdf(self, request, object_id):
        from datetime import date

        from apps.courses.models import Course

        template = self.get_object(request, object_id)
        course = Course(title="Sample Course Title", course_type="live", duration_label="8 weeks",
                        certificate_template=template)
        sample = Certificate(code="HKM-SAMP-LE00", student_name="Student Full Name", course=course,
                             completed_on=date.today())
        return HttpResponse(render_certificate_pdf(sample), content_type="application/pdf")


class RevokeForm(forms.ModelForm):
    revoke = forms.BooleanField(required=False, help_text="Revoking is permanent; the verify page will show 'Revoked'.")
    reason = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 2}))

    class Meta:
        model = Certificate
        fields = []


@admin.register(Certificate)
class CertificateAdmin(CourseScopedAdmin):
    form = RevokeForm
    list_display = ["code", "student_name", "course", "issued_at", "valid"]
    list_filter = ["course"]
    search_fields = ["code", "student_name", "user__email"]
    readonly_fields = ["code", "user", "student_name", "course", "completed_on", "issued_at", "pdf_link", "revoked_at",
                       "revoked_reason", "revoked_by"]
    fieldsets = [
        (None, {"fields": ["code", "user", "student_name", "course", "completed_on", "issued_at", "pdf_link"]}),
        ("Revocation", {"fields": ["revoked_at", "revoked_reason", "revoked_by", "revoke", "reason"]}),
    ]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        if form.cleaned_data.get("revoke"):
            run_service(request, revoke_certificate, obj, request.user, form.cleaned_data.get("reason"), request=request,
                        success="Certificate revoked.")

    def save_related(self, request, form, formsets, change):
        pass

    @display(description="PDF")
    def pdf_link(self, obj):
        return format_html('<a href="{}" target="_blank" rel="noopener">Download PDF</a>', secure_url(ensure_pdf(obj)))

    @display(description="Valid", boolean=True)
    def valid(self, obj):
        return obj.is_valid
