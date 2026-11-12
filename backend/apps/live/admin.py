from django.contrib import admin, messages
from import_export import fields, resources
from import_export.admin import ExportActionModelAdmin
from unfold.admin import TabularInline
from unfold.contrib.import_export.forms import ExportForm
from unfold.decorators import action, display

from apps.core.admin_base import CourseScopedAdmin, run_service
from apps.enrollments.models import Enrollment

from .models import AttendanceRecord, LiveSession
from .services import publish_recording, set_attendance


class AttendanceInline(TabularInline):
    model = AttendanceRecord
    extra = 0
    can_delete = False
    fields = ["user", "join_clicked_at", "status", "updated_by"]
    readonly_fields = ["user", "join_clicked_at", "updated_by"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(LiveSession)
class LiveSessionAdmin(CourseScopedAdmin):
    list_display = ["title", "course", "starts_at", "duration_minutes", "platform", "recording_status", "attended"]
    list_filter = ["course"]
    search_fields = ["title", "course__title"]
    date_hierarchy = "starts_at"
    inlines = [AttendanceInline]
    actions = ["publish_recordings"]
    actions_detail = ["publish_recording_detail"]
    fieldsets = [
        (None, {"fields": ["course", "title", "description", ("starts_at", "duration_minutes"), "join_url",
                           "counts_for_attendance"],
                "description": "Times are entered in UTC. The meeting link is only shown to enrolled students, and never emailed."}),
        ("Recording", {"fields": ["recording_url", "recording_published", "recording_published_at"]}),
    ]
    readonly_fields = ["recording_published", "recording_published_at"]

    def change_view(self, request, object_id, form_url="", extra_context=None):
        session = self.get_object(request, object_id)
        if session is not None:  # one attendance row per active student, so the instructor can mark everyone
            for e in Enrollment.objects.filter(course=session.course, status=Enrollment.ACTIVE).select_related("user"):
                if e.is_currently_active:
                    AttendanceRecord.objects.get_or_create(session=session, user=e.user)
        return super().change_view(request, object_id, form_url, extra_context)

    def save_formset(self, request, form, formset, change):
        if formset.model is not AttendanceRecord:
            return super().save_formset(request, form, formset, change)
        for f in formset.forms:
            if f.instance.pk and "status" in f.changed_data and f.cleaned_data.get("status"):
                run_service(request, set_attendance, f.instance.session, f.instance.user, f.cleaned_data["status"],
                            request.user, request=request)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if obj.recording_url and not obj.recording_published and obj.course.recording_policy == "auto":
            run_service(request, publish_recording, obj, request.user, request=request,
                        success="Recording published to students (course policy: automatic).")

    @action(description="Publish recording to students")
    def publish_recordings(self, request, queryset):
        for session in queryset:
            run_service(request, publish_recording, session, request.user, request=request)
        messages.success(request, "Done.")

    @action(description="Publish recording", url_path="publish-recording")
    def publish_recording_detail(self, request, object_id):
        from django.shortcuts import redirect

        session = self.get_object(request, object_id)
        run_service(request, publish_recording, session, request.user, request=request,
                    success="Recording published and students notified.")
        return redirect(request.META.get("HTTP_REFERER", ".."))

    @display(description="Recording", label={"Published": "success", "Needs review": "warning", "—": "info"})
    def recording_status(self, obj):
        if obj.recording_published:
            return "Published"
        return "Needs review" if obj.recording_url else "—"

    @display(description="Attended")
    def attended(self, obj):
        return obj.attendance.filter(status__in=["present", "late"]).count()


class AttendanceResource(resources.ModelResource):
    session_title = fields.Field(attribute="session__title", column_name="Session")
    starts = fields.Field(attribute="session__starts_at", column_name="Starts (UTC)")
    course = fields.Field(attribute="session__course__title", column_name="Course")
    student = fields.Field(attribute="user__full_name", column_name="Student")
    email = fields.Field(attribute="user__email", column_name="Email")

    class Meta:
        model = AttendanceRecord
        fields = ["course", "session_title", "starts", "student", "email", "status", "join_clicked_at"]
        export_order = fields


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(CourseScopedAdmin, ExportActionModelAdmin):
    course_path = "session__course"
    export_form_class = ExportForm
    resource_classes = [AttendanceResource]
    list_display = ["session", "user", "join_clicked_at", "status"]
    list_editable = ["status"]
    list_filter = ["session__course", "status", "session"]
    search_fields = ["user__email", "user__full_name", "session__title"]
    readonly_fields = ["session", "user", "join_clicked_at", "updated_by", "updated_at"]
    fields = ["session", "user", "join_clicked_at", "status", "updated_by", "updated_at"]

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        if "status" in form.changed_data and obj.status:
            new_status = obj.status
            obj.status = AttendanceRecord.objects.get(pk=obj.pk).status  # let the service record from → to
            run_service(request, set_attendance, obj.session, obj.user, new_status, request.user, request=request)
