from django.urls import path

from apps.accounts import api as accounts
from apps.assessments import api as assessments
from apps.certificates import api as certificates
from apps.core import api_views as core
from apps.courses import api as courses
from apps.enrollments import api as enrollments
from apps.learning import api as learning
from apps.learning import dashboard_api as dashboard
from apps.notifications import api as notifications

urlpatterns = [
    # public
    path("csrf", core.CsrfView.as_view()),
    path("site-config", core.SiteConfigView.as_view()),
    path("pages/<slug:slug>", core.PageView.as_view()),
    path("categories", core.CategoryListView.as_view()),
    path("profile-fields", accounts.ProfileFieldsView.as_view()),
    path("courses", courses.CourseListView.as_view()),
    path("courses/<slug:slug>", courses.CourseDetailView.as_view()),
    path("verify/<str:code>", certificates.VerifyView.as_view()),
    # me
    path("me", accounts.MeView.as_view()),
    path("me/export", accounts.ExportView.as_view()),
    path("me/deletion-request", accounts.DeletionRequestView.as_view()),
    path("me/dashboard", dashboard.DashboardView.as_view()),
    path("me/schedule", dashboard.ScheduleView.as_view()),
    path("me/enrollments", enrollments.MyEnrollmentsView.as_view()),
    path("me/certificates", certificates.MyCertificatesView.as_view()),
    path("notifications", notifications.NotificationListView.as_view()),
    path("notifications/read-all", notifications.NotificationReadView.as_view()),
    path("notifications/<int:pk>/read", notifications.NotificationReadView.as_view()),
    # enrollment & payment
    path("courses/<slug:slug>/enroll", enrollments.EnrollView.as_view()),
    path("enrollments/<uuid:pk>", enrollments.EnrollmentDetailView.as_view()),
    path("enrollments/<uuid:pk>/payments", enrollments.PaymentSubmitView.as_view()),
    path("payments/<uuid:pk>/receipt", enrollments.ReceiptView.as_view()),
    # learning
    path("learn/<slug:slug>", learning.LearnCourseView.as_view()),
    path("learn/<slug:slug>/live", learning.CourseLiveView.as_view()),
    path("learn/<slug:slug>/grades", learning.CourseGradesView.as_view()),
    path("lessons/<uuid:pk>", learning.LessonView.as_view()),
    path("lessons/<uuid:pk>/complete", learning.LessonCompleteView.as_view()),
    path("lessons/<uuid:pk>/file", learning.LessonFileView.as_view()),
    path("live/<uuid:pk>", learning.SessionDetailView.as_view()),
    path("live/<uuid:pk>/join", learning.SessionJoinView.as_view()),
    path("live/<uuid:pk>/ics", learning.SessionIcsView.as_view()),
    # assessments
    path("quizzes/<uuid:pk>", assessments.QuizDetailView.as_view()),
    path("quizzes/<uuid:pk>/attempts", assessments.StartAttemptView.as_view()),
    path("attempts/<uuid:pk>", assessments.AttemptView.as_view()),
    path("attempts/<uuid:pk>/answers/<int:question_id>", assessments.SaveAnswerView.as_view()),
    path("attempts/<uuid:pk>/submit", assessments.SubmitAttemptView.as_view()),
    path("attempts/<uuid:pk>/result", assessments.AttemptResultView.as_view()),
    path("assignments/<uuid:pk>", assessments.AssignmentView.as_view()),
    path("assignments/<uuid:pk>/attachment", assessments.AssignmentAttachmentView.as_view()),
    path("assignments/<uuid:pk>/submit", assessments.AssignmentSubmitView.as_view()),
    path("submissions/<uuid:pk>/file", assessments.SubmissionFileView.as_view()),
    path("certificates/<str:code>/download", certificates.CertificateDownloadView.as_view()),
]
