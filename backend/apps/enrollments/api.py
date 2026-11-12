from datetime import date

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.files import secure_url
from apps.core.models import SiteSettings
from apps.core.services import ServiceError
from apps.courses.models import Course
from apps.payments.models import PaymentSubmission
from apps.payments.services import bank_accounts_for, submit_payment

from .models import Enrollment
from .services import request_enrollment


def bank_json(a):
    return {"id": a.id, "display_name": a.display_name, "currency": a.currency, "account_title": a.account_title,
            "bank_name": a.bank_name, "account_number": a.account_number, "swift_code": a.swift_code,
            "branch": a.branch, "instructions": a.instructions}


def payment_json(p):
    return {"id": str(p.id), "status": p.status, "amount": str(p.amount), "currency": p.currency,
            "transaction_ref": p.transaction_ref, "paid_on": p.paid_on, "remarks": p.remarks if p.status != "pending" else "",
            "created_at": p.created_at, "reviewed_at": p.reviewed_at}


def enrollment_json(e, detail=False):
    from apps.learning.services import course_progress

    c = e.course
    data = {
        "id": str(e.id),
        "status": e.status if not (e.status == Enrollment.ACTIVE and not e.is_currently_active) else Enrollment.EXPIRED,
        "course": {"slug": c.slug, "title": c.title, "course_type": c.course_type, "is_free": c.is_free,
                   "price": str(c.price), "currency": c.currency,
                   "thumbnail_url": c.thumbnail.url if c.thumbnail else None},
        "activated_at": e.activated_at,
        "expires_at": e.expires_at,
        "completed_at": e.completed_at,
        "created_at": e.created_at,
        "progress": course_progress(e.user, c) if e.status == Enrollment.ACTIVE else None,
    }
    payments = list(e.payments.all())
    data["latest_payment"] = payment_json(payments[0]) if payments else None
    if detail:
        data.update({
            "payment_reference": e.payment_reference,
            "bank_accounts": [bank_json(a) for a in bank_accounts_for(c)] if not c.is_free else [],
            "payments": [payment_json(p) for p in payments],
            "review_eta": SiteSettings.load().payment_review_eta,
            "can_submit_payment": e.status == Enrollment.PENDING_PAYMENT
            and not any(p.status in (PaymentSubmission.PENDING, PaymentSubmission.APPROVED) for p in payments),
            "timeline": [{"action": a.action, "to_status": a.to_status, "at": a.created_at,
                          "note": a.note if a.action in ("rejected", "revoked", "extended") else ""}
                         for a in e.audit_entries.all()],
        })
    return data


class EnrollView(APIView):
    def post(self, request, slug):
        course = get_object_or_404(Course, slug=slug, status=Course.PUBLISHED)
        enrollment = request_enrollment(request.user, course, request=request)
        return Response(enrollment_json(enrollment, detail=True), status=201)


class MyEnrollmentsView(APIView):
    def get(self, request):
        qs = (Enrollment.objects.filter(user=request.user).select_related("course").prefetch_related("payments")
              .order_by("-created_at"))
        return Response([enrollment_json(e) for e in qs])


def _own_enrollment(request, pk):
    return get_object_or_404(Enrollment.objects.select_related("course"), pk=pk, user=request.user)


class EnrollmentDetailView(APIView):
    def get(self, request, pk):
        return Response(enrollment_json(_own_enrollment(request, pk), detail=True))


class PaymentSubmitView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "uploads"

    def post(self, request, pk):
        enrollment = _own_enrollment(request, pk)
        paid_on = request.data.get("paid_on") or None
        if paid_on:
            try:
                paid_on = date.fromisoformat(paid_on)
            except ValueError as exc:
                raise ServiceError("Enter a valid payment date.", "invalid_date") from exc
        submit_payment(
            enrollment, request.user, request.FILES.get("receipt"), amount=request.data.get("amount"),
            transaction_ref=request.data.get("transaction_ref", ""), paid_on=paid_on,
            bank_account_id=request.data.get("bank_account") or None, request=request,
        )
        enrollment.refresh_from_db()
        return Response(enrollment_json(enrollment, detail=True), status=201)


class ReceiptView(APIView):
    def get(self, request, pk):
        payment = get_object_or_404(PaymentSubmission.objects.select_related("enrollment"), pk=pk)
        u = request.user
        if payment.enrollment.user_id != u.id and not (u.is_superuser or u.has_perm("payments.verify_payments")):
            raise Http404  # don't reveal that the receipt exists
        return Response({"url": secure_url(payment.receipt), "mime": payment.receipt_mime})
