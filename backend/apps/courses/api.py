"""Public course catalog and course detail."""

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import SiteSettings
from apps.core.services import render_markdown
from apps.enrollments.models import Enrollment
from apps.enrollments.services import enrollment_state

from .models import Course, PublishStatus
from .video import resolve_video


def instructors_json(course):
    return [{"name": ci.user.full_name or ci.user.email.split("@")[0]}
            for ci in course.course_instructors.select_related("user")]


def course_card(course, seats_taken=None):
    return {
        "id": str(course.id),
        "slug": course.slug,
        "title": course.title,
        "summary": course.summary,
        "thumbnail_url": course.thumbnail.url if course.thumbnail else None,
        "course_type": course.course_type,
        "category": {"name": course.category.name, "slug": course.category.slug} if course.category else None,
        "is_free": course.is_free,
        "price": str(course.price),
        "currency": course.currency,
        "starts_at": course.starts_at,
        "duration_label": course.duration_label,
        "schedule_label": course.schedule_label,
        "featured": course.featured,
        "instructors": instructors_json(course),
        "access_type": course.access_type,
        "access_days": course.access_days,
        "access_until": course.access_until,
        "capacity": course.capacity,
        "seats_left": (max(course.capacity - (seats_taken or 0), 0) if course.capacity is not None else None),
        "issue_certificate": course.issue_certificate,
    }


def _catalog_queryset():
    now = timezone.now()
    active = Q(enrollments__status=Enrollment.ACTIVE) & (Q(enrollments__expires_at__isnull=True) | Q(enrollments__expires_at__gt=now))
    return (Course.objects.filter(status=Course.PUBLISHED).select_related("category")
            .prefetch_related("course_instructors__user").annotate(seats_taken=Count("enrollments", filter=active)))


class CourseListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _catalog_queryset()
        p = request.query_params
        types = [t for t in p.get("type", "").split(",") if t in dict(Course.TYPES)]
        if types:
            qs = qs.filter(course_type__in=types)
        if p.get("price") == "free":
            qs = qs.filter(price__lte=0)
        elif p.get("price") == "paid":
            qs = qs.filter(price__gt=0)
        if p.get("category"):
            qs = qs.filter(category__slug__in=p["category"].split(","))
        if p.get("featured") in ("1", "true"):
            qs = qs.filter(featured=True)
        if q := p.get("q", "").strip()[:100]:
            qs = qs.filter(Q(title__icontains=q) | Q(summary__icontains=q) |
                           Q(course_instructors__user__full_name__icontains=q)).distinct()
        return Response([course_card(c, c.seats_taken) for c in qs[:200]])


class CourseDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        course = get_object_or_404(_catalog_queryset(), slug=slug)
        user = request.user if request.user.is_authenticated else None
        modules = []
        for m in course.modules.filter(status=PublishStatus.PUBLISHED).order_by("order"):
            lessons = m.lessons.filter(status=PublishStatus.PUBLISHED)
            modules.append({
                "title": m.title,
                "release_at": m.release_at,
                "lesson_count": lessons.count(),
                "quiz_count": m.quizzes.filter(status=PublishStatus.PUBLISHED).count(),
                "assignment_count": m.assignments.filter(status=PublishStatus.PUBLISHED).count(),
                "lessons": [{"title": lesson.title, "kind": lesson.kind, "duration_minutes": lesson.duration_minutes}
                            for lesson in lessons],
            })
        upcoming = course.live_sessions.filter(starts_at__gte=timezone.now()).order_by("starts_at")[:5]
        data = course_card(course, course.seats_taken)
        data.update({
            "description_html": render_markdown(course.description),
            "outcomes_html": render_markdown(course.outcomes),
            "intro_video": resolve_video(course.intro_video_url),
            "refund_policy": course.refund_policy or SiteSettings.load().default_refund_policy,
            "enrollment_mode": course.enrollment_mode,
            "enrollment_opens_at": course.enrollment_opens_at,
            "enrollment_closes_at": course.enrollment_closes_at,
            "ends_at": course.ends_at,
            "eligibility": course.eligibility.label if course.eligibility else None,
            "modules": modules,
            "upcoming_sessions": [{"title": s.title, "starts_at": s.starts_at, "duration_minutes": s.duration_minutes}
                                  for s in upcoming],
            "completion": {
                "lessons": course.require_all_lessons, "quizzes": course.require_quizzes,
                "assignments": course.require_assignments, "min_attendance_percent": course.min_attendance_percent,
            },
            "enroll": enrollment_state(user, course),
        })
        return Response(data)
