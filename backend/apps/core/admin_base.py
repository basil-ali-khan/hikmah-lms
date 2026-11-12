"""Shared staff-panel building blocks: auditing and course scoping for instructors."""

from django.contrib import messages
from django.core.exceptions import ValidationError
from unfold.admin import ModelAdmin

from apps.courses.models import Course, Module
from apps.courses.services import can_manage_all_courses, courses_for_staff, is_course_staff

from .services import ServiceError, audit


class AuditedModelAdmin(ModelAdmin):
    """Every add/change/delete from the staff panel lands in the audit log."""

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        changed = list(form.changed_data) if form is not None else []
        audit(request.user, f"admin.{'change' if change else 'add'}", obj, {"fields": changed}, request=request)

    def delete_model(self, request, obj):
        audit(request.user, "admin.delete", obj, request=request)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            audit(request.user, "admin.delete", obj, request=request)
        super().delete_queryset(request, queryset)


def run_service(http_request, fn, *args, success=None, **kwargs):
    """Call a domain service from the admin, turning business-rule errors into admin messages."""
    try:
        result = fn(*args, **kwargs)
    except ServiceError as exc:
        messages.error(http_request, exc.message)
        return None
    except ValidationError as exc:
        messages.error(http_request, " ".join(exc.messages))
        return None
    if success:
        messages.success(http_request, success)
    return result


class CourseScopedAdmin(AuditedModelAdmin):
    """Instructors only ever see and edit objects belonging to their assigned courses."""

    course_path = "course"  # ORM path from this model to Course

    def _course_of(self, obj):
        target = obj
        for part in self.course_path.split("__"):
            target = getattr(target, part)
        return target

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if can_manage_all_courses(request.user):
            return qs
        return qs.filter(**{f"{self.course_path}__course_instructors__user": request.user}).distinct()

    def _obj_allowed(self, request, obj):
        return obj is None or is_course_staff(request.user, self._course_of(obj))

    def has_view_permission(self, request, obj=None):
        return super().has_view_permission(request, obj) and self._obj_allowed(request, obj)

    def has_change_permission(self, request, obj=None):
        return super().has_change_permission(request, obj) and self._obj_allowed(request, obj)

    def has_delete_permission(self, request, obj=None):
        return super().has_delete_permission(request, obj) and self._obj_allowed(request, obj)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if not can_manage_all_courses(request.user):
            allowed = courses_for_staff(request.user)
            if db_field.related_model is Course:
                kwargs["queryset"] = allowed
            elif db_field.related_model is Module:
                kwargs["queryset"] = Module.objects.filter(course__in=allowed)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
