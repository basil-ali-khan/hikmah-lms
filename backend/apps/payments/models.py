import uuid

from django.conf import settings
from django.db import models

from apps.core.files import randomized_name


class BankAccount(models.Model):
    display_name = models.CharField(max_length=120, help_text="Shown to students, e.g. 'Meezan Bank · PKR'")
    currency = models.CharField(max_length=3)
    account_title = models.CharField(max_length=150)
    bank_name = models.CharField(max_length=120)
    account_number = models.CharField(max_length=60, help_text="IBAN or account number")
    swift_code = models.CharField(max_length=20, blank=True)
    branch = models.CharField(max_length=120, blank=True)
    instructions = models.TextField(blank=True, help_text="Extra instructions shown to students")
    active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "display_name"]

    def __str__(self):
        return self.display_name

    def save(self, *args, **kwargs):
        self.currency = (self.currency or "").upper()
        super().save(*args, **kwargs)


class PaymentSubmission(models.Model):
    PENDING, APPROVED, REJECTED, RESUBMIT = "pending", "approved", "rejected", "resubmit"
    STATUSES = [
        (PENDING, "Pending verification"),
        (APPROVED, "Approved"),
        (REJECTED, "Rejected"),
        (RESUBMIT, "Resubmission requested"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enrollment = models.ForeignKey("enrollments.Enrollment", on_delete=models.CASCADE, related_name="payments")
    receipt = models.FileField(upload_to=randomized_name("receipts"))
    receipt_mime = models.CharField(max_length=100, blank=True)
    file_hash = models.CharField(max_length=64, db_index=True)
    transaction_ref = models.CharField(max_length=120, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3)
    paid_on = models.DateField(null=True, blank=True)
    bank_account = models.ForeignKey(BankAccount, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=10, choices=STATUSES, default=PENDING, db_index=True)
    flags = models.JSONField(default=list, blank=True, help_text="Automatic checks, e.g. duplicate_receipt")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        permissions = [("verify_payments", "Can approve or reject payment receipts")]

    def __str__(self):
        return f"{self.enrollment.payment_reference} · {self.amount} {self.currency}"

    @property
    def user(self):
        return self.enrollment.user

    @property
    def course(self):
        return self.enrollment.course
