from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone
from freezegun import freeze_time

from apps.core.models import AuditLog
from apps.core.services import ServiceError
from apps.live.models import AttendanceRecord
from apps.live.services import (
    attendance_summary,
    join_session,
    publish_recording,
    session_ics,
    set_attendance,
)
from apps.notifications.models import Notification
from conftest import CourseFactory, LiveSessionFactory, enroll_active, make_instructor, make_student

pytestmark = pytest.mark.django_db


@pytest.fixture
def course_with_session(student):
    course = CourseFactory(course_type="live")
    enroll_active(student, course)
    session = LiveSessionFactory(course=course, starts_at=timezone.now() + timedelta(minutes=10))
    return course, session


def test_join_window_and_logging(student, course_with_session):
    course, session = course_with_session
    url = join_session(student, session)
    assert url == session.join_url
    rec = AttendanceRecord.objects.get(session=session, user=student)
    assert rec.join_clicked_at and rec.status == ""


def test_join_too_early(student):
    course = CourseFactory()
    enroll_active(student, course)
    session = LiveSessionFactory(course=course, starts_at=timezone.now() + timedelta(hours=3))
    with pytest.raises(ServiceError) as exc:
        join_session(student, session)
    assert exc.value.code == "too_early"


def test_join_after_end(student):
    course = CourseFactory()
    enroll_active(student, course)
    session = LiveSessionFactory(course=course, starts_at=timezone.now() - timedelta(hours=3))
    with pytest.raises(ServiceError) as exc:
        join_session(student, session)
    assert exc.value.code == "ended"


def test_non_enrolled_cannot_join(course_with_session):
    _, session = course_with_session
    with pytest.raises(ServiceError):
        join_session(make_student(), session)


def test_attendance_set_by_instructor_is_audited(student, course_with_session):
    course, session = course_with_session
    teacher = make_instructor(course)
    set_attendance(session, student, "present", teacher)
    set_attendance(session, student, "late", teacher)
    rec = AttendanceRecord.objects.get(session=session, user=student)
    assert rec.status == "late" and rec.updated_by == teacher
    log = AuditLog.objects.filter(action="attendance.edit").first()
    assert log.details == {"from": "present", "to": "late", "student": student.email}


def test_other_instructor_cannot_mark(student, course_with_session):
    _, session = course_with_session
    with pytest.raises(ServiceError):
        set_attendance(session, student, "present", make_instructor(CourseFactory()))


def test_attendance_percent_counts_ended_sessions(student):
    course = CourseFactory()
    enroll_active(student, course)
    teacher = make_instructor(course)
    past = [LiveSessionFactory(course=course, starts_at=timezone.now() - timedelta(days=d)) for d in (1, 2, 3, 4)]
    LiveSessionFactory(course=course)  # future: not counted
    for s, status in zip(past, ["present", "late", "absent", "present"], strict=True):
        set_attendance(s, student, status, teacher)
    assert attendance_summary(student, course) == {"attended": 3, "total": 4, "percent": 75}


def test_publish_recording_notifies_enrolled(student, course_with_session):
    course, session = course_with_session
    session.recording_url = "https://youtu.be/dQw4w9WgXcQ"
    session.save()
    publish_recording(session, make_instructor(course))
    session.refresh_from_db()
    assert session.recording_published
    assert Notification.objects.filter(user=student, event="new_recording").exists()
    assert any("recording" in m.subject.lower() for m in mail.outbox)


def test_publish_requires_url(course_with_session):
    course, session = course_with_session
    with pytest.raises(ServiceError):
        publish_recording(session, make_instructor(course))


def test_ics_has_no_join_link(course_with_session):
    _, session = course_with_session
    ics = session_ics(session)
    assert "BEGIN:VEVENT" in ics and session.join_url not in ics


def test_join_url_works_inside_window_boundary(student):
    course = CourseFactory()
    enroll_active(student, course)
    start = timezone.now() + timedelta(hours=1)
    session = LiveSessionFactory(course=course, starts_at=start)
    with freeze_time(start - timedelta(minutes=14)):
        assert join_session(student, session)
