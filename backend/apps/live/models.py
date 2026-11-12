import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models

from apps.courses.video import detect_meeting_platform


class LiveSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE, related_name="live_sessions")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, help_text="Markdown: agenda, pre-reading")
    starts_at = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    join_url = models.URLField(help_text="Zoom / Google Meet / Teams link. Never emailed; shown only to enrolled students.")
    recording_url = models.URLField(blank=True)
    recording_published = models.BooleanField(default=False)
    recording_published_at = models.DateTimeField(null=True, blank=True)
    counts_for_attendance = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["starts_at"]

    def __str__(self):
        return f"{self.course} · {self.title}"

    @property
    def ends_at(self):
        return self.starts_at + timedelta(minutes=self.duration_minutes)

    @property
    def platform(self):
        return detect_meeting_platform(self.join_url)


class AttendanceRecord(models.Model):
    PRESENT, LATE, ABSENT = "present", "late", "absent"
    STATUSES = [(PRESENT, "Present"), (LATE, "Late"), (ABSENT, "Absent")]

    session = models.ForeignKey(LiveSession, on_delete=models.CASCADE, related_name="attendance")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attendance")
    status = models.CharField(max_length=10, choices=STATUSES, blank=True, help_text="Final status set by the instructor")
    join_clicked_at = models.DateTimeField(null=True, blank=True, help_text="Signal only: when the student clicked Join")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("session", "user")]
        ordering = ["session__starts_at", "user__full_name"]

    def __str__(self):
        return f"{self.user} @ {self.session}: {self.status or '—'}"
