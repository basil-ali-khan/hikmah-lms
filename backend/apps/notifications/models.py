from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Event(models.TextChoices):
    VERIFY_EMAIL = "verify_email", "Verify email"
    PASSWORD_RESET = "password_reset", "Password reset"
    ENROLLMENT_CONFIRMED = "enrollment_confirmed", "Enrollment confirmed"
    APPROVAL_REQUESTED = "approval_requested", "Approval request received"
    APPROVAL_DECISION = "approval_decision", "Approval decision"
    PAYMENT_RECEIVED = "payment_received", "Payment received"
    PAYMENT_APPROVED = "payment_approved", "Payment approved"
    PAYMENT_REJECTED = "payment_rejected", "Payment rejected"
    PAYMENT_RESUBMIT = "payment_resubmit", "Payment resubmission requested"
    CLASS_REMINDER = "class_reminder", "Live class reminder"
    DEADLINE_REMINDER = "deadline_reminder", "Deadline reminder"
    NEW_RECORDING = "new_recording", "New recording"
    ASSIGNMENT_GRADED = "assignment_graded", "Assignment graded"
    CERTIFICATE_ISSUED = "certificate_issued", "Certificate issued"
    ACCESS_CHANGED = "access_changed", "Access extended / revoked"


REQUIRED_EVENTS = {Event.VERIFY_EMAIL, Event.PASSWORD_RESET}

# Variables each template may use (validated on save so a broken email can't go out).
COMMON_VARS = {"student.first_name", "student.full_name", "site.name", "site.support_email", "links.dashboard"}
EVENT_VARS = {
    Event.VERIFY_EMAIL: {"links.action"},
    Event.PASSWORD_RESET: {"links.action"},
    Event.ENROLLMENT_CONFIRMED: {"course.title", "links.course", "enrollment.expires_at"},
    Event.APPROVAL_REQUESTED: {"course.title"},
    Event.APPROVAL_DECISION: {"course.title", "decision", "remarks", "links.course"},
    Event.PAYMENT_RECEIVED: {"course.title", "payment.amount", "payment.currency", "payment.reference", "site.review_eta", "links.payment"},
    Event.PAYMENT_APPROVED: {"course.title", "payment.amount", "payment.currency", "enrollment.expires_at", "links.course"},
    Event.PAYMENT_REJECTED: {"course.title", "remarks", "links.payment"},
    Event.PAYMENT_RESUBMIT: {"course.title", "remarks", "links.payment"},
    Event.CLASS_REMINDER: {"course.title", "session.title", "session.starts_at", "session.when", "links.session"},
    Event.DEADLINE_REMINDER: {"course.title", "item.title", "item.due_at", "item.when", "links.item"},
    Event.NEW_RECORDING: {"course.title", "session.title", "links.session"},
    Event.ASSIGNMENT_GRADED: {"course.title", "assignment.title", "submission.score", "assignment.max_score", "links.item"},
    Event.CERTIFICATE_ISSUED: {"course.title", "certificate.code", "certificate.completed_on", "links.certificate", "links.verify"},
    Event.ACCESS_CHANGED: {"course.title", "change", "enrollment.expires_at", "remarks", "links.course"},
}


class EmailTemplate(models.Model):
    event = models.CharField(max_length=40, choices=Event.choices, unique=True)
    subject = models.CharField(max_length=200)
    body = models.TextField(help_text="Markdown with {{ variables }}. Wrapped in the branded layout.")
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["event"]

    def __str__(self):
        return self.get_event_display()

    def allowed_variables(self):
        return COMMON_VARS | EVENT_VARS.get(self.event, set())

    def clean(self):
        from .rendering import find_variables

        unknown = (find_variables(self.subject) | find_variables(self.body)) - self.allowed_variables()
        if unknown:
            raise ValidationError(
                f"Unknown variable(s): {', '.join(sorted(unknown))}. Allowed: {', '.join(sorted(self.allowed_variables()))}"
            )
        if self.event in REQUIRED_EVENTS and not self.enabled:
            raise ValidationError("This email is required and can't be switched off.")


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    event = models.CharField(max_length=40, choices=Event.choices)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=300, blank=True)
    link = models.CharField(max_length=300, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class ReminderLog(models.Model):
    """Guarantees each reminder is sent once per user/object/offset."""

    kind = models.CharField(max_length=20)
    object_id = models.CharField(max_length=64)
    offset_minutes = models.PositiveIntegerField()
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("kind", "object_id", "offset_minutes", "user")]

    def __str__(self):
        return f"{self.kind}:{self.object_id} -{self.offset_minutes}m → {self.user_id}"
