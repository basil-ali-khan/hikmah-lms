from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from freezegun import freeze_time

from apps.assessments.models import Answer, QuizAttempt, Submission
from apps.assessments.services import (
    grade_answer,
    grade_submission,
    quiz_best_percent,
    quiz_passed,
    save_answer,
    start_attempt,
    submit_assignment,
    submit_attempt,
)
from apps.core.services import ServiceError
from apps.notifications.models import Notification
from conftest import (
    AssignmentFactory,
    CourseFactory,
    QuizFactory,
    add_mcq,
    enroll_active,
    make_instructor,
    make_student,
    pdf_upload,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def quiz_setup(student):
    course = CourseFactory()
    enroll_active(student, course)
    quiz = QuizFactory(course=course, time_limit_minutes=20, max_attempts=2)
    q1, c1 = add_mcq(quiz, "Q1", correct_index=1)
    q2, c2 = add_mcq(quiz, "Q2", correct_index=0)
    return course, quiz, (q1, c1), (q2, c2)


def test_start_attempt_sets_server_deadline(student, quiz_setup):
    _, quiz, *_ = quiz_setup
    with freeze_time("2026-11-11 10:00:00"):
        a = start_attempt(student, quiz)
    assert a.deadline_at.isoformat().startswith("2026-11-11T10:20")
    assert a.number == 1


def test_deadline_capped_by_quiz_close(student, quiz_setup):
    _, quiz, *_ = quiz_setup
    quiz.closes_at = timezone.now() + timedelta(minutes=5)
    quiz.save()
    a = start_attempt(student, quiz)
    assert a.deadline_at == quiz.closes_at


def test_resume_existing_attempt(student, quiz_setup):
    _, quiz, *_ = quiz_setup
    assert start_attempt(student, quiz).pk == start_attempt(student, quiz).pk


def test_autosave_and_autograde(student, quiz_setup):
    _, quiz, (q1, c1), (q2, c2) = quiz_setup
    a = start_attempt(student, quiz)
    save_answer(a, student, q1.id, [c1[1].id])
    save_answer(a, student, q2.id, [c2[2].id])
    save_answer(a, student, q2.id, [c2[0].id])  # changed answer overwrites
    a = submit_attempt(a, student)
    assert a.status == QuizAttempt.SUBMITTED
    assert a.percent == Decimal("100.00")
    assert quiz_passed(student, quiz)


def test_cannot_answer_with_other_questions_choice(student, quiz_setup):
    _, quiz, (q1, c1), (q2, c2) = quiz_setup
    a = start_attempt(student, quiz)
    with pytest.raises(ServiceError):
        save_answer(a, student, q1.id, [c2[0].id])


def test_single_choice_only_one(student, quiz_setup):
    _, quiz, (q1, c1), _ = quiz_setup
    a = start_attempt(student, quiz)
    with pytest.raises(ServiceError):
        save_answer(a, student, q1.id, [c1[0].id, c1[1].id])


def test_answers_after_deadline_rejected_and_auto_submitted(student, quiz_setup):
    _, quiz, (q1, c1), _ = quiz_setup
    a = start_attempt(student, quiz)
    save_answer(a, student, q1.id, [c1[1].id])
    with freeze_time(a.deadline_at + timedelta(seconds=30)):
        with pytest.raises(ServiceError) as exc:
            save_answer(a, student, q1.id, [c1[0].id])
        assert exc.value.code == "time_up"
    a.refresh_from_db()
    assert a.status != QuizAttempt.IN_PROGRESS and a.auto_submitted
    assert a.percent == Decimal("50.00")  # saved answer kept


def test_attempt_limit(student, quiz_setup):
    _, quiz, *_ = quiz_setup
    submit_attempt(start_attempt(student, quiz), student)
    submit_attempt(start_attempt(student, quiz), student)
    with pytest.raises(ServiceError) as exc:
        start_attempt(student, quiz)
    assert exc.value.code == "no_attempts_left"


def test_best_score_policy(student, quiz_setup):
    _, quiz, (q1, c1), _ = quiz_setup
    a1 = start_attempt(student, quiz)
    save_answer(a1, student, q1.id, [c1[1].id])
    submit_attempt(a1, student)
    submit_attempt(start_attempt(student, quiz), student)
    assert quiz_best_percent(student, quiz) == Decimal("50.00")
    quiz.score_policy = "latest"
    quiz.save()
    assert quiz_best_percent(student, quiz) == Decimal("0.00")


def test_closed_quiz(student, quiz_setup):
    _, quiz, *_ = quiz_setup
    quiz.closes_at = timezone.now() - timedelta(minutes=1)
    quiz.save()
    with pytest.raises(ServiceError) as exc:
        start_attempt(student, quiz)
    assert exc.value.code == "quiz_closed"


def test_not_enrolled_cannot_start(quiz_setup):
    _, quiz, *_ = quiz_setup
    with pytest.raises(ServiceError):
        start_attempt(make_student(), quiz)


def test_other_student_cannot_touch_attempt(student, quiz_setup):
    _, quiz, (q1, c1), _ = quiz_setup
    a = start_attempt(student, quiz)
    with pytest.raises(ServiceError):
        save_answer(a, make_student(), q1.id, [c1[1].id])


def test_short_answer_needs_grading_then_scores(student):
    course = CourseFactory()
    enroll_active(student, course)
    quiz = QuizFactory(course=course, max_attempts=1)
    q1, c1 = add_mcq(quiz, correct_index=0)
    from apps.assessments.models import Question

    q2 = Question.objects.create(quiz=quiz, kind="short", text="Explain", points=Decimal("3"), order=5)
    a = start_attempt(student, quiz)
    save_answer(a, student, q1.id, [c1[0].id])
    save_answer(a, student, q2.id, [], text="My explanation")
    a = submit_attempt(a, student)
    assert a.status == QuizAttempt.NEEDS_GRADING
    teacher = make_instructor(course)
    grade_answer(Answer.objects.get(attempt=a, question=q2), Decimal("2"), "Good", teacher)
    a.refresh_from_db()
    assert a.status == QuizAttempt.SUBMITTED and a.percent == Decimal("75.00")
    with pytest.raises(ServiceError):
        grade_answer(Answer.objects.get(attempt=a, question=q2), Decimal("9"), "", teacher)


def test_assignment_submit_resubmit_and_grade(student):
    course = CourseFactory()
    enroll_active(student, course)
    assignment = AssignmentFactory(course=course)
    sub = submit_assignment(student, assignment, "first", pdf_upload())
    sub2 = submit_assignment(student, assignment, "second", None)
    assert sub.pk == sub2.pk and sub2.text == "second" and sub2.file
    teacher = make_instructor(course)
    grade_submission(sub2, Decimal("17"), "Well done", teacher)
    sub2.refresh_from_db()
    assert sub2.status == Submission.GRADED and sub2.passed
    assert Notification.objects.filter(user=student, event="assignment_graded").exists()
    with pytest.raises(ServiceError):
        submit_assignment(student, assignment, "after grading", None)
    with pytest.raises(ServiceError):
        grade_submission(sub2, Decimal("25"), "", teacher)


def test_late_submission_rules(student):
    course = CourseFactory()
    enroll_active(student, course)
    late_ok = AssignmentFactory(course=course, due_at=timezone.now() - timedelta(hours=1), allow_late=True)
    assert submit_assignment(student, late_ok, "x", None).is_late
    no_late = AssignmentFactory(course=course, due_at=timezone.now() - timedelta(hours=1), allow_late=False)
    with pytest.raises(ServiceError):
        submit_assignment(student, no_late, "x", None)


def test_empty_submission_rejected(student):
    course = CourseFactory()
    enroll_active(student, course)
    with pytest.raises(ServiceError):
        submit_assignment(student, AssignmentFactory(course=course), "  ", None)


def test_instructor_of_other_course_cannot_grade(student):
    course = CourseFactory()
    enroll_active(student, course)
    sub = submit_assignment(student, AssignmentFactory(course=course), "x", None)
    with pytest.raises(ServiceError):
        grade_submission(sub, Decimal("10"), "", make_instructor(CourseFactory()))
