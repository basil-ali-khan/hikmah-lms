"""Student dashboard and cross-course schedule."""

from datetime import timedelta

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assessments.models import Assignment, Quiz, Submission
from apps.courses.models import PublishStatus
from apps.enrollments.models import Enrollment
from apps.live.services import upcoming_sessions_for

from .api import session_json
from .services import course_progress, next_lesson


def _active_enrollments(user):
    return [e for e in Enrollment.objects.filter(user=user, status=Enrollment.ACTIVE).select_related("course")
            if e.is_currently_active]


class DashboardView(APIView):
    def get(self, request):
        user = request.user
        now = timezone.now()
        active = _active_enrollments(user)
        continue_learning = []
        for e in active:
            nxt = next_lesson(user, e.course)
            continue_learning.append({
                "course": {"slug": e.course.slug, "title": e.course.title, "course_type": e.course.course_type,
                           "thumbnail_url": e.course.thumbnail.url if e.course.thumbnail else None},
                "progress": course_progress(user, e.course), "expires_at": e.expires_at,
                "next_lesson": {"id": str(nxt.id), "title": nxt.title} if nxt else None,
            })
        course_ids = [e.course_id for e in active]
        horizon = now + timedelta(days=14)
        due = []
        for q in Quiz.objects.filter(course_id__in=course_ids, status=PublishStatus.PUBLISHED, closes_at__gt=now,
                                     closes_at__lte=horizon).select_related("course"):
            if not q.attempts.filter(user=user).exclude(status="in_progress").exists():
                due.append({"type": "quiz", "id": str(q.id), "title": q.title, "due_at": q.closes_at,
                            "course": {"slug": q.course.slug, "title": q.course.title}})
        for a in Assignment.objects.filter(course_id__in=course_ids, status=PublishStatus.PUBLISHED, due_at__gt=now,
                                           due_at__lte=horizon).select_related("course"):
            if not Submission.objects.filter(assignment=a, user=user).exists():
                due.append({"type": "assignment", "id": str(a.id), "title": a.title, "due_at": a.due_at,
                            "course": {"slug": a.course.slug, "title": a.course.title}})
        due.sort(key=lambda d: d["due_at"])
        sessions = [s for s in upcoming_sessions_for(user, limit=10) if s.ends_at >= now]
        pending = Enrollment.objects.filter(user=user, status__in=[Enrollment.PENDING_PAYMENT, Enrollment.PENDING_APPROVAL]
                                            ).select_related("course")
        return Response({
            "next_session": session_json(sessions[0], user) if sessions else None,
            "continue_learning": continue_learning,
            "due_soon": due[:8],
            "pending": [{"enrollment_id": str(e.id), "status": e.status,
                         "course": {"slug": e.course.slug, "title": e.course.title},
                         "payment_status": (e.payments.first().status if e.payments.exists() else None)} for e in pending],
            "certificates_count": user.certificates.filter(revoked_at__isnull=True).count(),
        })


class ScheduleView(APIView):
    def get(self, request):
        now = timezone.now()
        sessions = [s for s in upcoming_sessions_for(request.user, limit=60) if s.ends_at >= now]
        return Response([session_json(s, request.user) for s in sessions])
