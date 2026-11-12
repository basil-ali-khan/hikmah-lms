"""Shared pytest fixtures and factories."""

from datetime import timedelta
from decimal import Decimal

import factory
import pytest
from allauth.account.models import EmailAddress
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

PASSWORD = "Test-Passw0rd-2026!"

# Smallest valid PNG / PDF payloads so content-type sniffing passes.
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)
PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def png_upload(name="receipt.png", payload=b""):
    return SimpleUploadedFile(name, PNG_BYTES + payload, content_type="image/png")


def pdf_upload(name="answer.pdf"):
    return SimpleUploadedFile(name, PDF_BYTES, content_type="application/pdf")


@pytest.fixture(autouse=True)
def _test_settings(settings, tmp_path):
    settings.Q_CLUSTER = {**settings.Q_CLUSTER, "sync": True}
    settings.PWNED_PASSWORD_CHECK = False
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.STAFF_2FA_REQUIRED = False
    settings.AXES_ENABLED = False
    settings.STORAGE_BACKEND = "local"
    settings.MEDIA_ROOT = tmp_path
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage", "OPTIONS": {"location": str(tmp_path / "private")}},
        "public": {"BACKEND": "django.core.files.storage.FileSystemStorage", "OPTIONS": {"location": str(tmp_path / "public")}},
    }
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_CLASSES": [],
    }
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def defaults(db):
    from apps.core.bootstrap import ensure_defaults

    ensure_defaults()


# --- factories ----------------------------------------------------------------


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "accounts.User"
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Sequence(lambda n: f"Test User {n}")
    password = factory.PostGenerationMethodCall("set_password", PASSWORD)

    @factory.post_generation
    def _save(obj, create, extracted, **kwargs):
        if create:
            obj.save()


def make_student(verified=True, complete=True, gender="Male", **kwargs):
    user = UserFactory(**kwargs)
    EmailAddress.objects.create(user=user, email=user.email, verified=verified, primary=True)
    if complete:
        profile = user.profile
        profile.data = {
            "phone": "+92 300 0000000",
            "date_of_birth": "1995-01-01",
            "gender": gender,
            "country": "PK",
            "city": "Karachi",
        }
        now = timezone.now()
        profile.privacy_consent_at = now
        profile.terms_accepted_at = now
        profile.completed_at = now
        profile.save()
    return user


def make_manager():
    from django.contrib.auth.models import Group

    user = UserFactory(is_staff=True)
    user.groups.add(Group.objects.get(name="Course Manager"))
    return user


def make_instructor(*courses):
    from apps.courses.services import assign_instructor

    user = UserFactory(is_staff=True)
    for course in courses:
        assign_instructor(course, user)
    return user


class CourseFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "courses.Course"

    title = factory.Sequence(lambda n: f"Course {n}")
    slug = factory.Sequence(lambda n: f"course-{n}")
    status = "published"
    course_type = "recorded"
    price = Decimal("0")
    currency = "PKR"


def paid_course(**kwargs):
    from apps.payments.models import BankAccount

    course = CourseFactory(price=Decimal("5000"), currency="PKR", **kwargs)
    account = BankAccount.objects.create(
        display_name="Test Bank · PKR", currency="PKR", account_title="Hikmah Institute",
        bank_name="Test Bank", account_number="PK00TEST0000000000000000",
    )
    course.bank_accounts.add(account)
    return course


class ModuleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "courses.Module"

    course = factory.SubFactory(CourseFactory)
    title = factory.Sequence(lambda n: f"Module {n}")
    order = factory.Sequence(lambda n: n)


class LessonFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "courses.Lesson"

    module = factory.SubFactory(ModuleFactory)
    title = factory.Sequence(lambda n: f"Lesson {n}")
    kind = "video"
    video_url = "https://youtu.be/dQw4w9WgXcQ"
    order = factory.Sequence(lambda n: n)


class LiveSessionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "live.LiveSession"

    course = factory.SubFactory(CourseFactory)
    title = factory.Sequence(lambda n: f"Session {n}")
    starts_at = factory.LazyFunction(lambda: timezone.now() + timedelta(days=1))
    duration_minutes = 60
    join_url = "https://zoom.us/j/123456789"


class QuizFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "assessments.Quiz"

    course = factory.SubFactory(CourseFactory)
    title = factory.Sequence(lambda n: f"Quiz {n}")
    pass_percent = 60
    max_attempts = 2


def add_mcq(quiz, text="Q?", correct_index=0, n=3, points=1, kind="single"):
    from apps.assessments.models import Choice, Question

    q = Question.objects.create(quiz=quiz, kind=kind, text=text, points=Decimal(points), order=quiz.questions.count())
    choices = [Choice.objects.create(question=q, text=f"Option {i}", is_correct=(i == correct_index), order=i) for i in range(n)]
    return q, choices


class AssignmentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "assessments.Assignment"

    course = factory.SubFactory(CourseFactory)
    title = factory.Sequence(lambda n: f"Assignment {n}")
    max_score = Decimal("20")
    pass_score = Decimal("12")
    due_at = factory.LazyFunction(lambda: timezone.now() + timedelta(days=5))


def enroll_active(user, course):
    from apps.enrollments.services import activate, request_enrollment

    enrollment = request_enrollment(user, course)
    if enrollment.status != "active":
        activate(enrollment, actor=None, note="test")
    enrollment.refresh_from_db()
    return enrollment


@pytest.fixture
def student(db):
    return make_student()


@pytest.fixture
def manager(db):
    return make_manager()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def student_api(student):
    client = APIClient()
    client.force_authenticate(student)
    client.user = student
    return client
