from datetime import timedelta

from django.db.models import Q
from django.urls import reverse
from django.utils import timezone

from apps.courses.services import can_manage_all_courses, courses_for_staff


def admin_overview(user):
    from apps.accounts.models import DeletionRequest
    from apps.assessments.models import Answer, Submission
    from apps.certificates.models import Certificate
    from apps.enrollments.models import Enrollment
    from apps.live.models import LiveSession
    from apps.payments.models import PaymentSubmission

    now = timezone.now()
    courses = courses_for_staff(user)
    manager = can_manage_all_courses(user)
    active = Enrollment.objects.filter(course__in=courses, status=Enrollment.ACTIVE).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    to_grade = Submission.objects.filter(assignment__course__in=courses, status=Submission.SUBMITTED).count() + \
        Answer.objects.filter(attempt__quiz__course__in=courses, question__kind="short", points_awarded__isnull=True,
                              attempt__status="needs_grading").count()
    today = LiveSession.objects.filter(course__in=courses, starts_at__date=now.date()).select_related("course")
    stats = [
        {"label": "Active students", "value": active.values("user").distinct().count(),
         "hint": f"+{active.filter(activated_at__gte=now - timedelta(days=7)).count()} this week"},
        {"label": "Work to grade", "value": to_grade, "url": reverse("admin:assessments_submission_changelist") + "?status__exact=submitted"},
        {"label": "Live classes today", "value": today.count(), "url": reverse("admin:live_livesession_changelist")},
    ]
    if manager:
        stats = [
            {"label": "Payments to verify",
             "value": PaymentSubmission.objects.filter(status=PaymentSubmission.PENDING).count(),
             "url": reverse("admin:payments_paymentsubmission_changelist") + "?status__exact=pending", "warn": True},
            {"label": "Approval requests",
             "value": Enrollment.objects.filter(status=Enrollment.PENDING_APPROVAL).count(),
             "url": reverse("admin:enrollments_enrollment_changelist") + "?status__exact=pending_approval"},
            *stats,
            {"label": "Certificates issued", "value": Certificate.objects.filter(revoked_at__isnull=True).count()},
        ]
    attention = []
    if manager:
        for p in PaymentSubmission.objects.filter(status="pending").exclude(flags=[]).select_related(
                "enrollment__user", "enrollment__course")[:5]:
            attention.append({"text": f"Flagged receipt ({', '.join(p.flags)}) · {p.enrollment.user.email} · "
                                      f"{p.enrollment.course.title}",
                              "url": reverse("admin:payments_paymentsubmission_change", args=[p.pk])})
        for _ in DeletionRequest.objects.filter(status="pending")[:5]:
            attention.append({"text": "Account deletion request", "url": reverse("admin:accounts_deletionrequest_changelist")})
        for c in courses.filter(status="published", course_instructors__isnull=True)[:5]:
            attention.append({"text": f"{c.title} has no instructor assigned",
                              "url": reverse("admin:courses_course_change", args=[c.pk])})
    return {
        "hikmah_stats": stats,
        "hikmah_today": [{"title": f"{s.course.title} · {s.title}", "time": s.starts_at,
                          "url": reverse("admin:live_livesession_change", args=[s.pk])} for s in today],
        "hikmah_attention": attention,
        "hikmah_is_manager": manager,
    }
