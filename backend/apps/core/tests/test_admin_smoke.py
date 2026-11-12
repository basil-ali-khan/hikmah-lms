"""Every staff-panel list and edit page renders for each role (catches broken admin config)."""

import pytest
from django.contrib import admin
from django.core.management import call_command
from django.test import Client
from django.urls import reverse

from apps.accounts.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def seeded(settings):
    settings.DEBUG = True
    settings.DEV_SEED_ALLOWED = True
    call_command("seed_dev")


def _login(email):
    c = Client()
    c.force_login(User.objects.get(email=email))
    return c


@pytest.mark.parametrize("email", ["superadmin@hikmah.test", "manager@hikmah.test", "instructor1@hikmah.test"])
def test_every_admin_page_renders(seeded, email):
    c = _login(email)
    assert c.get(reverse("admin:index")).status_code == 200
    user = User.objects.get(email=email)
    for model, model_admin in admin.site._registry.items():
        meta = model._meta
        if not model_admin.has_view_permission(type("R", (), {"user": user})()):
            continue
        url = reverse(f"admin:{meta.app_label}_{meta.model_name}_changelist")
        resp = c.get(url, follow=True)
        assert resp.status_code == 200, (url, resp.status_code)
        obj = model_admin.get_queryset(type("R", (), {"user": user, "GET": {}})()).first() if hasattr(model_admin, "get_queryset") else None
        if obj is not None:
            change = reverse(f"admin:{meta.app_label}_{meta.model_name}_change", args=[obj.pk])
            resp = c.get(change, follow=True)
            assert resp.status_code == 200, (change, resp.status_code)


def test_manager_approves_payment_through_admin(seeded):
    from apps.enrollments.models import Enrollment
    from apps.payments.models import PaymentSubmission

    c = _login("manager@hikmah.test")
    sub = PaymentSubmission.objects.get(enrollment__user__email="student.pending@hikmah.test")
    url = reverse("admin:payments_paymentsubmission_change", args=[sub.pk])
    page = c.get(url).content.decode()
    assert "Approve &amp; unlock course" in page and "Payment receipt" in page
    resp = c.post(url, {"decision": "approve", "decision_remarks": "Matched"}, follow=True)
    assert resp.status_code == 200
    sub.refresh_from_db()
    assert sub.status == "approved"
    assert Enrollment.objects.get(pk=sub.enrollment_id).status == "active"


def test_instructor_grades_submission_through_admin(seeded):
    from apps.assessments.models import Submission

    sub = Submission.objects.get(user__email="student.active@hikmah.test")
    c = _login("instructor1@hikmah.test")
    url = reverse("admin:assessments_submission_change", args=[sub.pk])
    resp = c.post(url, {"grade": "15", "feedback_text": "Good work"}, follow=True)
    assert resp.status_code == 200
    sub.refresh_from_db()
    assert sub.status == "graded" and sub.score == 15
    # instructor2 doesn't teach this course
    c2 = _login("instructor2@hikmah.test")
    assert c2.get(url).status_code in (302, 403, 404)


def test_seed_refuses_without_debug(settings):
    from django.core.management.base import CommandError

    settings.DEBUG = False
    with pytest.raises(CommandError):
        call_command("seed_dev")
