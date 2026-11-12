"""Bank-transfer receipts. Only an approved receipt unlocks a paid course."""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.core.files import validate_upload
from apps.core.models import SiteSettings
from apps.core.services import NotAllowed, ServiceError, audit
from apps.enrollments.models import Enrollment
from apps.enrollments.services import activate

from .models import BankAccount, PaymentSubmission

P = PaymentSubmission


def _require_reviewer(actor):
    if not (actor and (actor.is_superuser or actor.has_perm("payments.verify_payments"))):
        raise NotAllowed("You don't have permission to verify payments.")


def _payment_link(enrollment):
    return f"/payments/{enrollment.id}"


@transaction.atomic
def submit_payment(enrollment, user, receipt, amount, transaction_ref="", paid_on=None, bank_account_id=None, request=None):
    enrollment = Enrollment.objects.select_for_update().get(pk=enrollment.pk)
    if enrollment.user_id != user.id:
        raise NotAllowed("This isn't your enrollment.")
    if enrollment.status != Enrollment.PENDING_PAYMENT:
        raise ServiceError("This enrollment isn't waiting for a payment.", "invalid_state")
    if enrollment.payments.filter(status=P.PENDING).exists():
        raise ServiceError("Your previous receipt is still being verified.", "payment_pending")
    if enrollment.payments.filter(status=P.APPROVED).exists():
        raise ServiceError("This payment was already approved.", "already_paid")
    try:
        amount = Decimal(str(amount))
    except (InvalidOperation, TypeError) as exc:
        raise ServiceError("Enter the amount you paid.", "invalid_amount") from exc
    if amount <= 0:
        raise ServiceError("Enter the amount you paid.", "invalid_amount")

    mime, digest = validate_upload(receipt)
    course = enrollment.course
    flags = []
    if P.objects.filter(file_hash=digest).exists():
        flags.append("duplicate_receipt")
    if amount != course.price:
        flags.append("amount_mismatch")
    if paid_on and paid_on > timezone.now().date():
        raise ServiceError("Payment date can't be in the future.", "invalid_date")
    account = None
    if bank_account_id:
        account = course.bank_accounts.filter(pk=bank_account_id, active=True).first()

    sub = P(enrollment=enrollment, receipt_mime=mime, file_hash=digest, transaction_ref=(transaction_ref or "")[:120],
            amount=amount, currency=course.currency, paid_on=paid_on, bank_account=account, flags=flags)
    sub.receipt.save(receipt.name, receipt, save=False)
    sub.save()
    audit(user, "payment.submit", sub, {"flags": flags, "amount": str(amount)}, request=request)

    from apps.notifications.models import Event
    from apps.notifications.services import notify

    notify(user, Event.PAYMENT_RECEIVED, {
        "course": {"title": course.title},
        "payment": {"amount": f"{amount:,.2f}", "currency": course.currency, "reference": enrollment.payment_reference},
        "site": {"review_eta": SiteSettings.load().payment_review_eta},
    }, link=_payment_link(enrollment))
    return sub


def _decide(sub, actor, status, remarks, request):
    _require_reviewer(actor)
    sub = P.objects.select_for_update().get(pk=sub.pk)
    if sub.status != P.PENDING:
        raise ServiceError("This receipt was already reviewed.", "already_reviewed")
    sub.status = status
    sub.reviewer = actor
    sub.reviewed_at = timezone.now()
    sub.remarks = remarks or ""
    sub.save()
    audit(actor, f"payment.{ {P.APPROVED: 'approve', P.REJECTED: 'reject', P.RESUBMIT: 'resubmit'}[status] }",
          sub, {"remarks": remarks, "enrollment": str(sub.enrollment_id)}, request=request)
    return sub


@transaction.atomic
def approve_payment(sub, actor, remarks="", request=None):
    sub = _decide(sub, actor, P.APPROVED, remarks, request)
    enrollment = sub.enrollment
    activate(enrollment, actor, note=f"Payment {sub.enrollment.payment_reference} approved", via="payment", request=request)

    from apps.notifications.models import Event
    from apps.notifications.services import course_link, notify

    notify(enrollment.user, Event.PAYMENT_APPROVED, {
        "course": {"title": enrollment.course.title},
        "payment": {"amount": f"{sub.amount:,.2f}", "currency": sub.currency},
        "enrollment": {"expires_at": enrollment.expires_at.strftime("%d %b %Y") if enrollment.expires_at else "no expiry (lifetime)"},
    }, link=course_link(enrollment.course))
    return sub


@transaction.atomic
def reject_payment(sub, actor, remarks, request=None):
    if not (remarks or "").strip():
        raise ServiceError("Add a remark so the student knows why.", "remarks_required")
    sub = _decide(sub, actor, P.REJECTED, remarks, request)
    from apps.notifications.models import Event
    from apps.notifications.services import notify

    notify(sub.enrollment.user, Event.PAYMENT_REJECTED,
           {"course": {"title": sub.enrollment.course.title}, "remarks": remarks}, link=_payment_link(sub.enrollment))
    return sub


@transaction.atomic
def request_resubmission(sub, actor, remarks, request=None):
    if not (remarks or "").strip():
        raise ServiceError("Tell the student what to fix.", "remarks_required")
    sub = _decide(sub, actor, P.RESUBMIT, remarks, request)
    from apps.notifications.models import Event
    from apps.notifications.services import notify

    notify(sub.enrollment.user, Event.PAYMENT_RESUBMIT,
           {"course": {"title": sub.enrollment.course.title}, "remarks": remarks}, link=_payment_link(sub.enrollment))
    return sub


def bank_accounts_for(course):
    return BankAccount.objects.filter(courses=course, active=True)
