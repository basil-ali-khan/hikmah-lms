import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.files import randomized_name
from apps.core.models import public_storage


class Course(models.Model):
    LIVE, RECORDED, HYBRID = "live", "recorded", "hybrid"
    TYPES = [(LIVE, "Live"), (RECORDED, "Recorded"), (HYBRID, "Hybrid")]
    DRAFT, PUBLISHED, ARCHIVED = "draft", "published", "archived"
    STATUSES = [(DRAFT, "Draft"), (PUBLISHED, "Published"), (ARCHIVED, "Archived")]
    INSTANT, APPROVAL = "instant", "approval"
    ENROLLMENT_MODES = [(INSTANT, "Instant"), (APPROVAL, "Needs approval")]
    LIFETIME, DAYS, UNTIL = "lifetime", "days", "until"
    ACCESS_TYPES = [(LIFETIME, "Lifetime"), (DAYS, "N days after activation"), (UNTIL, "Until a fixed date")]
    REC_AUTO, REC_REVIEW = "auto", "review"
    RECORDING_POLICIES = [(REC_AUTO, "Publish automatically"), (REC_REVIEW, "Instructor reviews first")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True)
    summary = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True, help_text="Markdown")
    outcomes = models.TextField(blank=True, help_text="Markdown list of what students will learn")
    thumbnail = models.ImageField(upload_to=randomized_name("courses"), storage=public_storage, blank=True)
    intro_video_url = models.URLField(blank=True)
    category = models.ForeignKey("core.Category", null=True, blank=True, on_delete=models.SET_NULL)
    course_type = models.CharField(max_length=10, choices=TYPES, default=RECORDED)
    status = models.CharField(max_length=10, choices=STATUSES, default=DRAFT, db_index=True)
    featured = models.BooleanField(default=False)
    instructors = models.ManyToManyField(
        settings.AUTH_USER_MODEL, through="CourseInstructor", related_name="teaching_courses", blank=True
    )

    # pricing & enrollment (admin only)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"), validators=[MinValueValidator(0)])
    currency = models.CharField(max_length=3, default="PKR", help_text="ISO 4217 code, e.g. PKR, USD, GBP")
    bank_accounts = models.ManyToManyField("payments.BankAccount", blank=True, related_name="courses")
    enrollment_mode = models.CharField(max_length=10, choices=ENROLLMENT_MODES, default=INSTANT, help_text="Free courses only.")
    capacity = models.PositiveIntegerField(null=True, blank=True, help_text="Blank = unlimited")
    enrollment_opens_at = models.DateTimeField(null=True, blank=True)
    enrollment_closes_at = models.DateTimeField(null=True, blank=True)
    eligibility = models.ForeignKey("core.EligibilityRule", null=True, blank=True, on_delete=models.SET_NULL)
    refund_policy = models.TextField(blank=True, help_text="Blank = site default")

    # schedule & access
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    duration_label = models.CharField(max_length=60, blank=True, help_text="e.g. 8 weeks")
    schedule_label = models.CharField(max_length=120, blank=True, help_text="e.g. Tue & Thu evenings")
    access_type = models.CharField(max_length=10, choices=ACCESS_TYPES, default=LIFETIME)
    access_days = models.PositiveIntegerField(null=True, blank=True)
    access_until = models.DateTimeField(null=True, blank=True)

    # completion & certificate
    require_all_lessons = models.BooleanField(default=True)
    require_quizzes = models.BooleanField(default=True)
    require_assignments = models.BooleanField(default=True)
    min_attendance_percent = models.PositiveIntegerField(
        null=True, blank=True, validators=[MaxValueValidator(100)], help_text="Blank = no attendance requirement"
    )
    issue_certificate = models.BooleanField(default=True)
    certificate_template = models.ForeignKey(
        "certificates.CertificateTemplate", null=True, blank=True, on_delete=models.SET_NULL, help_text="Blank = default"
    )
    recording_policy = models.CharField(max_length=10, choices=RECORDING_POLICIES, default=REC_REVIEW)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-featured", "starts_at", "title"]
        permissions = [("manage_all_courses", "Can manage every course (not just assigned ones)")]

    def __str__(self):
        return self.title

    @property
    def is_free(self):
        return self.price <= 0

    def clean(self):
        self.currency = (self.currency or "").upper()
        if self.access_type == self.DAYS and not self.access_days:
            raise ValidationError({"access_days": "Set the number of days."})
        if self.access_type == self.UNTIL and not self.access_until:
            raise ValidationError({"access_until": "Set the end date."})
        if not self.is_free and len(self.currency) != 3:
            raise ValidationError({"currency": "Use a 3-letter ISO currency code."})


class CourseInstructor(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="course_instructors")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="course_assignments")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [("course", "user")]
        ordering = ["order"]

    def __str__(self):
        return f"{self.user} → {self.course}"


class PublishStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"


class Module(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="modules")
    title = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=PublishStatus.choices, default=PublishStatus.PUBLISHED)
    release_at = models.DateTimeField(null=True, blank=True, help_text="Hidden from students until this time")

    class Meta:
        ordering = ["course", "order", "id"]

    def __str__(self):
        return f"{self.course} · {self.title}"


class Lesson(models.Model):
    VIDEO, PDF, TEXT, FILE = "video", "pdf", "text", "file"
    KINDS = [(VIDEO, "Video"), (PDF, "PDF"), (TEXT, "Text"), (FILE, "File")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="lessons")
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=KINDS, default=VIDEO)
    video_url = models.URLField(blank=True, help_text="YouTube (unlisted), Vimeo, Bunny or a direct .mp4 link")
    body = models.TextField(blank=True, help_text="Markdown notes")
    file = models.FileField(upload_to=randomized_name("lessons"), blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=PublishStatus.choices, default=PublishStatus.PUBLISHED)
    release_at = models.DateTimeField(null=True, blank=True)
    required = models.BooleanField(default=True, help_text="Counts toward completion")
    prerequisite_lesson = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="unlocks"
    )
    prerequisite_quiz = models.ForeignKey(
        "assessments.Quiz", null=True, blank=True, on_delete=models.SET_NULL, related_name="unlocks_lessons"
    )
    prerequisite_min_percent = models.PositiveIntegerField(null=True, blank=True, validators=[MaxValueValidator(100)])

    class Meta:
        ordering = ["module__order", "order", "title"]

    def __str__(self):
        return self.title

    @property
    def course(self):
        return self.module.course

    def clean(self):
        if self.kind == self.VIDEO and not self.video_url:
            raise ValidationError({"video_url": "Video lessons need a video URL."})
        if self.kind in (self.PDF, self.FILE) and not self.file:
            raise ValidationError({"file": "Attach a file."})
        if self.prerequisite_lesson_id and self.prerequisite_lesson_id == self.id:
            raise ValidationError({"prerequisite_lesson": "A lesson can't require itself."})
