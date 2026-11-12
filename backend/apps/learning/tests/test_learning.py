from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.services import ServiceError
from apps.courses.video import resolve_video
from apps.learning.services import course_outline, course_progress, lesson_availability, mark_complete
from conftest import (
    CourseFactory,
    LessonFactory,
    ModuleFactory,
    QuizFactory,
    add_mcq,
    enroll_active,
    make_student,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(student):
    course = CourseFactory()
    m1 = ModuleFactory(course=course, order=1)
    l1 = LessonFactory(module=m1, order=1)
    l2 = LessonFactory(module=m1, order=2, prerequisite_lesson=l1)
    enroll_active(student, course)
    return course, m1, l1, l2


def test_non_enrolled_cannot_open_lesson(setup):
    course, m1, l1, _ = setup
    ok, reason = lesson_availability(make_student(), l1)
    assert not ok and reason["code"] == "not_enrolled"


def test_prerequisite_lesson_locks_until_complete(student, setup):
    _, _, l1, l2 = setup
    ok, reason = lesson_availability(student, l2)
    assert not ok and reason["code"] == "prerequisite" and reason["lesson_id"] == str(l1.id)
    with pytest.raises(ServiceError):
        mark_complete(student, l2)
    mark_complete(student, l1)
    assert lesson_availability(student, l2)[0]


def test_release_date_lock(student, setup):
    course, m1, _, _ = setup
    future = LessonFactory(module=m1, release_at=timezone.now() + timedelta(days=2))
    ok, reason = lesson_availability(student, future)
    assert not ok and reason["code"] == "not_released" and reason["release_at"]


def test_module_release_and_draft_hidden(student, setup):
    course, *_ = setup
    m2 = ModuleFactory(course=course, order=2, release_at=timezone.now() + timedelta(days=1))
    gated = LessonFactory(module=m2)
    assert lesson_availability(student, gated)[1]["code"] == "not_released"
    draft = LessonFactory(module=m2, status="draft")
    outline = course_outline(student, course)
    ids = [i["id"] for m in outline["modules"] for i in m["items"]]
    assert str(draft.id) not in ids


def test_quiz_score_prerequisite(student, setup):
    course, m1, _, _ = setup
    quiz = QuizFactory(course=course, module=m1)
    add_mcq(quiz)
    gated = LessonFactory(module=m1, prerequisite_quiz=quiz, prerequisite_min_percent=60)
    ok, reason = lesson_availability(student, gated)
    assert not ok and reason["code"] == "quiz_score"


def test_progress_counts_required_lessons_only(student, setup):
    course, m1, l1, l2 = setup
    LessonFactory(module=m1, required=False)
    assert course_progress(student, course)["percent"] == 0
    mark_complete(student, l1)
    p = course_progress(student, course)
    assert p == {"completed": 1, "total": 2, "percent": 50}
    mark_complete(student, l1)  # idempotent
    assert course_progress(student, course)["completed"] == 1


def test_outline_merges_lessons_quizzes_assignments_in_order(student, setup):
    course, m1, l1, l2 = setup
    QuizFactory(course=course, module=m1, order=5)
    outline = course_outline(student, course)
    kinds = [i["type"] for i in outline["modules"][0]["items"]]
    assert kinds.count("lesson") == 2 and "quiz" in kinds
    assert outline["progress"]["total"] == 2


@pytest.mark.parametrize(
    "url,provider",
    [
        ("https://youtu.be/dQw4w9WgXcQ", "youtube"),
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "youtube"),
        ("https://vimeo.com/123456789", "vimeo"),
        ("https://cdn.example.com/a.mp4", "file"),
        ("https://example.com/page", "link"),
    ],
)
def test_video_adapter(url, provider):
    assert resolve_video(url)["provider"] == provider


def test_youtube_embed_uses_nocookie():
    assert resolve_video("https://youtu.be/dQw4w9WgXcQ")["embed_url"].startswith("https://www.youtube-nocookie.com/embed/")
