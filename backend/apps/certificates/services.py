"""Completion rules → automatic certificates with a random ID and QR verification."""

import base64
import io
import mimetypes

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.template import Context, Template
from django.utils import timezone

from apps.core.models import SiteSettings
from apps.core.services import NotAllowed, ServiceError, audit, short_code
from apps.core.tasks import run_async
from apps.enrollments.models import Enrollment

from .models import Certificate, CertificateTemplate


def completion_status(user, course):
    from apps.assessments.models import Assignment, Quiz
    from apps.assessments.services import assignment_state, quiz_passed
    from apps.courses.models import PublishStatus
    from apps.learning.services import course_progress
    from apps.live.services import attendance_summary

    reqs = []
    if course.require_all_lessons:
        p = course_progress(user, course)
        if p["total"]:
            reqs.append({"key": "lessons", "label": "Required lessons completed", "met": p["completed"] == p["total"],
                         "progress": f"{p['completed']} / {p['total']}"})
    if course.require_quizzes:
        quizzes = list(Quiz.objects.filter(course=course, required=True, status=PublishStatus.PUBLISHED))
        if quizzes:
            passed = sum(1 for q in quizzes if quiz_passed(user, q))
            reqs.append({"key": "quizzes", "label": "Required quizzes passed", "met": passed == len(quizzes),
                         "progress": f"{passed} / {len(quizzes)}"})
    if course.require_assignments:
        assignments = list(Assignment.objects.filter(course=course, required=True, status=PublishStatus.PUBLISHED))
        if assignments:
            passed = sum(1 for a in assignments if assignment_state(user, a)["passed"])
            reqs.append({"key": "assignments", "label": "Required assignments passed", "met": passed == len(assignments),
                         "progress": f"{passed} / {len(assignments)}"})
    if course.min_attendance_percent is not None and course.live_sessions.filter(counts_for_attendance=True).exists():
        a = attendance_summary(user, course)
        reqs.append({"key": "attendance", "label": f"Live attendance ≥ {course.min_attendance_percent}%",
                     "met": a["percent"] is not None and a["percent"] >= course.min_attendance_percent,
                     "progress": f"{a['percent']}%" if a["percent"] is not None else "No classes yet"})
    complete = bool(reqs) and all(r["met"] for r in reqs)
    return {"complete": complete, "issues_certificate": course.issue_certificate, "requirements": reqs}


def maybe_issue_certificate(user, course):
    existing = Certificate.objects.filter(user=user, course=course).first()
    if existing:
        return existing
    enrollment = Enrollment.objects.filter(user=user, course=course).first()
    if not enrollment or not enrollment.is_currently_active:
        return None
    status = completion_status(user, course)
    if not status["complete"]:
        return None
    if not enrollment.completed_at:
        enrollment.completed_at = timezone.now()
        enrollment.save(update_fields=["completed_at", "updated_at"])
    if not course.issue_certificate:
        return None
    cert = None
    for _ in range(5):
        try:
            with transaction.atomic():
                cert = Certificate.objects.create(
                    code=short_code("HKM"), user=user, course=course, student_name=user.full_name or user.email,
                    completed_on=timezone.now().date(),
                )
            break
        except IntegrityError:
            existing = Certificate.objects.filter(user=user, course=course).first()
            if existing:
                return existing
    if cert is None:
        return None
    audit(None, "certificate.issue", cert, {"rules": [r["key"] for r in status["requirements"]]})
    run_async("apps.certificates.services.generate_pdf_task", str(cert.id))

    from apps.notifications.models import Event
    from apps.notifications.services import notify

    notify(user, Event.CERTIFICATE_ISSUED, {
        "course": {"title": course.title},
        "certificate": {"code": cert.code, "completed_on": cert.completed_on.strftime("%d %b %Y")},
        "links": {"certificate": f"{settings.SITE_URL}/certificates", "verify": f"{settings.SITE_URL}/verify/{cert.code}"},
    }, link="/certificates")
    return cert


def generate_pdf_task(cert_id):
    cert = Certificate.objects.select_related("course", "user").get(pk=cert_id)
    ensure_pdf(cert)


def ensure_pdf(cert):
    if not cert.pdf:
        pdf = render_certificate_pdf(cert)
        cert.pdf.save(f"{cert.code}.pdf", ContentFile(pdf), save=True)
    return cert.pdf


def _data_uri(field_file):
    if not field_file:
        return ""
    try:
        with field_file.storage.open(field_file.name, "rb") as fh:
            payload = fh.read()
    except OSError:
        return ""
    mime = mimetypes.guess_type(field_file.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(payload).decode()}"


def _qr_data_uri(text):
    img = qrcode.make(text, box_size=8, border=1)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def render_certificate_pdf(cert):
    from weasyprint import HTML
    from weasyprint.urls import URLFetcher

    site = SiteSettings.load()
    template = cert.course.certificate_template or CertificateTemplate.objects.filter(is_default=True).first()
    if template is None:
        template = CertificateTemplate(name="Fallback")
    verify_url = f"{settings.SITE_URL}/verify/{cert.code}"
    meta = " · ".join(filter(None, [cert.course.get_course_type_display(), cert.course.duration_label]))
    grade = ""
    ctx = Context({
        "institute_name": site.institute_name, "title": template.title_text, "student_name": cert.student_name,
        "course_title": cert.course.title, "course_meta": meta, "completed_on": cert.completed_on.strftime("%d %B %Y"),
        "grade": grade, "code": cert.code, "verify_url": verify_url.replace("https://", "").replace("http://", ""),
        "signatory_name": template.signatory_name, "signatory_title": template.signatory_title,
        "logo_url": _data_uri(site.logo), "signature_url": _data_uri(template.signature_image),
        "qr_data_uri": _qr_data_uri(verify_url),
        "color_primary": site.color_primary, "color_accent": site.color_accent, "color_heading": site.color_heading,
        "color_text": site.color_text,
    })
    body = Template(template.html).render(ctx)
    css = Template(template.css).render(ctx)
    document = f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body>{body}</body></html>"
    # Only data: URIs may load: admin-edited templates must never make the server fetch URLs (SSRF).
    return HTML(string=document, url_fetcher=URLFetcher(allowed_protocols={"data"})).write_pdf()


def verify(code):
    code = (code or "").strip().upper()
    cert = Certificate.objects.select_related("course").filter(code=code).first()
    if not cert:
        return None
    return {
        "status": "valid" if cert.is_valid else "revoked",
        "code": cert.code,
        "student_name": cert.student_name,
        "course_title": cert.course.title,
        "completed_on": cert.completed_on.isoformat(),
        "issued_by": SiteSettings.load().institute_name,
        "revoked_at": cert.revoked_at.isoformat() if cert.revoked_at else None,
    }


@transaction.atomic
def revoke_certificate(cert, actor, reason, request=None):
    if not (actor and (actor.is_superuser or actor.has_perm("certificates.change_certificate"))):
        raise NotAllowed("You don't have permission to revoke certificates.")
    if not (reason or "").strip():
        raise ServiceError("A reason is required.", "reason_required")
    if cert.revoked_at:
        return cert
    cert.revoked_at = timezone.now()
    cert.revoked_reason = reason
    cert.revoked_by = actor
    cert.save(update_fields=["revoked_at", "revoked_reason", "revoked_by"])
    audit(actor, "certificate.revoke", cert, {"reason": reason}, request=request)
    return cert
