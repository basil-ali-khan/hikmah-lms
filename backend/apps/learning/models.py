from django.conf import settings
from django.db import models


class LessonProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="lesson_progress")
    lesson = models.ForeignKey("courses.Lesson", on_delete=models.CASCADE, related_name="progress")
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "lesson")]
        verbose_name_plural = "lesson progress"

    def __str__(self):
        return f"{self.user} completed {self.lesson}"
