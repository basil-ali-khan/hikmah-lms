"""Lesson availability (release dates, prerequisites), progress and the course outline."""

from django.utils import timezone

from apps.core.services import NotAllowed, ServiceError
from apps.courses.models import Lesson, PublishStatus
from apps.courses.services import is_course_staff
from apps.enrollments.services import has_course_access

from .models import LessonProgress

PUB = PublishStatus.PUBLISHED


def required_lessons(course):
    return Lesson.objects.filter(module__course=course, module__status=PUB, status=PUB, required=True)


def completed_ids(user, course):
    return set(
        LessonProgress.objects.filter(user=user, lesson__module__course=course).values_list("lesson_id", flat=True)
    )


def _release_at(lesson):
    dates = [d for d in (lesson.module.release_at, lesson.release_at) if d]
    return max(dates) if dates else None


def lesson_availability(user, lesson, _completed=None):
    """Returns (available, reason). reason is None when available."""
    course = lesson.module.course
    if lesson.status != PUB or lesson.module.status != PUB:
        return False, {"code": "not_found", "message": "This lesson isn't available."}
    if not has_course_access(user, course):
        return False, {"code": "not_enrolled", "message": "Enroll in this course to open lessons."}
    if is_course_staff(user, course):
        return True, None
    release = _release_at(lesson)
    if release and release > timezone.now():
        return False, {"code": "not_released", "message": "Not available yet.", "release_at": release.isoformat()}
    if lesson.prerequisite_lesson_id:
        done = _completed if _completed is not None else completed_ids(user, course)
        if lesson.prerequisite_lesson_id not in done:
            prereq = lesson.prerequisite_lesson
            return False, {"code": "prerequisite", "message": f"Complete “{prereq.title}” first.",
                           "lesson_id": str(prereq.id), "title": prereq.title}
    if lesson.prerequisite_quiz_id:
        from apps.assessments.services import quiz_best_percent

        need = lesson.prerequisite_min_percent or lesson.prerequisite_quiz.pass_percent
        best = quiz_best_percent(user, lesson.prerequisite_quiz)
        if best is None or best < need:
            return False, {"code": "quiz_score", "message": f"Score at least {need}% in “{lesson.prerequisite_quiz.title}” to unlock.",
                           "quiz_id": str(lesson.prerequisite_quiz_id), "title": lesson.prerequisite_quiz.title, "min_percent": need}
    return True, None


def require_lesson(user, lesson):
    ok, reason = lesson_availability(user, lesson)
    if not ok:
        if reason["code"] in ("not_enrolled", "not_found"):
            raise NotAllowed(reason["message"], reason["code"])
        raise ServiceError(reason["message"], reason["code"])


def mark_complete(user, lesson):
    require_lesson(user, lesson)
    LessonProgress.objects.get_or_create(user=user, lesson=lesson)
    from apps.certificates.services import maybe_issue_certificate

    maybe_issue_certificate(user, lesson.module.course)
    return course_progress(user, lesson.module.course)


def course_progress(user, course):
    req = list(required_lessons(course).values_list("id", flat=True))
    done = completed_ids(user, course)
    completed = len([i for i in req if i in done])
    total = len(req)
    return {"completed": completed, "total": total, "percent": round(100 * completed / total) if total else 0}


def next_lesson(user, course):
    done = completed_ids(user, course)
    lessons = Lesson.objects.filter(module__course=course, module__status=PUB, status=PUB).select_related(
        "module", "prerequisite_lesson", "prerequisite_quiz").order_by("module__order", "order")
    for lesson in lessons:
        if lesson.id not in done and lesson_availability(user, lesson, done)[0]:
            return lesson
    return None


def course_outline(user, course):
    """Modules → ordered items (lessons, quizzes, assignments) with lock/completion state."""
    from apps.assessments.models import Assignment, Quiz
    from apps.assessments.services import assignment_state, quiz_summary

    done = completed_ids(user, course)
    now = timezone.now()
    modules = []
    staff = is_course_staff(user, course)
    for module in course.modules.filter(status=PUB).order_by("order", "id"):
        module_locked = bool(module.release_at and module.release_at > now and not staff)
        items = []
        for lesson in module.lessons.filter(status=PUB).select_related("prerequisite_lesson", "prerequisite_quiz", "module"):
            ok, reason = lesson_availability(user, lesson, done)
            items.append({
                "type": "lesson", "id": str(lesson.id), "title": lesson.title, "kind": lesson.kind,
                "duration_minutes": lesson.duration_minutes, "required": lesson.required, "order": lesson.order,
                "completed": lesson.id in done, "locked": not ok, "lock_reason": reason,
            })
        for quiz in Quiz.objects.filter(module=module, status=PUB):
            summary = quiz_summary(user, quiz)
            items.append({"type": "quiz", "id": str(quiz.id), "title": quiz.title, "required": quiz.required,
                          "order": quiz.order, "completed": bool(summary["passed"]), "locked": module_locked,
                          "lock_reason": None, "best_percent": summary["best_percent"], "passed": summary["passed"],
                          "closes_at": quiz.closes_at.isoformat() if quiz.closes_at else None})
        for assignment in Assignment.objects.filter(module=module, status=PUB):
            state = assignment_state(user, assignment)
            items.append({"type": "assignment", "id": str(assignment.id), "title": assignment.title,
                          "required": assignment.required, "order": assignment.order,
                          "completed": state["status"] == "graded" and state["passed"], "locked": module_locked,
                          "lock_reason": None, "due_at": assignment.due_at.isoformat() if assignment.due_at else None,
                          "submission_status": state["status"]})
        items.sort(key=lambda i: (i["order"], i["type"] != "lesson"))
        modules.append({
            "id": module.id, "title": module.title, "locked": module_locked,
            "release_at": module.release_at.isoformat() if module.release_at else None,
            "items": items,
            "completed_count": sum(1 for i in items if i["completed"]),
        })
    return {"modules": modules, "progress": course_progress(user, course)}
