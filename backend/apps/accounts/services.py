"""Profile rules driven by admin-defined ProfileFieldDefinition rows."""

import re
from datetime import date

from allauth.account.models import EmailAddress
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.core.services import ServiceError, audit

from .models import DeletionRequest, Profile, ProfileFieldDefinition

PHONE_RE = re.compile(r"^\+?[0-9 ()\-]{6,24}$")
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")


def get_profile(user) -> Profile:
    profile, _ = Profile.objects.get_or_create(user=user)
    return profile


def active_field_definitions():
    return list(ProfileFieldDefinition.objects.filter(active=True).order_by("order", "id"))


def is_email_verified(user) -> bool:
    return EmailAddress.objects.filter(user=user, verified=True).exists()


def _empty(value):
    return value is None or (isinstance(value, str) and not value.strip()) or value == []


def _clean_value(definition, value):
    if _empty(value):
        return None
    t = definition.field_type
    if t in (ProfileFieldDefinition.TEXT, ProfileFieldDefinition.TEXTAREA):
        value = str(value).strip()
        limit = 2000 if t == ProfileFieldDefinition.TEXTAREA else 200
        if len(value) > limit:
            raise ValidationError(f"Keep it under {limit} characters.")
        return value
    if t == ProfileFieldDefinition.PHONE:
        value = str(value).strip()
        if not PHONE_RE.match(value):
            raise ValidationError("Enter a valid phone number with country code.")
        return value
    if t == ProfileFieldDefinition.DATE:
        try:
            parsed = date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValidationError("Enter a valid date (YYYY-MM-DD).") from exc
        if parsed > timezone.now().date() or parsed.year < 1900:
            raise ValidationError("Enter a realistic date.")
        return parsed.isoformat()
    if t == ProfileFieldDefinition.SELECT:
        if value not in definition.options:
            raise ValidationError("Choose one of the listed options.")
        return value
    if t == ProfileFieldDefinition.MULTISELECT:
        values = value if isinstance(value, list) else [value]
        if any(v not in definition.options for v in values):
            raise ValidationError("Choose from the listed options.")
        return values
    if t == ProfileFieldDefinition.COUNTRY:
        value = str(value).strip().upper()
        if not COUNTRY_RE.match(value):
            raise ValidationError("Choose a country.")
        return value
    if t == ProfileFieldDefinition.NUMBER:
        try:
            return float(value) if "." in str(value) else int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError("Enter a number.") from exc
    return value


def update_profile(user, full_name=None, data=None, consent=None, timezone_name=None, reminders=None):
    """Validate against active field definitions. Unknown keys are ignored. Locked fields can't change."""
    profile = get_profile(user)
    data = data or {}
    errors = {}
    current = dict(profile.data or {})
    for definition in active_field_definitions():
        if definition.key not in data:
            continue
        try:
            cleaned = _clean_value(definition, data[definition.key])
        except ValidationError as exc:
            errors[definition.key] = exc.messages
            continue
        if definition.locked_after_save and not _empty(current.get(definition.key)) and cleaned != current.get(definition.key):
            errors[definition.key] = ["This field can't be changed. Contact support if it's wrong."]
            continue
        if cleaned is None:
            current.pop(definition.key, None)
        else:
            current[definition.key] = cleaned
    if full_name is not None:
        name = " ".join(str(full_name).split())
        if len(name) < 2:
            errors["full_name"] = ["Please enter your full name."]
        elif len(name) > 150:
            errors["full_name"] = ["Name is too long."]
    if errors:
        raise ValidationError(errors)

    if full_name is not None:
        user.full_name = " ".join(str(full_name).split())
        user.save(update_fields=["full_name"])
    profile.data = current
    if consent and not profile.privacy_consent_at:
        profile.privacy_consent_at = timezone.now()
    if timezone_name is not None:
        profile.timezone = str(timezone_name)[:64]
    if reminders:
        for key in ("class_reminders", "deadline_reminders"):
            if key in reminders:
                setattr(profile, key, bool(reminders[key]))
    if profile.completed_at is None and not _missing(user, profile):
        profile.completed_at = timezone.now()
    profile.save()
    return profile


def _missing(user, profile):
    missing = []
    if not (user.full_name or "").strip():
        missing.append("full_name")
    for definition in active_field_definitions():
        if definition.required and _empty((profile.data or {}).get(definition.key)):
            missing.append(definition.key)
    if not profile.privacy_consent_at:
        missing.append("privacy_consent")
    return missing


def missing_profile_fields(user):
    return _missing(user, get_profile(user))


def is_profile_complete(user) -> bool:
    return not missing_profile_fields(user)


def request_account_deletion(user, reason="", request=None):
    if DeletionRequest.objects.filter(user=user, status=DeletionRequest.PENDING).exists():
        raise ServiceError("A deletion request is already pending.", "already_requested")
    req = DeletionRequest.objects.create(user=user, reason=(reason or "")[:2000])
    audit(user, "account.deletion_requested", req, request=request, object_repr=user.email)
    return req


def export_user_data(user):
    """Everything we hold about a student, in plain JSON (GDPR-style access request)."""
    profile = get_profile(user)
    return {
        "account": {
            "email": user.email,
            "full_name": user.full_name,
            "date_joined": user.date_joined.isoformat(),
        },
        "profile": profile.data,
        "consent": {
            "privacy_consent_at": profile.privacy_consent_at.isoformat() if profile.privacy_consent_at else None,
            "terms_accepted_at": profile.terms_accepted_at.isoformat() if profile.terms_accepted_at else None,
        },
        "enrollments": [
            {"course": e.course.title, "status": e.status, "since": e.created_at.isoformat(),
             "expires_at": e.expires_at.isoformat() if e.expires_at else None}
            for e in user.enrollments.select_related("course")
        ],
        "payments": [
            {"course": p.enrollment.course.title, "amount": str(p.amount), "currency": p.currency, "status": p.status,
             "submitted_at": p.created_at.isoformat()}
            for e in user.enrollments.all() for p in e.payments.all()
        ],
        "quiz_attempts": [
            {"quiz": a.quiz.title, "number": a.number, "percent": str(a.percent) if a.percent is not None else None}
            for a in user.quiz_attempts.select_related("quiz")
        ],
        "submissions": [
            {"assignment": s.assignment.title, "submitted_at": s.submitted_at.isoformat(),
             "score": str(s.score) if s.score is not None else None}
            for s in user.submissions.select_related("assignment")
        ],
        "certificates": [{"code": c.code, "course": c.course.title, "issued_at": c.issued_at.isoformat()}
                         for c in user.certificates.select_related("course")],
        "attendance": [{"session": a.session.title, "status": a.status} for a in user.attendance.select_related("session")],
    }
