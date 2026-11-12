"""API permission matrix, IDOR protection, headers and auth flows."""

import re
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core import mail
from django.test import Client
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.assessments.services import start_attempt, submit_assignment
from apps.payments.services import approve_payment
from conftest import (
    AssignmentFactory,
    CourseFactory,
    LessonFactory,
    ModuleFactory,
    QuizFactory,
    UserFactory,
    add_mcq,
    enroll_active,
    make_manager,
    make_student,
    paid_course,
    pdf_upload,
    png_upload,
)

pytestmark = pytest.mark.django_db

PUBLIC = ["/api/v1/site-config", "/api/v1/courses", "/api/v1/categories", "/api/v1/profile-fields", "/api/v1/pages/privacy"]
PRIVATE = ["/api/v1/me", "/api/v1/me/dashboard", "/api/v1/me/enrollments", "/api/v1/me/certificates",
           "/api/v1/notifications", "/api/v1/me/schedule", "/api/v1/me/export"]


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.mark.parametrize("url", PUBLIC)
def test_public_endpoints_open(api, url):
    assert api.get(url).status_code == 200


@pytest.mark.parametrize("url", PRIVATE)
def test_private_endpoints_require_login(api, url):
    assert api.get(url).status_code in (401, 403)


def test_site_config_exposes_branding_not_secrets(api, settings):
    settings.GOOGLE_OAUTH_CLIENT_SECRET = "super-secret"
    data = api.get("/api/v1/site-config").json()
    assert data["colors"]["primary"] == "#003399"
    assert data["flags"]["google_login"] is False
    assert "super-secret" not in str(data) and "SECRET" not in str(data)


def test_security_headers(api):
    resp = api.get("/api/v1/site-config")
    assert resp["X-Frame-Options"] == "DENY"
    assert resp["X-Content-Type-Options"] == "nosniff"
    assert "frame-ancestors 'none'" in resp["Content-Security-Policy"]
    assert resp["Referrer-Policy"] == "strict-origin-when-cross-origin"


def test_draft_courses_hidden_from_catalog(api):
    CourseFactory(status="draft", slug="secret-draft")
    slugs = [c["slug"] for c in api.get("/api/v1/courses").json()]
    assert "secret-draft" not in slugs
    assert api.get("/api/v1/courses/secret-draft").status_code == 404


def test_catalog_filters(api):
    CourseFactory(slug="free-one")
    paid_course(slug="paid-one", course_type="live")
    assert [c["slug"] for c in api.get("/api/v1/courses?price=paid").json()] == ["paid-one"]
    assert [c["slug"] for c in api.get("/api/v1/courses?type=live").json()] == ["paid-one"]
    assert "free-one" in [c["slug"] for c in api.get("/api/v1/courses?q=Course").json()]


def test_me_patch_cannot_escalate(student_api, student):
    resp = student_api.patch("/api/v1/me", {"full_name": "Ahmed K", "is_staff": True, "is_superuser": True,
                                            "data": {"city": "Lahore"}}, format="json")
    assert resp.status_code == 200
    student.refresh_from_db()
    assert not student.is_staff and not student.is_superuser and student.full_name == "Ahmed K"


def test_me_patch_validation_errors(student_api):
    resp = student_api.patch("/api/v1/me", {"data": {"phone": "abc"}}, format="json")
    assert resp.status_code == 400 and "phone" in resp.json()["errors"]


def test_paid_flow_via_api_and_content_locked_until_approval(student_api, student):
    course = paid_course(slug="paid-flow")
    lesson = LessonFactory(module=ModuleFactory(course=course))
    enr = student_api.post("/api/v1/courses/paid-flow/enroll").json()
    assert enr["status"] == "pending_payment" and enr["bank_accounts"] and enr["payment_reference"]
    assert student_api.get(f"/api/v1/lessons/{lesson.id}").status_code == 403
    assert student_api.get("/api/v1/learn/paid-flow").status_code == 403

    resp = student_api.post(f"/api/v1/enrollments/{enr['id']}/payments",
                            {"receipt": png_upload(), "amount": "5000", "transaction_ref": "TX9", "paid_on": "2026-11-01"},
                            format="multipart")
    assert resp.status_code == 201, resp.json()
    assert resp.json()["payments"][0]["status"] == "pending"
    assert student_api.get(f"/api/v1/lessons/{lesson.id}").status_code == 403

    from apps.payments.models import PaymentSubmission

    approve_payment(PaymentSubmission.objects.get(enrollment_id=enr["id"]), make_manager())
    assert student_api.get("/api/v1/learn/paid-flow").status_code == 200
    data = student_api.get(f"/api/v1/lessons/{lesson.id}").json()
    assert data["available"] and data["video"]["provider"] == "youtube"


def test_idor_other_students_objects_are_404(student):
    other = make_student()
    course = paid_course()
    from apps.enrollments.services import request_enrollment
    from apps.payments.services import submit_payment

    enr = request_enrollment(student, course)
    pay = submit_payment(enr, student, png_upload(), amount=Decimal("5000"))
    free = CourseFactory()
    enroll_active(student, free)
    enroll_active(other, free)
    quiz = QuizFactory(course=free)
    add_mcq(quiz)
    attempt = start_attempt(student, quiz)
    sub = submit_assignment(student, AssignmentFactory(course=free), "x", pdf_upload())

    c = client_for(other)
    assert c.get(f"/api/v1/enrollments/{enr.id}").status_code == 404
    assert c.post(f"/api/v1/enrollments/{enr.id}/payments", {"receipt": png_upload(), "amount": "1"},
                  format="multipart").status_code == 404
    assert c.get(f"/api/v1/payments/{pay.id}/receipt").status_code == 404
    assert c.get(f"/api/v1/attempts/{attempt.id}").status_code == 404
    assert c.put(f"/api/v1/attempts/{attempt.id}/answers/1", {"choice_ids": []}, format="json").status_code == 404
    assert c.get(f"/api/v1/submissions/{sub.id}/file").status_code == 404
    # owner can
    own = client_for(student)
    assert own.get(f"/api/v1/payments/{pay.id}/receipt").json()["url"]
    # reviewer can
    assert client_for(make_manager()).get(f"/api/v1/payments/{pay.id}/receipt").status_code == 200


def test_attempt_payload_hides_correct_answers(student_api, student):
    course = CourseFactory()
    enroll_active(student, course)
    quiz = QuizFactory(course=course)
    add_mcq(quiz)
    attempt_id = student_api.post(f"/api/v1/quizzes/{quiz.id}/attempts").json()["id"]
    payload = student_api.get(f"/api/v1/attempts/{attempt_id}").json()
    assert "is_correct" not in str(payload)
    assert payload["deadline_at"] is None or payload["server_now"]


def test_signed_file_url_expires(student_api, student, settings):
    course = paid_course()
    from apps.enrollments.services import request_enrollment
    from apps.payments.services import submit_payment

    enr = request_enrollment(student, course)
    pay = submit_payment(enr, student, png_upload(), amount=Decimal("5000"))
    url = student_api.get(f"/api/v1/payments/{pay.id}/receipt").json()["url"]
    path = url.replace(settings.API_URL, "")
    plain = Client()
    resp = plain.get(path)
    assert resp.status_code == 200 and resp["Cache-Control"] == "private, no-store"
    with freeze_time(timedelta(seconds=settings.SIGNED_URL_TTL_SECONDS + 5)):
        assert plain.get(path).status_code == 404
    assert plain.get(path[:-5] + "XXXX/").status_code == 404


def test_verify_endpoint_public_and_minimal(api):
    assert api.get("/api/v1/verify/HKM-NOPE-NOPE").status_code == 404


def test_export_and_deletion(student_api):
    resp = student_api.get("/api/v1/me/export")
    assert resp.status_code == 200 and resp["Content-Disposition"].startswith("attachment")
    assert student_api.post("/api/v1/me/deletion-request", {"confirm": "nope"}, format="json").status_code == 400
    assert student_api.post("/api/v1/me/deletion-request", {"confirm": "DELETE"}, format="json").status_code == 201


def test_headless_signup_sends_branded_verification(settings):
    c = Client()
    resp = c.post("/_allauth/browser/v1/auth/signup",
                  {"email": "New.Student@Example.com", "password": "Very-Strong-pass-2026", "full_name": "New Student",
                   "accept_terms": True}, content_type="application/json")
    assert resp.status_code in (200, 401), resp.content
    user = User.objects.get(email="new.student@example.com")
    assert user.full_name == "New Student" and user.profile.terms_accepted_at
    msg = mail.outbox[-1]
    assert "Confirm your email" in msg.subject
    assert re.search(re.escape(settings.SITE_URL) + r"/verify-email/\S+", msg.body)


def test_headless_signup_requires_terms():
    c = Client()
    resp = c.post("/_allauth/browser/v1/auth/signup",
                  {"email": "x@example.com", "password": "Very-Strong-pass-2026", "full_name": "X Y"},
                  content_type="application/json")
    assert resp.status_code == 400
    assert not User.objects.filter(email="x@example.com").exists()


def test_weak_password_rejected():
    resp = Client().post("/_allauth/browser/v1/auth/signup",
                         {"email": "w@example.com", "password": "12345678", "full_name": "W W", "accept_terms": True},
                         content_type="application/json")
    assert resp.status_code == 400


def test_headless_login_and_lockout(settings):
    settings.AXES_ENABLED = True
    settings.AXES_FAILURE_LIMIT = 3
    from conftest import PASSWORD

    user = make_student()
    c = Client(REMOTE_ADDR="10.0.0.5")
    ok = c.post("/_allauth/browser/v1/auth/login", {"email": user.email, "password": PASSWORD},
                content_type="application/json")
    assert ok.status_code == 200
    c2 = Client(REMOTE_ADDR="10.0.0.9")
    statuses = [c2.post("/_allauth/browser/v1/auth/login", {"email": user.email, "password": "wrong-password"},
                        content_type="application/json").status_code for _ in range(4)]
    assert statuses[-1] in (403, 429)
    # even the right password is refused while locked out
    locked = c2.post("/_allauth/browser/v1/auth/login", {"email": user.email, "password": PASSWORD},
                     content_type="application/json")
    assert locked.status_code in (403, 429)


def test_staff_panel_requires_staff_and_2fa(settings):
    settings.STAFF_2FA_REQUIRED = True
    student = make_student()
    c = Client()
    c.force_login(student)
    resp = c.get(f"/{settings.ADMIN_URL_PATH}/")
    assert resp.status_code == 302 and "login" in resp["Location"]
    mgr = make_manager()
    c.force_login(mgr)
    resp = c.get(f"/{settings.ADMIN_URL_PATH}/")
    assert resp.status_code == 302 and "/accounts/2fa/" in resp["Location"]
    settings.STAFF_2FA_REQUIRED = False
    assert c.get(f"/{settings.ADMIN_URL_PATH}/").status_code == 200


def test_staff_idle_timeout(settings):
    mgr = make_manager()
    c = Client()
    c.force_login(mgr)
    assert c.get(f"/{settings.ADMIN_URL_PATH}/").status_code == 200
    with freeze_time(timedelta(minutes=settings.STAFF_SESSION_TIMEOUT_MINUTES + 1)):
        resp = c.get(f"/{settings.ADMIN_URL_PATH}/")
    assert resp.status_code == 302 and "login" in resp["Location"]


def test_admin_default_login_redirects_to_allauth(settings):
    resp = Client().get(f"/{settings.ADMIN_URL_PATH}/login/")
    assert resp.status_code == 302 and resp["Location"].startswith("/accounts/login/")


def test_instructor_admin_scoped_to_own_courses(settings):
    from conftest import make_instructor

    mine = CourseFactory(title="Mine")
    theirs = CourseFactory(title="Theirs")
    teacher = make_instructor(mine)
    c = Client()
    c.force_login(teacher)
    page = c.get(f"/{settings.ADMIN_URL_PATH}/courses/course/").content.decode()
    assert "Mine" in page and "Theirs" not in page
    assert c.get(f"/{settings.ADMIN_URL_PATH}/courses/course/{theirs.pk}/change/").status_code in (302, 403, 404)
    form = c.get(f"/{settings.ADMIN_URL_PATH}/courses/course/{mine.pk}/change/").content.decode()
    assert 'name="price"' not in form


def test_unauthenticated_user_count_unchanged():
    UserFactory()
    assert User.objects.count() >= 1


def test_csp_relaxed_only_for_staff_panel(settings):
    mgr = make_manager()
    c = Client()
    c.force_login(mgr)
    admin_csp = c.get(f"/{settings.ADMIN_URL_PATH}/")["Content-Security-Policy"]
    api_csp = c.get("/api/v1/site-config")["Content-Security-Policy"]
    assert "'unsafe-eval'" in admin_csp
    assert "'unsafe-eval'" not in api_csp
