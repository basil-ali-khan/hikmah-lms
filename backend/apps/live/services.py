from datetime import UTC, timedelta

from django.db import transaction
from django.utils import timezone

from apps.core.models import SiteSettings
from apps.core.services import NotAllowed, ServiceError, audit
from apps.courses.services import is_course_staff
from apps.enrollments.models import Enrollment
from apps.enrollments.services import require_course_access

from .models import AttendanceRecord, LiveSession

ATTENDED = (AttendanceRecord.PRESENT, AttendanceRecord.LATE)


def join_window_opens(session):
    return session.starts_at - timedelta(minutes=SiteSettings.load().join_window_minutes)


def join_state(session, now=None):
    now = now or timezone.now()
    if now < join_window_opens(session):
        return "upcoming"
    if now > session.ends_at:
        return "ended"
    return "open"


def join_session(user, session, request=None):
    require_course_access(user, session.course)
    state = join_state(session)
    if state == "upcoming":
        raise ServiceError("Joining opens shortly before the class starts.", "too_early")
    if state == "ended":
        raise ServiceError("This class has ended.", "ended")
    if not is_course_staff(user, session.course):
        record, _ = AttendanceRecord.objects.get_or_create(session=session, user=user)
        if not record.join_clicked_at:
            record.join_clicked_at = timezone.now()
            record.save(update_fields=["join_clicked_at", "updated_at"])
    return session.join_url


@transaction.atomic
def set_attendance(session, student, status, actor, request=None):
    if status not in dict(AttendanceRecord.STATUSES):
        raise ServiceError("Unknown attendance status.", "invalid")
    if actor is not None and not is_course_staff(actor, session.course):
        raise NotAllowed("Only this course's instructors can mark attendance.")
    record, _ = AttendanceRecord.objects.select_for_update().get_or_create(session=session, user=student)
    previous = record.status
    if previous == status:
        return record
    record.status = status
    record.updated_by = actor
    record.save()
    audit(actor, "attendance.edit", record, {"from": previous or None, "to": status, "student": student.email},
          request=request, object_repr=f"{session.title} · {student}")
    from apps.certificates.services import maybe_issue_certificate

    maybe_issue_certificate(student, session.course)
    return record


def attendance_summary(user, course):
    now = timezone.now()
    sessions = [s for s in course.live_sessions.filter(counts_for_attendance=True, starts_at__lt=now) if s.ends_at <= now]
    total = len(sessions)
    attended = AttendanceRecord.objects.filter(
        user=user, session__in=sessions, status__in=ATTENDED).count() if total else 0
    return {"attended": attended, "total": total, "percent": round(100 * attended / total) if total else None}


@transaction.atomic
def publish_recording(session, actor, request=None):
    if actor is not None and not is_course_staff(actor, session.course):
        raise NotAllowed("Only this course's instructors can publish recordings.")
    if not session.recording_url:
        raise ServiceError("Add the recording URL first.", "recording_missing")
    if session.recording_published:
        return session
    session.recording_published = True
    session.recording_published_at = timezone.now()
    session.save(update_fields=["recording_published", "recording_published_at"])
    audit(actor, "recording.publish", session, request=request)
    from apps.notifications.models import Event
    from apps.notifications.services import notify

    students = Enrollment.objects.filter(course=session.course, status=Enrollment.ACTIVE).select_related("user")
    for e in students:
        if e.is_currently_active:
            notify(e.user, Event.NEW_RECORDING, {"course": {"title": session.course.title}, "session": {"title": session.title}},
                   link=f"/learn/{session.course.slug}/live")
    return session


def upcoming_sessions_for(user, limit=20):
    now = timezone.now()
    course_ids = [e.course_id for e in Enrollment.objects.filter(user=user, status=Enrollment.ACTIVE) if e.is_currently_active]
    return (LiveSession.objects.filter(course_id__in=course_ids, starts_at__gte=now - timedelta(hours=3))
            .select_related("course").order_by("starts_at"))[:limit]


def _ics_escape(text):
    return (text or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def session_ics(session, site_url=None):
    """Calendar file. Deliberately excludes the meeting link (it can be forwarded); links to the class page."""
    from django.conf import settings

    fmt = "%Y%m%dT%H%M%SZ"
    page = f"{site_url or settings.SITE_URL}/learn/{session.course.slug}/live"
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hikmah Online//LMS//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{session.id}@hikmah-online",
        f"DTSTAMP:{timezone.now().strftime(fmt)}",
        f"DTSTART:{session.starts_at.astimezone(UTC).strftime(fmt)}",
        f"DTEND:{session.ends_at.astimezone(UTC).strftime(fmt)}",
        f"SUMMARY:{_ics_escape(session.course.title + ' · ' + session.title)}",
        f"DESCRIPTION:{_ics_escape('Join from the class page: ' + page)}",
        f"URL:{page}",
        "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:Class starting soon", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"
