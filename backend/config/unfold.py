"""Staff panel (Django admin + Unfold) configuration: theme and navigation."""

from django.templatetags.static import static
from django.urls import reverse_lazy


def _perm(codename):
    return lambda request: request.user.is_superuser or request.user.has_perm(codename)


def _item(title, icon, url_name, perm):
    return {"title": title, "icon": icon, "link": reverse_lazy(url_name), "permission": _perm(perm)}


UNFOLD = {
    "SITE_TITLE": "Hikmah Staff",
    "SITE_HEADER": "Hikmah Staff",
    "SITE_SUBHEADER": "Hikmah Online LMS",
    "SITE_SYMBOL": "school",
    "SITE_URL": "/",
    "SITE_FAVICONS": [{"rel": "icon", "type": "image/svg+xml", "href": lambda request: static("brand/favicon.svg")}],
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "DASHBOARD_CALLBACK": "apps.core.dashboard.dashboard_callback",
    "ENVIRONMENT": "apps.core.dashboard.environment_callback",
    "STYLES": [lambda request: static("brand/admin.css")],
    # Navy #003399 at 700, scaled around it.
    "COLORS": {
        "primary": {
            "50": "oklch(97% .015 265)",
            "100": "oklch(93.5% .035 265)",
            "200": "oklch(87% .07 265)",
            "300": "oklch(77% .12 265)",
            "400": "oklch(64% .17 265)",
            "500": "oklch(52% .2 265)",
            "600": "oklch(44% .2 265)",
            "700": "oklch(37.6% .19 265)",
            "800": "oklch(32% .16 265)",
            "900": "oklch(27% .13 265)",
            "950": "oklch(20% .1 265)",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "Overview",
                "items": [
                    {"title": "Dashboard", "icon": "dashboard", "link": reverse_lazy("admin:index")},
                ],
            },
            {
                "title": "Catalog",
                "collapsible": True,
                "items": [
                    _item("Courses", "school", "admin:courses_course_changelist", "courses.view_course"),
                    _item("Modules & lessons", "view_list", "admin:courses_module_changelist", "courses.view_module"),
                    _item("Categories", "category", "admin:core_category_changelist", "core.view_category"),
                    _item(
                        "Bank accounts",
                        "account_balance",
                        "admin:payments_bankaccount_changelist",
                        "payments.view_bankaccount",
                    ),
                ],
            },
            {
                "title": "Teaching",
                "collapsible": True,
                "items": [
                    _item("Live sessions", "videocam", "admin:live_livesession_changelist", "live.view_livesession"),
                    _item(
                        "Attendance", "how_to_reg", "admin:live_attendancerecord_changelist", "live.view_attendancerecord"
                    ),
                    _item("Quizzes", "quiz", "admin:assessments_quiz_changelist", "assessments.view_quiz"),
                    _item(
                        "Assignments", "assignment", "admin:assessments_assignment_changelist", "assessments.view_assignment"
                    ),
                    _item(
                        "Grading: submissions",
                        "grading",
                        "admin:assessments_submission_changelist",
                        "assessments.view_submission",
                    ),
                    _item(
                        "Grading: short answers",
                        "rate_review",
                        "admin:assessments_answer_changelist",
                        "assessments.view_answer",
                    ),
                    _item(
                        "Quiz attempts", "fact_check", "admin:assessments_quizattempt_changelist", "assessments.view_quizattempt"
                    ),
                ],
            },
            {
                "title": "People",
                "collapsible": True,
                "items": [
                    _item("Payments", "payments", "admin:payments_paymentsubmission_changelist", "payments.view_paymentsubmission"),
                    _item("Enrollments", "group_add", "admin:enrollments_enrollment_changelist", "enrollments.view_enrollment"),
                    _item("Users", "person", "admin:accounts_user_changelist", "accounts.view_user"),
                    _item("Certificates", "workspace_premium", "admin:certificates_certificate_changelist", "certificates.view_certificate"),
                    _item(
                        "Deletion requests", "person_remove", "admin:accounts_deletionrequest_changelist", "accounts.view_deletionrequest"
                    ),
                ],
            },
            {
                "title": "Site settings",
                "collapsible": True,
                "items": [
                    _item("Branding & general", "palette", "admin:core_sitesettings_changelist", "core.view_sitesettings"),
                    _item("Profile fields", "badge", "admin:accounts_profilefielddefinition_changelist", "accounts.view_profilefielddefinition"),
                    _item("Email templates", "mail", "admin:notifications_emailtemplate_changelist", "notifications.view_emailtemplate"),
                    _item(
                        "Certificate templates",
                        "design_services",
                        "admin:certificates_certificatetemplate_changelist",
                        "certificates.view_certificatetemplate",
                    ),
                    _item("Feature flags", "toggle_on", "admin:core_featureflag_changelist", "core.view_featureflag"),
                    _item("Pages", "article", "admin:core_page_changelist", "core.view_page"),
                    _item("Eligibility rules", "rule", "admin:core_eligibilityrule_changelist", "core.view_eligibilityrule"),
                ],
            },
            {
                "title": "System",
                "collapsible": True,
                "items": [
                    _item("Roles (groups)", "admin_panel_settings", "admin:auth_group_changelist", "auth.view_group"),
                    _item("Audit log", "history", "admin:core_auditlog_changelist", "core.view_auditlog"),
                    _item("Background tasks", "schedule", "admin:django_q_schedule_changelist", "django_q.view_schedule"),
                ],
            },
        ],
    },
}
