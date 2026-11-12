from decimal import Decimal

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.core.models import AuditLog
from apps.core.services import ServiceError
from apps.enrollments.models import Enrollment
from apps.enrollments.services import has_course_access, request_enrollment
from apps.payments.models import PaymentSubmission
from apps.payments.services import approve_payment, reject_payment, request_resubmission, submit_payment
from conftest import make_manager, make_student, paid_course, png_upload

pytestmark = pytest.mark.django_db


@pytest.fixture
def pending(student):
    course = paid_course()
    return request_enrollment(student, course)


def _submit(enrollment, upload=None, amount="5000"):
    return submit_payment(
        enrollment, enrollment.user, upload or png_upload(), amount=Decimal(amount), transaction_ref="TXN1", paid_on=None
    )


def test_submit_creates_pending_and_does_not_unlock(pending):
    sub = _submit(pending)
    assert sub.status == PaymentSubmission.PENDING
    assert sub.file_hash and sub.receipt.name.startswith("receipts/")
    assert "receipt" not in sub.receipt.name.split("/")[-1]  # original filename discarded
    assert not has_course_access(pending.user, pending.course)
    assert any("received" in m.subject.lower() for m in mail.outbox)


def test_only_owner_can_submit(pending):
    with pytest.raises(ServiceError):
        submit_payment(pending, make_student(), png_upload(), amount=Decimal("5000"), transaction_ref="", paid_on=None)


def test_rejects_disallowed_file_type(pending):
    exe = SimpleUploadedFile("x.png", b"MZ\x90\x00" + b"\x00" * 100, content_type="image/png")
    with pytest.raises(ServiceError) as exc:
        _submit(pending, exe)
    assert exc.value.code == "file_type"


def test_rejects_oversized_file(pending, settings):
    settings.MAX_UPLOAD_MB = 1
    big = png_upload(payload=b"\x00" * (1024 * 1024 + 10))
    with pytest.raises(ServiceError) as exc:
        _submit(pending, big)
    assert exc.value.code == "file_too_large"


def test_cannot_submit_twice_while_pending(pending):
    _submit(pending)
    with pytest.raises(ServiceError) as exc:
        _submit(pending)
    assert exc.value.code == "payment_pending"


def test_duplicate_receipt_flagged_across_students(pending):
    first = _submit(pending)
    other = request_enrollment(make_student(), pending.course)
    second = _submit(other)
    assert "duplicate_receipt" in second.flags
    assert first.file_hash == second.file_hash


def test_amount_mismatch_flagged(pending):
    sub = _submit(pending, amount="4000")
    assert "amount_mismatch" in sub.flags


def test_approve_unlocks_and_audits(pending):
    sub = _submit(pending)
    mgr = make_manager()
    approve_payment(sub, mgr, "ok")
    sub.refresh_from_db()
    pending.refresh_from_db()
    assert sub.status == PaymentSubmission.APPROVED and sub.reviewer == mgr and sub.reviewed_at
    assert pending.status == Enrollment.ACTIVE
    assert has_course_access(pending.user, pending.course)
    assert AuditLog.objects.filter(action="payment.approve", object_id=str(sub.pk)).exists()


@pytest.mark.parametrize("action", [reject_payment, request_resubmission])
def test_reject_and_resubmit_need_remarks_and_keep_locked(pending, action):
    sub = _submit(pending)
    with pytest.raises(ServiceError):
        action(sub, make_manager(), "")
    action(sub, make_manager(), "Unreadable")
    sub.refresh_from_db()
    assert sub.status in (PaymentSubmission.REJECTED, PaymentSubmission.RESUBMIT)
    assert sub.remarks == "Unreadable"
    assert not has_course_access(pending.user, pending.course)


def test_resubmission_allowed_after_request(pending):
    sub = _submit(pending)
    request_resubmission(sub, make_manager(), "blurry")
    new = _submit(pending, png_upload(payload=b"new"))
    assert new.status == PaymentSubmission.PENDING


def test_decision_is_final(pending):
    sub = _submit(pending)
    approve_payment(sub, make_manager())
    with pytest.raises(ServiceError):
        reject_payment(sub, make_manager(), "changed my mind")


def test_reviewer_needs_permission(pending):
    from conftest import UserFactory

    sub = _submit(pending)
    with pytest.raises(ServiceError):
        approve_payment(sub, UserFactory(is_staff=True))
