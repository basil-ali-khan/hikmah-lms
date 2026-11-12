"""Idempotent default data. Runs in every environment (`manage.py bootstrap_defaults`) and in tests.

Creates rows only when missing, so admin edits are never overwritten.
"""

from django.contrib.auth.models import Group, Permission
from django.db import transaction

DEFAULT_PROFILE_FIELDS = [
    # key, label, type, required, options, visible_to_instructors, locked, help
    ("phone", "Phone (WhatsApp)", "phone", True, [], False, False, "Include your country code"),
    ("date_of_birth", "Date of birth", "date", True, [], False, True, ""),
    ("gender", "Gender", "select", True, ["Male", "Female"], False, True, "Used for course eligibility"),
    ("country", "Country", "country", True, [], True, False, ""),
    ("city", "City", "text", True, [], False, False, ""),
    (
        "education",
        "Educational background",
        "select",
        False,
        ["Secondary school", "Intermediate / A-levels", "Bachelor's", "Master's", "Doctorate", "Islamic studies (Dars-e-Nizami)", "Other"],
        False,
        False,
        "",
    ),
    ("occupation", "Occupation / student status", "select", False, ["Student", "Employed", "Self-employed", "Homemaker", "Retired", "Other"], False, False, ""),
]

DEFAULT_ELIGIBILITY = [
    ("Open to all", "", []),
    ("Men only", "gender", ["Male"]),
    ("Women only", "gender", ["Female"]),
]

DEFAULT_PAGES = [
    ("privacy", "Privacy policy", 1, "## What we collect\n\nYour name, email, phone, the profile details requested at sign-up, your course activity and payment receipts.\n\n## How we use it\n\nTo run your courses, verify payments, issue certificates and contact you about your classes. We never sell your data.\n\n## Your rights\n\nYou can download your data or ask us to delete your account from **Profile → Your data**.\n\n*[Hikmah Institute to review and replace this placeholder text.]*"),
    ("terms", "Terms of use", 2, "By creating an account you agree to use Hikmah Online respectfully and not to share course materials or meeting links.\n\n*[Hikmah Institute to review and replace this placeholder text.]*"),
    ("refund-policy", "Refund policy", 3, "Fees are refundable within 7 days of approval if you have not attended any class.\n\n*[Hikmah Institute to confirm.]*"),
    ("faq", "FAQ", 4, "### How do I pay by bank transfer?\n\nOpen the course, choose Enroll, transfer the fee to the account shown and upload your receipt.\n\n### When will my enrollment be approved?\n\nUsually within one working day. You'll get an email.\n\n### Can I watch recordings later?\n\nYes — recordings appear in the course's Live tab once published."),
]


def _email_templates():
    from apps.notifications.models import Event

    return {
        Event.VERIFY_EMAIL: (
            "Confirm your email for {{ site.name }}",
            "## Confirm your email\n\nAssalamu alaikum {{ student.first_name }},\n\nPlease confirm this email address to finish creating your {{ site.name }} account.\n\n[Confirm email]({{ links.action }})\n\nIf you didn't sign up, you can ignore this email.",
        ),
        Event.PASSWORD_RESET: (
            "Reset your {{ site.name }} password",
            "## Reset your password\n\nWe received a request to reset the password for this account.\n\n[Choose a new password]({{ links.action }})\n\nIf this wasn't you, no action is needed — your password won't change.",
        ),
        Event.ENROLLMENT_CONFIRMED: (
            "You're enrolled in {{ course.title }}",
            "## Welcome to {{ course.title }}\n\nAssalamu alaikum {{ student.first_name }}, you're enrolled.\n\n[Start learning]({{ links.course }})",
        ),
        Event.APPROVAL_REQUESTED: (
            "We received your request for {{ course.title }}",
            "## Request received\n\nAn administrator will review your request to join **{{ course.title }}**. We'll email you with the decision.",
        ),
        Event.APPROVAL_DECISION: (
            "Your request for {{ course.title }}: {{ decision }}",
            "## Your request was {{ decision }}\n\n{{ remarks }}\n\n[Open {{ site.name }}]({{ links.course }})",
        ),
        Event.PAYMENT_RECEIVED: (
            "We received your payment receipt for {{ course.title }}",
            "## Receipt received\n\nThank you. Your receipt for **{{ course.title }}** ({{ payment.amount }} {{ payment.currency }}, reference {{ payment.reference }}) is waiting for verification, which usually takes {{ site.review_eta }}.\n\nYour course unlocks as soon as the payment is approved.\n\n[View payment status]({{ links.payment }})",
        ),
        Event.PAYMENT_APPROVED: (
            "You're in! {{ course.title }} is unlocked",
            "## Welcome to {{ course.title }}\n\nYour payment of {{ payment.amount }} {{ payment.currency }} has been verified. You have access until **{{ enrollment.expires_at }}**.\n\n[Start learning]({{ links.course }})",
        ),
        Event.PAYMENT_REJECTED: (
            "We couldn't verify your payment for {{ course.title }}",
            "## We couldn't verify this payment\n\nOur team left this note:\n\n> {{ remarks }}\n\nIf you believe this is a mistake, contact support, or submit a new payment.\n\n[Open payment page]({{ links.payment }})",
        ),
        Event.PAYMENT_RESUBMIT: (
            "Action needed: your payment for {{ course.title }}",
            "## Please upload a new receipt\n\nOur team left this note:\n\n> {{ remarks }}\n\n[Upload new receipt]({{ links.payment }})",
        ),
        Event.CLASS_REMINDER: (
            "Class starting {{ session.when }}: {{ course.title }} · {{ session.title }}",
            "## Your class starts {{ session.when }}\n\n**{{ session.title }}** — {{ course.title }}\n\nStarts {{ session.starts_at }} (UTC). Open the class page to join; the join button appears shortly before the start.\n\n[Open class page]({{ links.session }})",
        ),
        Event.DEADLINE_REMINDER: (
            "Due {{ item.when }}: {{ item.title }} · {{ course.title }}",
            "## {{ item.title }} is due {{ item.when }}\n\nCourse: {{ course.title }}\n\nDeadline: {{ item.due_at }} (UTC).\n\n[Open it now]({{ links.item }})",
        ),
        Event.NEW_RECORDING: (
            "Recording available: {{ session.title }} · {{ course.title }}",
            "## {{ session.title }} recording is ready\n\nMissed the class or want to review? Watch it any time in your course.\n\n[Watch recording]({{ links.session }})",
        ),
        Event.ASSIGNMENT_GRADED: (
            "Your {{ assignment.title }} has been graded",
            "## {{ assignment.title }} graded: {{ submission.score }} / {{ assignment.max_score }}\n\nYour instructor has graded your submission for **{{ course.title }}** and left feedback.\n\n[View feedback]({{ links.item }})",
        ),
        Event.CERTIFICATE_ISSUED: (
            "Congratulations — your certificate for {{ course.title }} is ready",
            "## Mabrook, {{ student.first_name }}!\n\nYou've completed **{{ course.title }}**.\n\nCertificate ID: **{{ certificate.code }}** · completed {{ certificate.completed_on }}\n\n[Download certificate]({{ links.certificate }})\n\nAnyone can verify it at {{ links.verify }}",
        ),
        Event.ACCESS_CHANGED: (
            "Your access to {{ course.title }} was {{ change }}",
            "## Access {{ change }}\n\nYour access to **{{ course.title }}** was {{ change }}.\n\n{{ remarks }}\n\n[Open course]({{ links.course }})",
        ),
    }


GROUPS = {
    "Course Manager": {
        "all": ["core.category", "core.page", "core.eligibilityrule", "courses.course", "courses.courseinstructor",
                "courses.module", "courses.lesson", "enrollments.enrollment", "payments.bankaccount",
                "payments.paymentsubmission", "live.livesession", "live.attendancerecord", "assessments.quiz",
                "assessments.question", "assessments.choice", "assessments.assignment", "assessments.submission",
                "assessments.answer", "certificates.certificate", "notifications.emailtemplate"],
        "view": ["accounts.user", "accounts.profile", "accounts.deletionrequest", "enrollments.enrollmentaudit",
                 "assessments.quizattempt", "core.auditlog", "learning.lessonprogress"],
        "extra": ["courses.manage_all_courses", "payments.verify_payments", "enrollments.manage_enrollments"],
    },
    "Instructor": {
        "all": ["courses.module", "courses.lesson", "live.livesession", "live.attendancerecord", "assessments.quiz",
                "assessments.question", "assessments.choice", "assessments.assignment"],
        "view": ["courses.course", "enrollments.enrollment", "assessments.quizattempt", "learning.lessonprogress"],
        "change": ["courses.course", "assessments.submission", "assessments.answer"],
        "extra": [],
    },
}


def _perms(label, actions):
    app_label, model = label.split(".")
    codenames = [f"{a}_{model}" for a in actions]
    return Permission.objects.filter(content_type__app_label=app_label, codename__in=codenames)


@transaction.atomic
def ensure_defaults():
    from apps.accounts.models import ProfileFieldDefinition
    from apps.certificates.models import CertificateTemplate
    from apps.notifications.models import EmailTemplate

    from .models import EligibilityRule, FeatureFlag, Page, SiteSettings

    SiteSettings.load()
    for key, (enabled, desc) in FeatureFlag.DEFAULTS.items():
        FeatureFlag.objects.get_or_create(key=key, defaults={"enabled": enabled, "description": desc})
    for order, (key, label, ftype, req, options, visible, locked, help_text) in enumerate(DEFAULT_PROFILE_FIELDS):
        ProfileFieldDefinition.objects.get_or_create(
            key=key,
            defaults=dict(label=label, field_type=ftype, required=req, options=options, order=order,
                          visible_to_instructors=visible, locked_after_save=locked, help_text=help_text),
        )
    for label, field_key, values in DEFAULT_ELIGIBILITY:
        EligibilityRule.objects.get_or_create(label=label, defaults={"field_key": field_key, "allowed_values": values})
    for slug, title, order, body in DEFAULT_PAGES:
        Page.objects.get_or_create(slug=slug, defaults={"title": title, "order": order, "body": body, "status": Page.PUBLISHED})
    for event, (subject, body) in _email_templates().items():
        EmailTemplate.objects.get_or_create(event=event, defaults={"subject": subject, "body": body})
    if not CertificateTemplate.objects.exists():
        CertificateTemplate.objects.create(name="Default certificate", is_default=True,
                                           signatory_name="[Signatory name]", signatory_title="Director, Hikmah Institute")
    for name, spec in GROUPS.items():
        group, _ = Group.objects.get_or_create(name=name)
        perms = []
        for label in spec.get("all", []):
            perms += list(_perms(label, ["add", "change", "delete", "view"]))
        for label in spec.get("view", []):
            perms += list(_perms(label, ["view"]))
        for label in spec.get("change", []):
            perms += list(_perms(label, ["change", "view"]))
        for full in spec.get("extra", []):
            app_label, codename = full.split(".")
            perms += list(Permission.objects.filter(content_type__app_label=app_label, codename=codename))
        group.permissions.add(*perms)


SCHEDULES = [
    ("Send due reminders", "apps.notifications.services.send_due_reminders", 5),
    ("Expire enrollments", "apps.enrollments.services.expire_due_enrollments", 60),
    ("Daily database backup", "apps.core.management.commands.backup_db.run_backup", 1440),
]


def ensure_schedules():
    from django_q.models import Schedule

    for name, func, minutes in SCHEDULES:
        Schedule.objects.get_or_create(name=name, defaults={"func": func, "schedule_type": Schedule.MINUTES,
                                                            "minutes": minutes, "repeats": -1})
