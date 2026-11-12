"""Quizzes (server-enforced timers, autosave, auto-grading) and assignments."""

import random
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.core.files import validate_upload
from apps.core.services import NotAllowed, ServiceError, audit
from apps.courses.models import PublishStatus
from apps.courses.services import is_course_staff
from apps.enrollments.services import require_course_access

from .models import Answer, Choice, Question, Quiz, QuizAttempt, Submission

A = QuizAttempt
GRACE = timedelta(seconds=5)  # network latency allowance on the last autosave
TWO = Decimal("0.01")


def _pct(score, max_score):
    if not max_score:
        return Decimal("0.00")
    return (Decimal(score) * 100 / Decimal(max_score)).quantize(TWO, rounding=ROUND_HALF_UP)


# --- quizzes ------------------------------------------------------------------


def quiz_window_state(quiz, now=None):
    now = now or timezone.now()
    if quiz.opens_at and now < quiz.opens_at:
        return "not_open"
    if quiz.closes_at and now > quiz.closes_at:
        return "closed"
    return "open"


def finalize_if_expired(attempt):
    """Auto-submit an in-progress attempt whose deadline passed. Commits on its own."""
    if attempt.status == A.IN_PROGRESS and attempt.deadline_at and timezone.now() > attempt.deadline_at + GRACE:
        with transaction.atomic():
            _grade_and_close(attempt, auto=True)
        return True
    return False


def attempts_used(user, quiz):
    return quiz.attempts.filter(user=user).count()


@transaction.atomic
def start_attempt(user, quiz):
    require_course_access(user, quiz.course)
    if quiz.status != PublishStatus.PUBLISHED:
        raise NotAllowed("This quiz isn't available.", "not_found")
    for open_attempt in quiz.attempts.filter(user=user, status=A.IN_PROGRESS):
        if not finalize_if_expired(open_attempt):
            return open_attempt
    state = quiz_window_state(quiz)
    if state == "not_open":
        raise ServiceError("This quiz hasn't opened yet.", "quiz_not_open")
    if state == "closed":
        raise ServiceError("This quiz has closed.", "quiz_closed")
    used = attempts_used(user, quiz)
    if used >= quiz.max_attempts:
        raise ServiceError("You've used all your attempts.", "no_attempts_left")
    if not quiz.questions.exists():
        raise ServiceError("This quiz has no questions yet.", "empty_quiz")

    now = timezone.now()
    deadline = now + timedelta(minutes=quiz.time_limit_minutes) if quiz.time_limit_minutes else None
    if quiz.closes_at and (deadline is None or quiz.closes_at < deadline):
        deadline = quiz.closes_at
    question_ids = list(quiz.questions.order_by("order", "id").values_list("id", flat=True))
    if quiz.shuffle_questions:
        random.shuffle(question_ids)
    choice_order = {}
    if quiz.shuffle_choices:
        for q in quiz.questions.prefetch_related("choices"):
            ids = [c.id for c in q.choices.all()]
            random.shuffle(ids)
            choice_order[str(q.id)] = ids
    return A.objects.create(quiz=quiz, user=user, number=used + 1, deadline_at=deadline,
                            question_order=question_ids, choice_order=choice_order)


def _own_attempt(attempt, user):
    if attempt.user_id != user.id:
        raise NotAllowed("This isn't your attempt.")


def save_answer(attempt, user, question_id, choice_ids=None, text=""):
    _own_attempt(attempt, user)
    if finalize_if_expired(attempt):
        raise ServiceError("Time's up — your attempt was submitted with the answers you saved.", "time_up")
    if attempt.status != A.IN_PROGRESS:
        raise ServiceError("This attempt has already been submitted.", "already_submitted")
    with transaction.atomic():
        question = Question.objects.filter(quiz=attempt.quiz, pk=question_id).first()
        if question is None:
            raise ServiceError("Unknown question.", "invalid_question")
        choice_ids = [int(c) for c in (choice_ids or [])]
        if question.kind == Question.SHORT:
            choice_ids = []
            text = (text or "")[:5000]
        else:
            text = ""
            if question.kind == Question.SINGLE and len(choice_ids) > 1:
                raise ServiceError("Choose only one answer.", "single_choice")
            valid = set(Choice.objects.filter(question=question, pk__in=choice_ids).values_list("id", flat=True))
            if valid != set(choice_ids):
                raise ServiceError("Invalid answer option.", "invalid_choice")
        answer, _ = Answer.objects.get_or_create(attempt=attempt, question=question)
        answer.text = text
        answer.save()
        answer.selected_choices.set(choice_ids)
    return answer


def _grade_and_close(attempt, auto=False):
    attempt = A.objects.select_for_update().get(pk=attempt.pk)
    if attempt.status != A.IN_PROGRESS:
        return attempt
    answers = {a.question_id: a for a in attempt.answers.prefetch_related("selected_choices")}
    score = Decimal("0")
    max_score = Decimal("0")
    pending = False
    for question in attempt.quiz.questions.prefetch_related("choices"):
        max_score += question.points
        answer = answers.get(question.id)
        if question.kind == Question.SHORT:
            if answer and answer.text.strip():
                pending = True
                answer.points_awarded = None
                answer.is_correct = None
                answer.save()
            elif answer:
                answer.points_awarded = Decimal("0")
                answer.is_correct = False
                answer.save()
            continue
        correct = {c.id for c in question.choices.all() if c.is_correct}
        chosen = {c.id for c in answer.selected_choices.all()} if answer else set()
        is_correct = bool(chosen) and chosen == correct
        if answer:
            answer.is_correct = is_correct
            answer.points_awarded = question.points if is_correct else Decimal("0")
            answer.save()
        if is_correct:
            score += question.points
    attempt.score = score
    attempt.max_score = max_score
    attempt.percent = _pct(score, max_score)
    attempt.submitted_at = timezone.now()
    attempt.auto_submitted = auto
    attempt.status = A.NEEDS_GRADING if pending else A.SUBMITTED
    attempt.save()
    if not pending:
        _after_quiz_change(attempt.user, attempt.quiz)
    return attempt


def submit_attempt(attempt, user, auto=False):
    _own_attempt(attempt, user)
    with transaction.atomic():
        return _grade_and_close(attempt, auto=auto)


def _recompute(attempt):
    answers = attempt.answers.select_related("question")
    pending = any(a.question.kind == Question.SHORT and a.points_awarded is None for a in answers)
    score = sum((a.points_awarded or Decimal("0")) for a in answers)
    attempt.score = score
    attempt.percent = _pct(score, attempt.max_score)
    attempt.status = A.NEEDS_GRADING if pending else A.SUBMITTED
    attempt.save()
    if not pending:
        _after_quiz_change(attempt.user, attempt.quiz)


@transaction.atomic
def grade_answer(answer, points, feedback, actor, request=None):
    attempt = answer.attempt
    if not is_course_staff(actor, attempt.quiz.course):
        raise NotAllowed("Only this course's instructors can grade.")
    if answer.question.kind != Question.SHORT:
        raise ServiceError("Only short answers are graded by hand.", "invalid")
    points = Decimal(str(points))
    if points < 0 or points > answer.question.points:
        raise ServiceError(f"Points must be between 0 and {answer.question.points}.", "invalid_points")
    previous = answer.points_awarded
    answer.points_awarded = points
    answer.is_correct = points == answer.question.points
    answer.feedback = feedback or ""
    answer.graded_by = actor
    answer.graded_at = timezone.now()
    answer.save()
    audit(actor, "grade.short_answer", answer, {"from": str(previous) if previous is not None else None, "to": str(points)},
          request=request, object_repr=f"{attempt.user} · {attempt.quiz.title}")
    _recompute(attempt)
    return answer


def graded_attempts(user, quiz):
    return quiz.attempts.filter(user=user, status=A.SUBMITTED).order_by("submitted_at")


def quiz_best_percent(user, quiz):
    attempts = list(graded_attempts(user, quiz))
    if not attempts:
        return None
    if quiz.score_policy == Quiz.LATEST:
        return attempts[-1].percent
    return max(a.percent for a in attempts)


def quiz_passed(user, quiz):
    best = quiz_best_percent(user, quiz)
    return best is not None and best >= quiz.pass_percent


def quiz_summary(user, quiz):
    best = quiz_best_percent(user, quiz)
    attempts = list(quiz.attempts.filter(user=user))
    in_progress = next((a for a in attempts if a.status == A.IN_PROGRESS), None)
    return {
        "attempts_used": len(attempts),
        "attempts_left": max(quiz.max_attempts - len(attempts), 0),
        "best_percent": float(best) if best is not None else None,
        "passed": best is not None and best >= quiz.pass_percent,
        "needs_grading": any(a.status == A.NEEDS_GRADING for a in attempts),
        "in_progress_attempt": str(in_progress.id) if in_progress else None,
    }


def answers_visible(attempt):
    quiz = attempt.quiz
    if attempt.status == A.IN_PROGRESS:
        return False
    if quiz.show_answers == Quiz.SHOW_IMMEDIATELY:
        return True
    if quiz.show_answers == Quiz.SHOW_AFTER_CLOSE:
        return bool(quiz.closes_at and timezone.now() > quiz.closes_at) or (
            attempts_used(attempt.user, quiz) >= quiz.max_attempts and not quiz.closes_at
        )
    return False


def _after_quiz_change(user, quiz):
    from apps.certificates.services import maybe_issue_certificate

    maybe_issue_certificate(user, quiz.course)


# --- assignments --------------------------------------------------------------


def assignment_state(user, assignment):
    sub = Submission.objects.filter(assignment=assignment, user=user).first()
    if not sub:
        return {"status": "not_submitted", "passed": False, "submission": None}
    return {"status": sub.status, "passed": sub.passed, "submission": sub}


@transaction.atomic
def submit_assignment(user, assignment, text="", file=None, request=None):
    require_course_access(user, assignment.course)
    if assignment.status != PublishStatus.PUBLISHED:
        raise NotAllowed("This assignment isn't available.", "not_found")
    now = timezone.now()
    late = bool(assignment.due_at and now > assignment.due_at)
    if late and not assignment.allow_late:
        raise ServiceError("The deadline has passed and late submissions aren't accepted.", "deadline_passed")
    sub = Submission.objects.select_for_update().filter(assignment=assignment, user=user).first()
    if sub and sub.status == Submission.GRADED:
        raise ServiceError("This assignment has already been graded.", "already_graded")
    text = (text or "").strip()[:20000]
    if not text and not file and not (sub and sub.file):
        raise ServiceError("Write an answer or attach a file.", "empty_submission")
    if file:
        validate_upload(file, allowed_types=settings.ALLOWED_DOCUMENT_TYPES)
    if sub is None:
        sub = Submission(assignment=assignment, user=user, submitted_at=now)
    sub.text = text
    sub.submitted_at = now
    sub.is_late = late
    sub.status = Submission.SUBMITTED
    if file:
        sub.file_name = str(file.name)[:200]
        sub.file.save(file.name, file, save=False)
    sub.save()
    audit(user, "assignment.submit", sub, {"late": late}, request=request)
    return sub


@transaction.atomic
def grade_submission(sub, score, feedback, actor, request=None):
    if not is_course_staff(actor, sub.assignment.course):
        raise NotAllowed("Only this course's instructors can grade.")
    score = Decimal(str(score))
    if score < 0 or score > sub.assignment.max_score:
        raise ServiceError(f"Score must be between 0 and {sub.assignment.max_score}.", "invalid_score")
    previous = sub.score
    sub.score = score
    sub.feedback = feedback or ""
    sub.status = Submission.GRADED
    sub.graded_by = actor
    sub.graded_at = timezone.now()
    sub.save()
    audit(actor, "grade.assignment", sub, {"from": str(previous) if previous is not None else None, "to": str(score)},
          request=request)
    from apps.notifications.models import Event
    from apps.notifications.services import notify

    a = sub.assignment
    notify(sub.user, Event.ASSIGNMENT_GRADED, {
        "course": {"title": a.course.title}, "assignment": {"title": a.title, "max_score": f"{a.max_score:g}"},
        "submission": {"score": f"{score:g}"},
    }, link=f"/learn/{a.course.slug}/assignments/{a.id}")
    from apps.certificates.services import maybe_issue_certificate

    maybe_issue_certificate(sub.user, a.course)
    return sub


@transaction.atomic
def request_assignment_resubmission(sub, feedback, actor, request=None):
    if not is_course_staff(actor, sub.assignment.course):
        raise NotAllowed("Only this course's instructors can do this.")
    if not (feedback or "").strip():
        raise ServiceError("Tell the student what to change.", "feedback_required")
    sub.status = Submission.RESUBMIT
    sub.feedback = feedback
    sub.graded_by = actor
    sub.graded_at = timezone.now()
    sub.save()
    audit(actor, "grade.resubmit_requested", sub, request=request)
    return sub
