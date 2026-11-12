import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.files import randomized_name
from apps.courses.models import PublishStatus


class Quiz(models.Model):
    HIGHEST, LATEST = "highest", "latest"
    SHOW_IMMEDIATELY, SHOW_AFTER_CLOSE, SHOW_NEVER = "immediately", "after_close", "never"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE, related_name="quizzes")
    module = models.ForeignKey("courses.Module", null=True, blank=True, on_delete=models.SET_NULL, related_name="quizzes")
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True, help_text="Markdown")
    time_limit_minutes = models.PositiveIntegerField(null=True, blank=True, help_text="Blank = no time limit")
    pass_percent = models.PositiveIntegerField(default=60, validators=[MaxValueValidator(100)])
    max_attempts = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    score_policy = models.CharField(max_length=10, choices=[(HIGHEST, "Highest"), (LATEST, "Latest")], default=HIGHEST)
    opens_at = models.DateTimeField(null=True, blank=True)
    closes_at = models.DateTimeField(null=True, blank=True)
    show_answers = models.CharField(
        max_length=12,
        choices=[(SHOW_IMMEDIATELY, "Immediately"), (SHOW_AFTER_CLOSE, "After the quiz closes"), (SHOW_NEVER, "Never")],
        default=SHOW_AFTER_CLOSE,
    )
    shuffle_questions = models.BooleanField(default=False)
    shuffle_choices = models.BooleanField(default=False)
    required = models.BooleanField(default=True, help_text="Must be passed for the certificate")
    status = models.CharField(max_length=10, choices=PublishStatus.choices, default=PublishStatus.PUBLISHED)
    order = models.PositiveIntegerField(default=100, help_text="Position inside its module")

    class Meta:
        ordering = ["course", "order"]
        verbose_name_plural = "quizzes"

    def __str__(self):
        return f"{self.course} · {self.title}"


class Question(models.Model):
    SINGLE, MULTI, SHORT = "single", "multi", "short"
    KINDS = [(SINGLE, "Single choice"), (MULTI, "Multiple choice"), (SHORT, "Short answer (graded by hand)")]

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    kind = models.CharField(max_length=10, choices=KINDS, default=SINGLE)
    text = models.TextField()
    points = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("1"))
    order = models.PositiveIntegerField(default=0)
    model_answer = models.TextField(blank=True, help_text="Shown to graders only")

    class Meta:
        ordering = ["quiz", "order", "id"]

    def __str__(self):
        return self.text[:80]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices")
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["question", "order", "id"]

    def __str__(self):
        return self.text


class QuizAttempt(models.Model):
    IN_PROGRESS, SUBMITTED, NEEDS_GRADING = "in_progress", "submitted", "needs_grading"
    STATUSES = [(IN_PROGRESS, "In progress"), (NEEDS_GRADING, "Needs grading"), (SUBMITTED, "Graded")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_attempts")
    number = models.PositiveIntegerField()
    started_at = models.DateTimeField(auto_now_add=True)
    deadline_at = models.DateTimeField(null=True, blank=True, help_text="Server-enforced")
    submitted_at = models.DateTimeField(null=True, blank=True)
    auto_submitted = models.BooleanField(default=False)
    status = models.CharField(max_length=15, choices=STATUSES, default=IN_PROGRESS, db_index=True)
    score = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    max_score = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    question_order = models.JSONField(default=list)
    choice_order = models.JSONField(default=dict)

    class Meta:
        unique_together = [("quiz", "user", "number")]
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.user} · {self.quiz.title} #{self.number}"


class Answer(models.Model):
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="answers")
    selected_choices = models.ManyToManyField(Choice, blank=True)
    text = models.TextField(blank=True)
    is_correct = models.BooleanField(null=True)
    points_awarded = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    feedback = models.TextField(blank=True)
    graded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    graded_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("attempt", "question")]
        verbose_name = "short answer"

    def __str__(self):
        return f"{self.attempt} · Q{self.question.order}"


class Assignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE, related_name="assignments")
    module = models.ForeignKey("courses.Module", null=True, blank=True, on_delete=models.SET_NULL, related_name="assignments")
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True, help_text="Markdown: brief and grading criteria")
    attachment = models.FileField(upload_to=randomized_name("assignments"), blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    allow_late = models.BooleanField(default=True)
    max_score = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("100"))
    pass_score = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("50"))
    required = models.BooleanField(default=True)
    status = models.CharField(max_length=10, choices=PublishStatus.choices, default=PublishStatus.PUBLISHED)
    order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ["course", "order"]

    def __str__(self):
        return f"{self.course} · {self.title}"


class Submission(models.Model):
    SUBMITTED, GRADED, RESUBMIT = "submitted", "graded", "resubmit"
    STATUSES = [(SUBMITTED, "Awaiting grade"), (GRADED, "Graded"), (RESUBMIT, "Resubmission requested")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="submissions")
    text = models.TextField(blank=True)
    file = models.FileField(upload_to=randomized_name("submissions"), blank=True)
    file_name = models.CharField(max_length=200, blank=True)
    submitted_at = models.DateTimeField()
    is_late = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=STATUSES, default=SUBMITTED, db_index=True)
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    feedback = models.TextField(blank=True)
    graded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    graded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("assignment", "user")]
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.user} · {self.assignment.title}"

    @property
    def passed(self):
        return self.status == self.GRADED and self.score is not None and self.score >= self.assignment.pass_score
