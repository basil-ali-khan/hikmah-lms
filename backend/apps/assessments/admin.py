from django import forms
from django.contrib import admin
from django.utils.html import format_html
from import_export import fields, resources
from import_export.admin import ExportActionModelAdmin
from unfold.admin import StackedInline, TabularInline
from unfold.contrib.import_export.forms import ExportForm
from unfold.decorators import display
from unfold.widgets import UnfoldBooleanSwitchWidget

from apps.core.admin_base import CourseScopedAdmin, run_service
from apps.core.files import secure_url

from .models import Answer, Assignment, Choice, Question, Quiz, QuizAttempt, Submission
from .services import grade_answer, grade_submission, request_assignment_resubmission


class ChoiceInline(TabularInline):
    model = Choice
    extra = 2
    fields = ["text", "is_correct", "order"]


class QuestionInline(StackedInline):
    model = Question
    extra = 0
    fields = [("kind", "points", "order"), "text", "model_answer"]
    show_change_link = True


@admin.register(Quiz)
class QuizAdmin(CourseScopedAdmin):
    list_display = ["title", "course", "module", "status", "question_count", "time_limit_minutes", "pass_percent", "closes_at"]
    list_filter = ["course", "status"]
    search_fields = ["title"]
    inlines = [QuestionInline]
    fieldsets = [
        (None, {"fields": ["course", "module", "title", "instructions", ("status", "order"), "required"]}),
        ("Rules", {"fields": [("time_limit_minutes", "pass_percent"), ("max_attempts", "score_policy"),
                              ("opens_at", "closes_at"), "show_answers", ("shuffle_questions", "shuffle_choices")],
                   "description": "Timers are enforced on the server. Save, then open each question to add its options."}),
    ]

    @display(description="Questions")
    def question_count(self, obj):
        return obj.questions.count()


@admin.register(Question)
class QuestionAdmin(CourseScopedAdmin):
    course_path = "quiz__course"
    list_display = ["text", "quiz", "kind", "points", "order"]
    list_filter = ["quiz__course", "quiz", "kind"]
    inlines = [ChoiceInline]
    fields = ["quiz", "kind", "text", "points", "order", "model_answer"]

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        from apps.courses.services import can_manage_all_courses, courses_for_staff

        if db_field.name == "quiz" and not can_manage_all_courses(request.user):
            kwargs["queryset"] = Quiz.objects.filter(course__in=courses_for_staff(request.user))
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def has_module_permission(self, request):
        return False  # reached from the quiz page


@admin.register(Assignment)
class AssignmentAdmin(CourseScopedAdmin):
    list_display = ["title", "course", "module", "due_at", "status", "to_grade"]
    list_filter = ["course", "status"]
    search_fields = ["title"]
    fields = ["course", "module", "title", "instructions", "attachment", "due_at", "allow_late",
              ("max_score", "pass_score"), "required", ("status", "order")]

    @display(description="Awaiting grade")
    def to_grade(self, obj):
        return obj.submissions.filter(status=Submission.SUBMITTED).count()


class GradeForm(forms.ModelForm):
    grade = forms.DecimalField(required=False, min_value=0, decimal_places=2)
    feedback_text = forms.CharField(label="Feedback to student", required=False, widget=forms.Textarea(attrs={"rows": 4}))
    ask_resubmission = forms.BooleanField(label="Request resubmission instead of grading", required=False,
                                          widget=UnfoldBooleanSwitchWidget)

    class Meta:
        model = Submission
        fields = []


class SubmissionResource(resources.ModelResource):
    student = fields.Field(attribute="user__full_name", column_name="Student")
    email = fields.Field(attribute="user__email", column_name="Email")
    assignment_title = fields.Field(attribute="assignment__title", column_name="Assignment")
    course = fields.Field(attribute="assignment__course__title", column_name="Course")

    class Meta:
        model = Submission
        fields = ["course", "assignment_title", "student", "email", "submitted_at", "is_late", "status", "score", "graded_at"]
        export_order = fields


@admin.register(Submission)
class SubmissionAdmin(CourseScopedAdmin, ExportActionModelAdmin):
    course_path = "assignment__course"
    form = GradeForm
    export_form_class = ExportForm
    resource_classes = [SubmissionResource]
    list_display = ["user", "assignment", "submitted_at", "late_badge", "status_badge", "score"]
    list_filter = ["status", "assignment__course", "is_late", "assignment"]
    search_fields = ["user__email", "user__full_name", "assignment__title"]
    readonly_fields = ["user", "assignment", "submitted_at", "is_late", "status", "answer_text", "file_link", "score",
                       "feedback", "graded_by", "graded_at"]
    fieldsets = [
        ("Submission", {"fields": ["user", "assignment", "submitted_at", "is_late", "answer_text", "file_link"]}),
        ("Current grade", {"fields": ["status", "score", "feedback", "graded_by", "graded_at"]}),
        ("Grade it", {"fields": ["grade", "feedback_text", "ask_resubmission"]}),
    ]

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        feedback = form.cleaned_data.get("feedback_text") or ""
        if form.cleaned_data.get("ask_resubmission"):
            run_service(request, request_assignment_resubmission, obj, feedback, request.user, request=request,
                        success="Resubmission requested.")
        elif form.cleaned_data.get("grade") is not None:
            run_service(request, grade_submission, obj, form.cleaned_data["grade"], feedback, request.user,
                        request=request, success="Graded — the student has been notified.")

    def save_related(self, request, form, formsets, change):
        pass

    @display(description="Answer")
    def answer_text(self, obj):
        return obj.text or "—"

    @display(description="File")
    def file_link(self, obj):
        if not obj.file:
            return "—"
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', secure_url(obj.file, obj.file_name),
                           obj.file_name or "Open file")

    @display(description="Late", boolean=True)
    def late_badge(self, obj):
        return obj.is_late

    @display(description="Status", label={"submitted": "warning", "graded": "success", "resubmit": "info"})
    def status_badge(self, obj):
        return obj.status


class AnswerGradeForm(forms.ModelForm):
    points = forms.DecimalField(required=True, min_value=0, decimal_places=2)
    feedback_text = forms.CharField(label="Feedback", required=False, widget=forms.Textarea(attrs={"rows": 3}))

    class Meta:
        model = Answer
        fields = []


@admin.register(Answer)
class ShortAnswerAdmin(CourseScopedAdmin):
    course_path = "attempt__quiz__course"
    form = AnswerGradeForm
    list_display = ["student", "quiz", "question_text", "graded"]
    list_filter = ["attempt__quiz__course", "attempt__quiz"]
    readonly_fields = ["student", "quiz", "question_text", "max_points", "model_answer", "text", "points_awarded", "feedback",
                       "graded_by", "graded_at"]
    fieldsets = [
        (None, {"fields": ["student", "quiz", "question_text", "max_points", "model_answer", "text"]}),
        ("Current", {"fields": ["points_awarded", "feedback", "graded_by", "graded_at"]}),
        ("Grade it", {"fields": ["points", "feedback_text"]}),
    ]

    def get_queryset(self, request):
        return super().get_queryset(request).filter(question__kind=Question.SHORT).exclude(attempt__status="in_progress")

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        run_service(request, grade_answer, obj, form.cleaned_data["points"], form.cleaned_data.get("feedback_text"),
                    request.user, request=request, success="Answer graded.")

    def save_related(self, request, form, formsets, change):
        pass

    @display(description="Student")
    def student(self, obj):
        return obj.attempt.user

    @display(description="Quiz")
    def quiz(self, obj):
        return obj.attempt.quiz.title

    @display(description="Question")
    def question_text(self, obj):
        return obj.question.text

    @display(description="Max points")
    def max_points(self, obj):
        return obj.question.points

    @display(description="Model answer")
    def model_answer(self, obj):
        return obj.question.model_answer or "—"

    @display(description="Graded", boolean=True)
    def graded(self, obj):
        return obj.points_awarded is not None


class AttemptResource(resources.ModelResource):
    student = fields.Field(attribute="user__full_name", column_name="Student")
    email = fields.Field(attribute="user__email", column_name="Email")
    quiz_title = fields.Field(attribute="quiz__title", column_name="Quiz")
    course = fields.Field(attribute="quiz__course__title", column_name="Course")

    class Meta:
        model = QuizAttempt
        fields = ["course", "quiz_title", "student", "email", "number", "started_at", "submitted_at", "status", "score",
                  "max_score", "percent", "auto_submitted"]
        export_order = fields


@admin.register(QuizAttempt)
class QuizAttemptAdmin(CourseScopedAdmin, ExportActionModelAdmin):
    course_path = "quiz__course"
    export_form_class = ExportForm
    resource_classes = [AttemptResource]
    list_display = ["user", "quiz", "number", "status", "percent", "submitted_at", "auto_submitted"]
    list_filter = ["quiz__course", "quiz", "status"]
    search_fields = ["user__email", "user__full_name"]
    readonly_fields = [f.name for f in QuizAttempt._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
