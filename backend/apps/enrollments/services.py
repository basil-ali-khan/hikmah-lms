"""Enrollment state machine. Every transition is validated, audited and (where relevant) emailed."""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.services import get_profile, is_email_verified, is_profile_complete
from apps.core.services import NotAllowed, ServiceError, audit, short_code
from apps.courses.models import Course
from apps.courses.services import is_course_staff

from .models import Enrollment, EnrollmentAudit

E = Enrollment

ALLOWED = {
    "approved": {E.PENDING_APPROVAL},
    "rejected": {E.PENDING_APPROVAL},
    "activated": {E.PENDING_APPROVAL, E.PENDING_PAYMENT},
    "revoked": {E.ACTIVE, E.PENDING_APPROVAL, E.PENDING_PAYMENT, E.EXPIRED},
    "expired": {E.ACTIVE},
    "extended": {E.ACTIVE, E.EXPIRED},
}


def _audit_name(action):
    return {"approved": "approve", "rejected": "reject", "activated": "activate", "revoked": "revoke",
            "expired": "expire", "extended": "extend"}[action]


def _audit_action(action):
    return f"enrollment.{_audit_name(action)}"


def _do(enrollment, action, to_status, actor, note="", data=None, request=None, **fields):
    if enrollment.status not in ALLOWED[action]:
        raise ServiceError(
            f"This enrollment is {enrollment.get_status_display().lower()}, so it can't be {action}.", "invalid_state"
        )
    from_status = enrollment.status
    enrollment.status = to_status
    for k, v in fields.items():
        setattr(enrollment, k, v)
    enrollment.save()
    EnrollmentAudit.objects.create(
        enrollment=enrollment, actor=actor if getattr(actor, "pk", None) else None, action=action,
        from_status=from_status, to_status=to_status, note=note or "", data=data or {},
    )
    audit(actor, _audit_action(action), enrollment, {"from": from_status, "to": to_status, "note": note, **(data or {})},
          request=request)
    return enrollment


def compute_expiry(course, start=None):
    start = start or timezone.now()
    if course.access_type == Course.DAYS and course.access_days:
        return start + timedelta(days=course.access_days)
    if course.access_type == Course.UNTIL:
        return course.access_until
    return None


def active_count(course):
    now = timezone.now()
    return course.enrollments.filter(status=E.ACTIVE).exclude(expires_at__lt=now).count()


def is_full(course):
    return course.capacity is not None and active_count(course) >= course.capacity


def enrollment_window_state(course):
    now = timezone.now()
    if course.enrollment_opens_at and now < course.enrollment_opens_at:
        return "not_open"
    if course.enrollment_closes_at and now > course.enrollment_closes_at:
        return "closed"
    return "open"


def eligible(user, course):
    if not course.eligibility_id:
        return True
    return course.eligibility.allows(get_profile(user).data)


def get_enrollment(user, course):
    if not user or not user.is_authenticated:
        return None
    return Enrollment.objects.filter(user=user, course=course).first()


def has_course_access(user, course):
    if not user or not user.is_authenticated:
        return False
    if is_course_staff(user, course):
        return True
    e = get_enrollment(user, course)
    return bool(e and e.is_currently_active)


def require_course_access(user, course):
    if not has_course_access(user, course):
        raise NotAllowed("You need an active enrollment in this course.", "not_enrolled")


def enrollment_state(user, course):
    """What the course page's enroll button should show. Decided on the server."""
    if not user or not user.is_authenticated:
        return {"state": "signed_out"}
    e = get_enrollment(user, course)
    if e:
        if e.status == E.ACTIVE and not e.is_currently_active:
            return {"state": "expired", "enrollment_id": str(e.id)}
        if e.status != E.REJECTED:
            return {"state": {E.ACTIVE: "enrolled"}.get(e.status, e.status), "enrollment_id": str(e.id)}
    if is_course_staff(user, course):
        return {"state": "staff"}
    if course.status != Course.PUBLISHED:
        return {"state": "not_available"}
    if not is_email_verified(user):
        return {"state": "email_unverified"}
    if not is_profile_complete(user):
        return {"state": "profile_incomplete"}
    if not eligible(user, course):
        return {"state": "not_eligible"}
    window = enrollment_window_state(course)
    if window != "open":
        return {"state": f"enrollment_{window}"}
    if is_full(course):
        return {"state": "full"}
    if e and e.status == E.REJECTED:
        return {"state": "can_enroll", "previously_rejected": True, "enrollment_id": str(e.id)}
    return {"state": "can_enroll"}


@transaction.atomic
def request_enrollment(user, course, request=None):
    course = Course.objects.select_for_update().get(pk=course.pk)
    existing = Enrollment.objects.filter(user=user, course=course).first()
    if existing and existing.status in (E.ACTIVE, E.PENDING_APPROVAL, E.PENDING_PAYMENT):
        return existing
    if existing and existing.status == E.REVOKED:
        raise ServiceError("Your access to this course was revoked. Please contact the institute.", "revoked")
    if existing and existing.status == E.EXPIRED:
        raise ServiceError("Your access has expired. Please contact the institute to extend it.", "expired")
    if course.status != Course.PUBLISHED:
        raise ServiceError("This course isn't open for enrollment.", "not_available")
    if not is_email_verified(user):
        raise ServiceError("Please verify your email address before enrolling.", "email_unverified")
    if not is_profile_complete(user):
        raise ServiceError("Please complete your profile before enrolling.", "profile_incomplete")
    if not eligible(user, course):
        raise ServiceError("This course isn't open to your profile under the institute's eligibility settings.", "not_eligible")
    window = enrollment_window_state(course)
    if window == "not_open":
        raise ServiceError("Enrollment hasn't opened yet.", "enrollment_not_open")
    if window == "closed":
        raise ServiceError("Enrollment for this course has closed.", "enrollment_closed")
    if is_full(course):
        raise ServiceError("This course is full.", "course_full")

    if course.is_free:
        status = E.ACTIVE if course.enrollment_mode == Course.INSTANT else E.PENDING_APPROVAL
    else:
        status = E.PENDING_PAYMENT

    if existing:  # previously rejected: re-apply
        enrollment = existing
        from_status = existing.status
        enrollment.status = status
        enrollment.save()
        EnrollmentAudit.objects.create(enrollment=enrollment, actor=user, action="requested", from_status=from_status,
                                       to_status=status)
    else:
        for _ in range(5):
            try:
                with transaction.atomic():
                    enrollment = Enrollment.objects.create(user=user, course=course, status=status,
                                                           payment_reference=short_code("HKM", groups=2, size=4))
                break
            except IntegrityError:
                continue
        EnrollmentAudit.objects.create(enrollment=enrollment, actor=user, action="requested", to_status=status)
    audit(user, "enrollment.request", enrollment, {"status": status}, request=request)

    from apps.notifications.models import Event
    from apps.notifications.services import course_link, notify

    if status == E.ACTIVE:
        enrollment.activated_at = timezone.now()
        enrollment.expires_at = compute_expiry(course, enrollment.activated_at)
        enrollment.save(update_fields=["activated_at", "expires_at", "updated_at"])
        notify(user, Event.ENROLLMENT_CONFIRMED, {"course": {"title": course.title}, "enrollment": _enr_ctx(enrollment)},
               link=course_link(course))
    elif status == E.PENDING_APPROVAL:
        notify(user, Event.APPROVAL_REQUESTED, {"course": {"title": course.title}}, link=f"/courses/{course.slug}")
    return enrollment


def _enr_ctx(enrollment):
    return {"expires_at": enrollment.expires_at.strftime("%d %b %Y") if enrollment.expires_at else "no expiry (lifetime)"}


def _require_manager(actor):
    if actor is not None and not (actor.is_superuser or actor.has_perm("enrollments.manage_enrollments")):
        raise NotAllowed("You don't have permission to manage enrollments.")


def activate(enrollment, actor, note="", via="manual", request=None):
    """Make an enrollment active (approval or verified payment). Checks capacity again."""
    course = enrollment.course
    if is_full(course):
        raise ServiceError("The course is full. Increase capacity first.", "course_full")
    now = timezone.now()
    return _do(enrollment, "activated", E.ACTIVE, actor, note, {"via": via}, request,
               activated_at=now, expires_at=compute_expiry(course, now))


@transaction.atomic
def approve_request(enrollment, actor, note="", request=None):
    _require_manager(actor)
    if enrollment.status != E.PENDING_APPROVAL:
        raise ServiceError("Only pending requests can be approved.", "invalid_state")
    if is_full(enrollment.course):
        raise ServiceError("The course is full. Increase capacity first.", "course_full")
    now = timezone.now()
    _do(enrollment, "approved", E.ACTIVE, actor, note, None, request, activated_at=now,
        expires_at=compute_expiry(enrollment.course, now))
    from apps.notifications.models import Event
    from apps.notifications.services import course_link, notify

    notify(enrollment.user, Event.APPROVAL_DECISION,
           {"course": {"title": enrollment.course.title}, "decision": "approved", "remarks": note or "You can start learning now."},
           link=course_link(enrollment.course))
    return enrollment


@transaction.atomic
def reject_request(enrollment, actor, note, request=None):
    _require_manager(actor)
    _do(enrollment, "rejected", E.REJECTED, actor, note, None, request)
    from apps.notifications.models import Event
    from apps.notifications.services import notify

    notify(enrollment.user, Event.APPROVAL_DECISION,
           {"course": {"title": enrollment.course.title}, "decision": "not approved", "remarks": note or ""},
           link=f"/courses/{enrollment.course.slug}")
    return enrollment


@transaction.atomic
def extend_access(enrollment, actor, new_expires_at, reason, notify_student=True, request=None):
    _require_manager(actor)
    if not (reason or "").strip():
        raise ServiceError("A reason is required.", "reason_required")
    if new_expires_at is None or new_expires_at <= timezone.now():
        raise ServiceError("The new end date must be in the future.", "invalid_date")
    old = enrollment.expires_at
    _do(enrollment, "extended", E.ACTIVE, actor, reason,
        {"old_expires_at": old.isoformat() if old else None, "new_expires_at": new_expires_at.isoformat()}, request,
        expires_at=new_expires_at)
    if notify_student:
        from apps.notifications.models import Event
        from apps.notifications.services import course_link, notify

        notify(enrollment.user, Event.ACCESS_CHANGED,
               {"course": {"title": enrollment.course.title}, "change": "extended", "remarks": reason,
                "enrollment": _enr_ctx(enrollment)}, link=course_link(enrollment.course))
    return enrollment


@transaction.atomic
def revoke(enrollment, actor, reason, notify_student=True, request=None):
    _require_manager(actor)
    if not (reason or "").strip():
        raise ServiceError("A reason is required.", "reason_required")
    _do(enrollment, "revoked", E.REVOKED, actor, reason, None, request)
    if notify_student:
        from apps.notifications.models import Event
        from apps.notifications.services import notify

        notify(enrollment.user, Event.ACCESS_CHANGED,
               {"course": {"title": enrollment.course.title}, "change": "revoked", "remarks": reason,
                "enrollment": _enr_ctx(enrollment)}, link="/my-courses")
    return enrollment


def expire_due_enrollments():
    now = timezone.now()
    count = 0
    for enrollment in Enrollment.objects.filter(status=E.ACTIVE, expires_at__lt=now):
        _do(enrollment, "expired", E.EXPIRED, None, "Access period ended")
        count += 1
    return count


@transaction.atomic
def admin_enroll(user, course, actor, note="", request=None):
    """Staff-created enrollment (e.g. scholarship or offline payment). Skips payment; audited."""
    _require_manager(actor)
    if not (note or "").strip():
        raise ServiceError("Add a note explaining the manual enrollment.", "reason_required")
    existing = Enrollment.objects.filter(user=user, course=course).first()
    if existing and existing.is_currently_active:
        raise ServiceError("This student already has active access.", "already_enrolled")
    if is_full(course):
        raise ServiceError("The course is full. Increase capacity first.", "course_full")
    now = timezone.now()
    if existing is None:
        existing = Enrollment.objects.create(user=user, course=course, status=E.PENDING_APPROVAL,
                                             payment_reference=short_code("HKM", groups=2, size=4))
    from_status = existing.status
    existing.status, existing.activated_at, existing.expires_at = E.ACTIVE, now, compute_expiry(course, now)
    existing.save()
    EnrollmentAudit.objects.create(enrollment=existing, actor=actor, action="manual_enroll", from_status=from_status,
                                   to_status=E.ACTIVE, note=note)
    audit(actor, "enrollment.manual", existing, {"note": note}, request=request)
    from apps.notifications.models import Event
    from apps.notifications.services import course_link, notify

    notify(user, Event.ENROLLMENT_CONFIRMED, {"course": {"title": course.title}, "enrollment": _enr_ctx(existing)},
           link=course_link(course))
    return existing
