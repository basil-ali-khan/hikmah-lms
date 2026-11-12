from datetime import timedelta
from decimal import Decimal

import pytest
from django.core import mail
from django.utils import timezone

from apps.assessments.services import (
    grade_submission,
    save_answer,
    start_attempt,
    submit_assignment,
    submit_attempt,
)
from apps.certificates.models import Certificate
from apps.certificates.services import (
    completion_status,
    maybe_issue_certificate,
    render_certificate_pdf,
    revoke_certificate,
    verify,
)
from apps.core.services import ServiceError
from apps.learning.services import mark_complete
from apps.live.services import set_attendance
from conftest import (
    AssignmentFactory,
    CourseFactory,
    LessonFactory,
    LiveSessionFactory,
    ModuleFactory,
    QuizFactory,
    add_mcq,
    enroll_active,
    make_instructor,
    make_manager,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def full_course(student):
    course = CourseFactory(min_attendance_percent=50)
    m = ModuleFactory(course=course)
    lessons = [LessonFactory(module=m), LessonFactory(module=m)]
    quiz = QuizFactory(course=course, module=m)
    q, choices = add_mcq(quiz, correct_index=0)
    assignment = AssignmentFactory(course=course, module=m)
    session = LiveSessionFactory(course=course, starts_at=timezone.now() - timedelta(days=1))
    enroll_active(student, course)
    teacher = make_instructor(course)
    return course, lessons, (quiz, q, choices), assignment, session, teacher


def _complete_everything(student, full_course, attend="present"):
    course, lessons, (quiz, q, choices), assignment, session, teacher = full_course
    for lesson in lessons:
        mark_complete(student, lesson)
    a = start_attempt(student, quiz)
    save_answer(a, student, q.id, [choices[0].id])
    submit_attempt(a, student)
    set_attendance(session, student, attend, teacher)
    sub = submit_assignment(student, assignment, "done", None)
    grade_submission(sub, Decimal("18"), "", teacher)


def test_requirements_listed_and_incomplete(student, full_course):
    course = full_course[0]
    status = completion_status(student, course)
    assert not status["complete"]
    keys = {r["key"] for r in status["requirements"]}
    assert keys == {"lessons", "quizzes", "assignments", "attendance"}
    assert maybe_issue_certificate(student, course) is None


def test_certificate_issued_automatically_once(student, full_course):
    _complete_everything(student, full_course)
    course = full_course[0]
    cert = Certificate.objects.get(user=student, course=course)
    assert cert.code.startswith("HKM-") and cert.pdf
    assert cert.student_name == student.full_name
    assert maybe_issue_certificate(student, course).pk == cert.pk
    assert Certificate.objects.filter(user=student).count() == 1
    assert any("certificate" in m.subject.lower() for m in mail.outbox)


def test_attendance_requirement_blocks(student, full_course):
    _complete_everything(student, full_course, attend="absent")
    assert not Certificate.objects.filter(user=student).exists()
    att = next(r for r in completion_status(student, full_course[0])["requirements"] if r["key"] == "attendance")
    assert att["met"] is False


def test_failed_assignment_blocks(student, full_course):
    course, lessons, (quiz, q, choices), assignment, session, teacher = full_course
    for lesson in lessons:
        mark_complete(student, lesson)
    a = start_attempt(student, quiz)
    save_answer(a, student, q.id, [choices[0].id])
    submit_attempt(a, student)
    set_attendance(session, student, "present", teacher)
    sub = submit_assignment(student, assignment, "done", None)
    grade_submission(sub, Decimal("5"), "", teacher)
    assert not Certificate.objects.filter(user=student).exists()


def test_course_without_certificate(student):
    course = CourseFactory(issue_certificate=False)
    LessonFactory(module=ModuleFactory(course=course))
    enroll_active(student, course)
    mark_complete(student, course.modules.first().lessons.first())
    assert not Certificate.objects.filter(user=student).exists()


def test_verify_and_revoke(student, full_course):
    _complete_everything(student, full_course)
    cert = Certificate.objects.get(user=student)
    data = verify(cert.code.lower())
    assert data["status"] == "valid"
    assert set(data) == {"status", "code", "student_name", "course_title", "completed_on", "issued_by", "revoked_at"}
    with pytest.raises(ServiceError):
        revoke_certificate(cert, make_manager(), "")
    revoke_certificate(cert, make_manager(), "Academic misconduct")
    assert verify(cert.code)["status"] == "revoked"
    assert verify("HKM-NOPE-NOPE") is None


def test_pdf_renders(student, full_course):
    _complete_everything(student, full_course)
    pdf = render_certificate_pdf(Certificate.objects.get(user=student))
    assert pdf[:4] == b"%PDF" and len(pdf) > 1000
