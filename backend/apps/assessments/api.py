from datetime import timedelta

from django.conf import settings
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.files import secure_url
from apps.core.services import NotAllowed, render_markdown
from apps.courses.models import PublishStatus
from apps.courses.services import is_course_staff
from apps.enrollments.services import require_course_access

from .models import Assignment, Question, Quiz, QuizAttempt, Submission
from .services import (
    answers_visible,
    finalize_if_expired,
    quiz_summary,
    quiz_window_state,
    save_answer,
    start_attempt,
    submit_assignment,
    submit_attempt,
)


def _quiz(request, pk):
    quiz = get_object_or_404(Quiz.objects.select_related("course"), pk=pk)
    require_course_access(request.user, quiz.course)
    if quiz.status != PublishStatus.PUBLISHED and not is_course_staff(request.user, quiz.course):
        raise Http404
    return quiz


def attempt_brief(a):
    return {"id": str(a.id), "number": a.number, "status": a.status, "started_at": a.started_at,
            "submitted_at": a.submitted_at, "percent": float(a.percent) if a.percent is not None else None,
            "auto_submitted": a.auto_submitted}


class QuizDetailView(APIView):
    def get(self, request, pk):
        quiz = _quiz(request, pk)
        for a in quiz.attempts.filter(user=request.user, status=QuizAttempt.IN_PROGRESS):
            finalize_if_expired(a)
        return Response({
            "id": str(quiz.id), "title": quiz.title, "instructions_html": render_markdown(quiz.instructions),
            "course": {"slug": quiz.course.slug, "title": quiz.course.title},
            "question_count": quiz.questions.count(), "time_limit_minutes": quiz.time_limit_minutes,
            "pass_percent": quiz.pass_percent, "max_attempts": quiz.max_attempts, "score_policy": quiz.score_policy,
            "opens_at": quiz.opens_at, "closes_at": quiz.closes_at, "window": quiz_window_state(quiz),
            "summary": quiz_summary(request.user, quiz),
            "attempts": [attempt_brief(a) for a in quiz.attempts.filter(user=request.user).order_by("number")],
        })


class StartAttemptView(APIView):
    def post(self, request, pk):
        attempt = start_attempt(request.user, _quiz(request, pk))
        return Response(attempt_brief(attempt), status=201)


def _attempt(request, pk):
    attempt = get_object_or_404(QuizAttempt.objects.select_related("quiz__course"), pk=pk)
    if attempt.user_id != request.user.id:
        raise Http404
    return attempt


class AttemptView(APIView):
    def get(self, request, pk):
        attempt = _attempt(request, pk)
        finalize_if_expired(attempt)
        attempt.refresh_from_db()
        questions = {q.id: q for q in attempt.quiz.questions.prefetch_related("choices")}
        order = [qid for qid in attempt.question_order if qid in questions] or list(questions)
        answers = {a.question_id: a for a in attempt.answers.prefetch_related("selected_choices")}
        out = []
        for qid in order:
            q = questions[qid]
            choices = list(q.choices.all())
            custom = attempt.choice_order.get(str(q.id))
            if custom:
                pos = {cid: i for i, cid in enumerate(custom)}
                choices.sort(key=lambda c: pos.get(c.id, 999))
            ans = answers.get(qid)
            out.append({
                "id": q.id, "kind": q.kind, "text": q.text, "points": float(q.points),
                "choices": [{"id": c.id, "text": c.text} for c in choices] if q.kind != Question.SHORT else [],
                "answer": {"choice_ids": [c.id for c in ans.selected_choices.all()], "text": ans.text} if ans else None,
            })
        return Response({
            "id": str(attempt.id), "number": attempt.number, "status": attempt.status,
            "quiz": {"id": str(attempt.quiz.id), "title": attempt.quiz.title, "course_slug": attempt.quiz.course.slug},
            "started_at": attempt.started_at, "deadline_at": attempt.deadline_at, "server_now": timezone.now(),
            "questions": out,
        })


class SaveAnswerView(APIView):
    parser_classes = [JSONParser]

    def put(self, request, pk, question_id):
        attempt = _attempt(request, pk)
        ids = request.data.get("choice_ids") or []
        if not isinstance(ids, list):
            ids = [ids]
        save_answer(attempt, request.user, question_id, ids, request.data.get("text", ""))
        return Response({"saved_at": timezone.now(), "deadline_at": attempt.deadline_at})


def result_json(attempt):
    quiz = attempt.quiz
    data = {
        "id": str(attempt.id), "status": attempt.status, "number": attempt.number,
        "quiz": {"id": str(quiz.id), "title": quiz.title, "course_slug": quiz.course.slug, "pass_percent": quiz.pass_percent},
        "score": float(attempt.score) if attempt.score is not None else None,
        "max_score": float(attempt.max_score) if attempt.max_score is not None else None,
        "percent": float(attempt.percent) if attempt.percent is not None else None,
        "passed": attempt.status == QuizAttempt.SUBMITTED and attempt.percent is not None and attempt.percent >= quiz.pass_percent,
        "needs_grading": attempt.status == QuizAttempt.NEEDS_GRADING,
        "auto_submitted": attempt.auto_submitted,
        "duration_seconds": int((attempt.submitted_at - attempt.started_at).total_seconds()) if attempt.submitted_at else None,
        "answers_visible": answers_visible(attempt),
        "review": [],
    }
    if data["answers_visible"]:
        answers = {a.question_id: a for a in attempt.answers.prefetch_related("selected_choices")}
        for q in quiz.questions.prefetch_related("choices"):
            a = answers.get(q.id)
            data["review"].append({
                "question_id": q.id, "text": q.text, "kind": q.kind,
                "choices": [{"id": c.id, "text": c.text, "is_correct": c.is_correct} for c in q.choices.all()],
                "your_choice_ids": [c.id for c in a.selected_choices.all()] if a else [],
                "your_text": a.text if a else "",
                "is_correct": a.is_correct if a else False,
                "points_awarded": float(a.points_awarded) if a and a.points_awarded is not None else None,
                "points": float(q.points), "feedback": a.feedback if a else "",
            })
    return data


class SubmitAttemptView(APIView):
    def post(self, request, pk):
        attempt = _attempt(request, pk)
        # Client timers hitting zero send auto=true; only honoured once the server deadline is (nearly) reached.
        auto = bool(request.data.get("auto")) and bool(attempt.deadline_at) and timezone.now() >= attempt.deadline_at - timedelta(seconds=5)
        attempt = submit_attempt(attempt, request.user, auto=auto)
        return Response(result_json(attempt))


class AttemptResultView(APIView):
    def get(self, request, pk):
        attempt = _attempt(request, pk)
        finalize_if_expired(attempt)
        attempt.refresh_from_db()
        if attempt.status == QuizAttempt.IN_PROGRESS:
            raise NotAllowed("Submit the attempt first.", "in_progress")
        return Response(result_json(attempt))


def _assignment(request, pk):
    a = get_object_or_404(Assignment.objects.select_related("course"), pk=pk)
    require_course_access(request.user, a.course)
    if a.status != PublishStatus.PUBLISHED and not is_course_staff(request.user, a.course):
        raise Http404
    return a


def submission_json(s):
    if not s:
        return None
    return {"id": str(s.id), "status": s.status, "text": s.text, "file_name": s.file_name or None,
            "submitted_at": s.submitted_at, "is_late": s.is_late,
            "score": float(s.score) if s.score is not None and s.status == Submission.GRADED else None,
            "feedback": s.feedback if s.status in (Submission.GRADED, Submission.RESUBMIT) else "",
            "graded_at": s.graded_at if s.status == Submission.GRADED else None,
            "passed": s.passed}


class AssignmentView(APIView):
    def get(self, request, pk):
        a = _assignment(request, pk)
        sub = Submission.objects.filter(assignment=a, user=request.user).first()
        now = timezone.now()
        return Response({
            "id": str(a.id), "title": a.title, "instructions_html": render_markdown(a.instructions),
            "course": {"slug": a.course.slug, "title": a.course.title},
            "due_at": a.due_at, "allow_late": a.allow_late, "max_score": float(a.max_score), "pass_score": float(a.pass_score),
            "attachment": {"name": a.attachment.name.rsplit("/", 1)[-1]} if a.attachment else None,
            "past_due": bool(a.due_at and now > a.due_at),
            "can_submit": (not sub or sub.status != Submission.GRADED) and (not a.due_at or now <= a.due_at or a.allow_late),
            "allowed_types": settings.ALLOWED_DOCUMENT_TYPES, "max_upload_mb": settings.MAX_UPLOAD_MB,
            "submission": submission_json(sub),
        })


class AssignmentAttachmentView(APIView):
    def get(self, request, pk):
        a = _assignment(request, pk)
        if not a.attachment:
            raise Http404
        return Response({"url": secure_url(a.attachment, a.attachment.name.rsplit("/", 1)[-1])})


class AssignmentSubmitView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "uploads"

    def post(self, request, pk):
        sub = submit_assignment(request.user, _assignment(request, pk), request.data.get("text", ""),
                                request.FILES.get("file"), request=request)
        return Response(submission_json(sub), status=201)


class SubmissionFileView(APIView):
    def get(self, request, pk):
        sub = get_object_or_404(Submission.objects.select_related("assignment__course"), pk=pk)
        if sub.user_id != request.user.id and not is_course_staff(request.user, sub.assignment.course):
            raise Http404
        if not sub.file:
            raise Http404
        return Response({"url": secure_url(sub.file, sub.file_name or None)})
