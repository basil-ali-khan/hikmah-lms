from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.certificates.models import Certificate
from apps.certificates.services import completion_status
from apps.core.files import secure_url
from apps.core.services import render_markdown
from apps.courses.models import Course, Lesson, PublishStatus
from apps.courses.services import is_course_staff
from apps.courses.video import resolve_video
from apps.enrollments.services import get_enrollment, has_course_access, require_course_access
from apps.live.models import LiveSession
from apps.live.services import attendance_summary, join_session, join_state, session_ics

from .services import completed_ids, course_outline, lesson_availability, mark_complete, next_lesson


def _course_for_learner(request, slug):
    course = get_object_or_404(Course.objects.exclude(status=Course.DRAFT), slug=slug)
    if course.status == Course.ARCHIVED and not has_course_access(request.user, course):
        raise Http404
    require_course_access(request.user, course)
    return course


class LearnCourseView(APIView):
    def get(self, request, slug):
        course = _course_for_learner(request, slug)
        e = get_enrollment(request.user, course)
        nxt = next_lesson(request.user, course)
        cert = Certificate.objects.filter(user=request.user, course=course).first()
        return Response({
            "course": {"slug": course.slug, "title": course.title, "course_type": course.course_type,
                       "summary": course.summary, "schedule_label": course.schedule_label},
            "enrollment": {"status": e.status, "expires_at": e.expires_at, "activated_at": e.activated_at} if e else None,
            "staff_preview": is_course_staff(request.user, course),
            "outline": course_outline(request.user, course),
            "next_lesson": {"id": str(nxt.id), "title": nxt.title} if nxt else None,
            "completion": completion_status(request.user, course),
            "certificate": {"code": cert.code, "valid": cert.is_valid} if cert else None,
        })


def _lesson_json(user, lesson, ok, reason):
    module = lesson.module
    siblings = list(Lesson.objects.filter(module__course=module.course, module__status=PublishStatus.PUBLISHED,
                                          status=PublishStatus.PUBLISHED).order_by("module__order", "order")
                    .values_list("id", flat=True))
    idx = siblings.index(lesson.id) if lesson.id in siblings else -1
    data = {
        "id": str(lesson.id), "title": lesson.title, "kind": lesson.kind, "duration_minutes": lesson.duration_minutes,
        "module": {"id": module.id, "title": module.title}, "course": {"slug": module.course.slug, "title": module.course.title},
        "position": {"index": idx + 1, "total": len(siblings)},
        "previous_id": str(siblings[idx - 1]) if idx > 0 else None,
        "next_id": str(siblings[idx + 1]) if 0 <= idx < len(siblings) - 1 else None,
        "available": ok, "lock_reason": reason,
        "completed": lesson.id in completed_ids(user, module.course),
    }
    if ok:
        data.update({
            "body_html": render_markdown(lesson.body),
            "video": resolve_video(lesson.video_url) if lesson.kind == Lesson.VIDEO else None,
            "file": {"name": lesson.file.name.rsplit("/", 1)[-1], "size": lesson.file.size} if lesson.file else None,
        })
    return data


def _lesson(request, pk):
    lesson = get_object_or_404(Lesson.objects.select_related("module__course", "prerequisite_lesson", "prerequisite_quiz"), pk=pk)
    require_course_access(request.user, lesson.module.course)
    if lesson.status != PublishStatus.PUBLISHED or lesson.module.status != PublishStatus.PUBLISHED:
        if not is_course_staff(request.user, lesson.module.course):
            raise Http404
    return lesson


class LessonView(APIView):
    def get(self, request, pk):
        lesson = _lesson(request, pk)
        ok, reason = lesson_availability(request.user, lesson)
        return Response(_lesson_json(request.user, lesson, ok, reason))


class LessonCompleteView(APIView):
    def post(self, request, pk):
        progress = mark_complete(request.user, _lesson(request, pk))
        return Response({"completed": True, "progress": progress})


class LessonFileView(APIView):
    def get(self, request, pk):
        lesson = _lesson(request, pk)
        ok, reason = lesson_availability(request.user, lesson)
        if not ok or not lesson.file:
            raise Http404
        return Response({"url": secure_url(lesson.file, lesson.file.name.rsplit("/", 1)[-1])})


def session_json(s, user, include_link=False):
    now = timezone.now()
    data = {
        "id": str(s.id), "title": s.title, "description_html": render_markdown(s.description),
        "starts_at": s.starts_at, "ends_at": s.ends_at, "duration_minutes": s.duration_minutes,
        "platform": s.platform, "join_state": join_state(s, now),
        "course": {"slug": s.course.slug, "title": s.course.title},
        "recording": resolve_video(s.recording_url) if s.recording_published and s.recording_url else None,
        "recording_pending": bool(s.ends_at < now and not s.recording_published),
    }
    rec = s.attendance.filter(user=user).first()
    data["my_attendance"] = rec.status if rec else None
    return data


class CourseLiveView(APIView):
    def get(self, request, slug):
        course = _course_for_learner(request, slug)
        now = timezone.now()
        sessions = list(course.live_sessions.all().order_by("starts_at"))
        upcoming = [session_json(s, request.user) for s in sessions if s.ends_at >= now]
        past = [session_json(s, request.user) for s in reversed(sessions) if s.ends_at < now]
        return Response({"upcoming": upcoming, "past": past, "attendance": attendance_summary(request.user, course),
                         "min_attendance_percent": course.min_attendance_percent})


def _session(request, pk):
    session = get_object_or_404(LiveSession.objects.select_related("course"), pk=pk)
    require_course_access(request.user, session.course)
    return session


class SessionDetailView(APIView):
    def get(self, request, pk):
        session = _session(request, pk)
        data = session_json(session, request.user)
        data["attendance"] = attendance_summary(request.user, session.course)
        data["min_attendance_percent"] = session.course.min_attendance_percent
        return Response(data)


class SessionJoinView(APIView):
    def post(self, request, pk):
        return Response({"join_url": join_session(request.user, _session(request, pk), request=request)})


class SessionIcsView(APIView):
    def get(self, request, pk):
        session = _session(request, pk)
        resp = HttpResponse(session_ics(session), content_type="text/calendar; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="hikmah-{session.id}.ics"'
        return resp


class CourseGradesView(APIView):
    def get(self, request, slug):
        from apps.assessments.models import Assignment, Quiz
        from apps.assessments.services import assignment_state, quiz_summary

        course = _course_for_learner(request, slug)
        quizzes = []
        for q in Quiz.objects.filter(course=course, status=PublishStatus.PUBLISHED).order_by("order"):
            s = quiz_summary(request.user, q)
            quizzes.append({"id": str(q.id), "title": q.title, "pass_percent": q.pass_percent, "required": q.required, **s})
        assignments = []
        for a in Assignment.objects.filter(course=course, status=PublishStatus.PUBLISHED).order_by("order"):
            st = assignment_state(request.user, a)
            sub = st["submission"]
            assignments.append({"id": str(a.id), "title": a.title, "required": a.required, "max_score": str(a.max_score),
                                "pass_score": str(a.pass_score), "status": st["status"], "passed": st["passed"],
                                "score": str(sub.score) if sub and sub.score is not None else None})
        return Response({"completion": completion_status(request.user, course), "quizzes": quizzes,
                         "assignments": assignments, "attendance": attendance_summary(request.user, course)})
