from django.contrib import admin
from django.db.models import Count, Q
from django.utils import timezone
from unfold.admin import TabularInline
from unfold.decorators import display

from apps.core.admin_base import CourseScopedAdmin
from apps.enrollments.models import Enrollment

from .models import Course, CourseInstructor, Lesson, Module
from .services import assign_instructor, can_manage_all_courses


class CourseInstructorInline(TabularInline):
    model = CourseInstructor
    extra = 0
    autocomplete_fields = ["user"]
    fields = ["user", "order"]


class ModuleInline(TabularInline):
    model = Module
    extra = 0
    fields = ["title", "order", "status", "release_at"]
    show_change_link = True


DETAILS = ("Details", {"classes": ["tab"], "fields": [
    "title", "slug", "summary", "description", "outcomes", "thumbnail", "intro_video_url", "category",
    ("course_type", "status"), "featured", ("starts_at", "ends_at"), ("duration_label", "schedule_label")]})
PRICING = ("Pricing & enrollment", {"classes": ["tab"], "fields": [
    ("price", "currency"), "bank_accounts", "enrollment_mode", "capacity",
    ("enrollment_opens_at", "enrollment_closes_at"), "eligibility", "refund_policy"],
    "description": "Paid courses always need a verified payment. Enrollment mode applies to free courses."})
ACCESS = ("Access", {"classes": ["tab"], "fields": ["access_type", "access_days", "access_until"]})
COMPLETION = ("Completion & certificate", {"classes": ["tab"], "fields": [
    "require_all_lessons", "require_quizzes", "require_assignments", "min_attendance_percent", "issue_certificate",
    "certificate_template", "recording_policy"]})


@admin.register(Course)
class CourseAdmin(CourseScopedAdmin):
    course_path = "pk"
    list_display = ["title", "course_type", "status_badge", "price_display", "active_students", "starts_at"]
    list_filter = ["status", "course_type", "category"]
    search_fields = ["title", "summary"]
    prepopulated_fields = {"slug": ["title"]}
    filter_horizontal = ["bank_accounts"]
    inlines = [CourseInstructorInline, ModuleInline]

    def _course_of(self, obj):
        return obj

    def get_queryset(self, request):
        qs = Course.objects.all() if can_manage_all_courses(request.user) else Course.objects.filter(
            course_instructors__user=request.user).distinct()
        now = timezone.now()
        return qs.annotate(_active=Count("enrollments", filter=Q(enrollments__status=Enrollment.ACTIVE) & (
            Q(enrollments__expires_at__isnull=True) | Q(enrollments__expires_at__gt=now)), distinct=True))

    def get_fieldsets(self, request, obj=None):
        if can_manage_all_courses(request.user):
            return [DETAILS, PRICING, ACCESS, COMPLETION]
        return [DETAILS]  # instructors never see or change pricing, enrollment or policy fields

    def get_readonly_fields(self, request, obj=None):
        if can_manage_all_courses(request.user):
            return []
        return ["title", "slug", "status", "course_type", "category", "featured", "starts_at", "ends_at"]

    def get_prepopulated_fields(self, request, obj=None):
        return self.prepopulated_fields if can_manage_all_courses(request.user) else {}

    def get_inlines(self, request, obj):
        return [CourseInstructorInline, ModuleInline] if can_manage_all_courses(request.user) else [ModuleInline]

    def has_add_permission(self, request):
        return can_manage_all_courses(request.user) and super().has_add_permission(request)

    def save_formset(self, request, form, formset, change):
        super().save_formset(request, form, formset, change)
        if formset.model is CourseInstructor:
            for ci in CourseInstructor.objects.filter(course=form.instance):
                assign_instructor(form.instance, ci.user)  # makes them staff + Instructor group

    @display(description="Status", label={"published": "success", "draft": "warning", "archived": "info"})
    def status_badge(self, obj):
        return obj.status

    @display(description="Price")
    def price_display(self, obj):
        return "Free" if obj.is_free else f"{obj.currency} {obj.price:,.0f}"

    @display(description="Active students", ordering="_active")
    def active_students(self, obj):
        return obj._active


class LessonInline(TabularInline):
    model = Lesson
    extra = 0
    fields = ["title", "kind", "video_url", "order", "status", "required", "release_at"]
    show_change_link = True


@admin.register(Module)
class ModuleAdmin(CourseScopedAdmin):
    list_display = ["title", "course", "order", "status", "release_at"]
    list_filter = ["course", "status"]
    list_editable = ["order", "status"]
    search_fields = ["title", "course__title"]
    inlines = [LessonInline]


@admin.register(Lesson)
class LessonAdmin(CourseScopedAdmin):
    course_path = "module__course"
    list_display = ["title", "module", "kind", "order", "status", "required"]
    list_filter = ["module__course", "kind", "status"]
    search_fields = ["title"]
    fieldsets = [
        (None, {"fields": ["module", "title", "kind", "video_url", "file", "body", "duration_minutes"]}),
        ("Release & rules", {"fields": ["order", "status", "release_at", "required", "prerequisite_lesson",
                                        "prerequisite_quiz", "prerequisite_min_percent"]}),
    ]

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name in ("prerequisite_lesson", "prerequisite_quiz") and not can_manage_all_courses(request.user):
            from apps.assessments.models import Quiz

            from .services import courses_for_staff

            allowed = courses_for_staff(request.user)
            kwargs["queryset"] = (Lesson.objects.filter(module__course__in=allowed) if db_field.name == "prerequisite_lesson"
                                  else Quiz.objects.filter(course__in=allowed))
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
