from django.contrib.auth.models import Group
from django.db.models import Q
from django.utils import timezone

from .models import Course, CourseInstructor


def can_manage_all_courses(user):
    return bool(user and user.is_authenticated and (user.is_superuser or user.has_perm("courses.manage_all_courses")))


def is_course_instructor(user, course):
    return bool(user and user.is_authenticated and CourseInstructor.objects.filter(course=course, user=user).exists())


def is_course_staff(user, course):
    """Admins/course managers for every course; instructors only for courses they're assigned to."""
    return can_manage_all_courses(user) or is_course_instructor(user, course)


def courses_for_staff(user):
    if can_manage_all_courses(user):
        return Course.objects.all()
    return Course.objects.filter(course_instructors__user=user).distinct()


def assign_instructor(course, user):
    CourseInstructor.objects.get_or_create(course=course, user=user)
    if not user.is_staff:
        user.is_staff = True
        user.save(update_fields=["is_staff"])
    group, _ = Group.objects.get_or_create(name="Instructor")
    user.groups.add(group)


def published_courses():
    return Course.objects.filter(status=Course.PUBLISHED)


def visible_q(prefix=""):
    """Published and released content (module/lesson/quiz/assignment)."""
    now = timezone.now()
    return Q(**{f"{prefix}status": "published"}) & (
        Q(**{f"{prefix}release_at__isnull": True}) | Q(**{f"{prefix}release_at__lte": now})
    )
