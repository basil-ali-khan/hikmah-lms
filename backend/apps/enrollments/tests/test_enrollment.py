from datetime import timedelta

import pytest
from django.utils import timezone
from freezegun import freeze_time

from apps.core.models import AuditLog, EligibilityRule
from apps.core.services import ServiceError
from apps.enrollments.models import Enrollment
from apps.enrollments.services import (
    activate,
    approve_request,
    enrollment_state,
    expire_due_enrollments,
    extend_access,
    has_course_access,
    reject_request,
    request_enrollment,
    revoke,
)
from conftest import CourseFactory, UserFactory, make_instructor, make_manager, make_student, paid_course

pytestmark = pytest.mark.django_db


def test_free_instant_course_enrolls_immediately(student):
    course = CourseFactory()
    e = request_enrollment(student, course)
    assert e.status == Enrollment.ACTIVE
    assert has_course_access(student, course)


def test_free_approval_course_waits(student):
    course = CourseFactory(enrollment_mode="approval")
    e = request_enrollment(student, course)
    assert e.status == Enrollment.PENDING_APPROVAL
    assert not has_course_access(student, course)


def test_paid_course_waits_for_payment(student):
    course = paid_course()
    e = request_enrollment(student, course)
    assert e.status == Enrollment.PENDING_PAYMENT
    assert e.payment_reference.startswith("HKM-")
    assert not has_course_access(student, course)


def test_request_is_idempotent(student):
    course = paid_course()
    a = request_enrollment(student, course)
    b = request_enrollment(student, course)
    assert a.pk == b.pk


def test_unverified_email_blocked():
    user = make_student(verified=False)
    with pytest.raises(ServiceError) as exc:
        request_enrollment(user, CourseFactory())
    assert exc.value.code == "email_unverified"


def test_incomplete_profile_blocked():
    user = make_student(complete=False)
    with pytest.raises(ServiceError) as exc:
        request_enrollment(user, CourseFactory())
    assert exc.value.code == "profile_incomplete"


def test_draft_course_blocked(student):
    with pytest.raises(ServiceError) as exc:
        request_enrollment(student, CourseFactory(status="draft"))
    assert exc.value.code == "not_available"


def test_enrollment_window(student):
    course = CourseFactory(enrollment_closes_at=timezone.now() - timedelta(days=1))
    with pytest.raises(ServiceError) as exc:
        request_enrollment(student, course)
    assert exc.value.code == "enrollment_closed"
    course2 = CourseFactory(enrollment_opens_at=timezone.now() + timedelta(days=1))
    with pytest.raises(ServiceError):
        request_enrollment(student, course2)


def test_eligibility_rule_enforced():
    women_only = EligibilityRule.objects.get(label="Women only")
    course = CourseFactory(eligibility=women_only)
    with pytest.raises(ServiceError) as exc:
        request_enrollment(make_student(gender="Male"), course)
    assert exc.value.code == "not_eligible"
    assert request_enrollment(make_student(gender="Female"), course).status == Enrollment.ACTIVE


def test_capacity_enforced():
    course = CourseFactory(capacity=1)
    request_enrollment(make_student(), course)
    with pytest.raises(ServiceError) as exc:
        request_enrollment(make_student(), course)
    assert exc.value.code == "course_full"


def test_capacity_rechecked_at_approval():
    course = CourseFactory(capacity=1, enrollment_mode="approval")
    a = request_enrollment(make_student(), course)
    b = request_enrollment(make_student(), course)
    approve_request(a, make_manager())
    with pytest.raises(ServiceError):
        approve_request(b, make_manager())


def test_approve_and_reject_requests_audited(student):
    course = CourseFactory(enrollment_mode="approval")
    mgr = make_manager()
    e = request_enrollment(student, course)
    approve_request(e, mgr)
    e.refresh_from_db()
    assert e.status == Enrollment.ACTIVE
    assert e.audit_entries.filter(action="approved", to_status="active").exists()
    assert AuditLog.objects.filter(action="enrollment.approve").exists()

    other = request_enrollment(make_student(), course)
    reject_request(other, mgr, "Not this term")
    other.refresh_from_db()
    assert other.status == Enrollment.REJECTED


def test_rejected_student_can_request_again(student):
    course = CourseFactory(enrollment_mode="approval")
    e = request_enrollment(student, course)
    reject_request(e, make_manager(), "x")
    again = request_enrollment(student, course)
    assert again.pk == e.pk and again.status == Enrollment.PENDING_APPROVAL


def test_invalid_transition_raises(student):
    e = request_enrollment(student, CourseFactory())
    with pytest.raises(ServiceError):
        approve_request(e, make_manager())  # already active


def test_access_duration_days(student):
    course = paid_course(access_type="days", access_days=30)
    e = request_enrollment(student, course)
    with freeze_time("2026-11-11 10:00:00"):
        activate(e, make_manager())
    e.refresh_from_db()
    assert e.expires_at.date().isoformat() == "2026-12-11"


def test_access_until_fixed_date(student):
    until = timezone.now() + timedelta(days=100)
    course = CourseFactory(access_type="until", access_until=until)
    e = request_enrollment(student, course)
    assert e.expires_at == until


def test_expired_access_denied_immediately_and_by_job(student):
    course = CourseFactory(access_type="days", access_days=1)
    e = request_enrollment(student, course)
    assert has_course_access(student, course)
    with freeze_time(timezone.now() + timedelta(days=2)):
        assert not has_course_access(student, course)
        assert expire_due_enrollments() == 1
    e.refresh_from_db()
    assert e.status == Enrollment.EXPIRED


def test_extend_reactivates_expired(student):
    course = CourseFactory(access_type="days", access_days=1)
    e = request_enrollment(student, course)
    e.status = Enrollment.EXPIRED
    e.expires_at = timezone.now() - timedelta(days=1)
    e.save()
    new_date = timezone.now() + timedelta(days=30)
    extend_access(e, make_manager(), new_date, "exam prep")
    e.refresh_from_db()
    assert e.status == Enrollment.ACTIVE and e.expires_at == new_date
    assert e.audit_entries.filter(action="extended").exists()


def test_extend_requires_reason_and_future_date(student):
    e = request_enrollment(student, CourseFactory())
    with pytest.raises(ServiceError):
        extend_access(e, make_manager(), timezone.now() + timedelta(days=3), "")
    with pytest.raises(ServiceError):
        extend_access(e, make_manager(), timezone.now() - timedelta(days=3), "reason")


def test_revoke_blocks_access_and_reenrollment(student):
    course = CourseFactory()
    e = request_enrollment(student, course)
    revoke(e, make_manager(), "policy")
    assert not has_course_access(student, course)
    with pytest.raises(ServiceError) as exc:
        request_enrollment(student, course)
    assert exc.value.code == "revoked"


def test_staff_and_instructor_access():
    course = CourseFactory()
    assert has_course_access(make_manager(), course)
    assert has_course_access(make_instructor(course), course)
    assert not has_course_access(make_instructor(CourseFactory()), course)
    assert not has_course_access(UserFactory(), course)


def test_enrollment_state_for_ui():
    course = paid_course()
    assert enrollment_state(None, course)["state"] == "signed_out"
    assert enrollment_state(make_student(verified=False), course)["state"] == "email_unverified"
    assert enrollment_state(make_student(complete=False), course)["state"] == "profile_incomplete"
    s = make_student()
    assert enrollment_state(s, course)["state"] == "can_enroll"
    request_enrollment(s, course)
    assert enrollment_state(s, course)["state"] == "pending_payment"
