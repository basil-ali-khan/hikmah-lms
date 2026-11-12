import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Enrollment(models.Model):
    PENDING_APPROVAL = "pending_approval"
    PENDING_PAYMENT = "pending_payment"
    ACTIVE = "active"
    REJECTED = "rejected"
    REVOKED = "revoked"
    EXPIRED = "expired"
    STATUSES = [
        (PENDING_APPROVAL, "Awaiting approval"),
        (PENDING_PAYMENT, "Awaiting payment"),
        (ACTIVE, "Active"),
        (REJECTED, "Rejected"),
        (REVOKED, "Revoked"),
        (EXPIRED, "Expired"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments")
    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE, related_name="enrollments")
    status = models.CharField(max_length=20, choices=STATUSES, db_index=True)
    payment_reference = models.CharField(max_length=20, unique=True, help_text="Students put this in the transfer note")
    activated_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True, help_text="Blank = no expiry")
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("user", "course")]
        ordering = ["-created_at"]
        permissions = [("manage_enrollments", "Can approve, extend and revoke enrollments")]

    def __str__(self):
        return f"{self.user} · {self.course}"

    @property
    def is_currently_active(self):
        return self.status == self.ACTIVE and (self.expires_at is None or self.expires_at > timezone.now())


class EnrollmentAudit(models.Model):
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="audit_entries")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=40)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    note = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.action}: {self.from_status} → {self.to_status}"
