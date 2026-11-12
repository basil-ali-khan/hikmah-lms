"""In-app notifications + branded emails from admin-editable templates, and scheduled reminders."""

import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from apps.core.models import SiteSettings
from apps.core.services import render_markdown
from apps.core.tasks import run_async

from .models import EmailTemplate, Event, Notification, ReminderLog
from .rendering import render_text

log = logging.getLogger(__name__)


def absolute(link):
    if not link:
        return settings.SITE_URL
    return link if link.startswith("http") else f"{settings.SITE_URL}{link}"


def course_link(course):
    return f"/learn/{course.slug}"


def _base_context(user, link=None):
    site = SiteSettings.load()
    url = absolute(link)
    return {
        "student": {"first_name": user.first_name if user else "there", "full_name": user.full_name if user else ""},
        "site": {"name": site.institute_name, "support_email": site.support_email, "review_eta": site.payment_review_eta},
        "links": {"dashboard": absolute("/dashboard"), "course": url, "payment": url, "session": url, "item": url,
                  "certificate": url, "verify": url, "action": url},
    }


def _merge(base, extra):
    out = dict(base)
    for key, value in (extra or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = {**out[key], **value}
        else:
            out[key] = value
    return out


def build_email(template, context):
    site = SiteSettings.load()
    subject = " ".join(render_text(template.subject, context).split())[:200]
    text = render_text(template.body, context)
    body_html = render_markdown(render_text(template.body, context, html_escape=True))
    logo_url = site.logo.url if site.logo else ""
    html = render_to_string("emails/base.html", {"site": site, "body": body_html, "subject": subject, "logo_url": logo_url,
                                                 "site_url": settings.SITE_URL})
    return subject, text, html


def deliver_email(to_email, subject, text, html):
    msg = EmailMultiAlternatives(subject=subject, body=text, from_email=settings.DEFAULT_FROM_EMAIL, to=[to_email])
    msg.attach_alternative(html, "text/html")
    site = SiteSettings.load()
    if site.support_email:
        msg.reply_to = [site.support_email]
    msg.send()


def send_templated_email(event, to_email, user, context):
    template = EmailTemplate.objects.filter(event=event).first()
    if not template or not template.enabled:
        return False
    ctx = _merge(_base_context(user), context)
    subject, text, html = build_email(template, ctx)
    run_async("apps.notifications.services.deliver_email", to_email, subject, text, html)
    return True


REMINDER_EVENTS = {Event.CLASS_REMINDER: "class_reminders", Event.DEADLINE_REMINDER: "deadline_reminders"}


def notify(user, event, context=None, link="", email=True):
    """Create an in-app notification and (if the template is on and the user allows it) send the email."""
    ctx = _merge(_base_context(user, link), context or {})
    template = EmailTemplate.objects.filter(event=event).first()
    title = " ".join(render_text(template.subject, ctx).split())[:200] if template else Event(event).label
    Notification.objects.create(user=user, event=event, title=title, link=link or "")
    if not email or not template or not template.enabled or not user.email:
        return
    pref = REMINDER_EVENTS.get(event)
    if pref and not getattr(user.profile, pref, True):
        return
    subject, text, html = build_email(template, ctx)
    run_async("apps.notifications.services.deliver_email", user.email, subject, text, html)


# --- reminders ------------------------------------------------------------------


def humanize_until(target, now):
    minutes = int((target - now).total_seconds() // 60)
    if minutes < 60:
        return f"in {max(minutes, 1)} minutes"
    hours = round(minutes / 60)
    if hours < 20:
        return "in 1 hour" if hours == 1 else f"in {hours} hours"
    return "tomorrow" if hours < 36 else f"in {round(hours / 24)} days"


def _due_offset(user, kind, object_id, target, offsets, now):
    due = sorted(o for o in offsets if now >= target - timedelta(minutes=o))
    if not due:
        return None
    nearest = due[0]
    if ReminderLog.objects.filter(kind=kind, object_id=object_id, offset_minutes=nearest, user=user).exists():
        return None
    for offset in due:
        ReminderLog.objects.get_or_create(kind=kind, object_id=object_id, offset_minutes=offset, user=user)
    return nearest


def _active_students(course):
    from apps.enrollments.models import Enrollment

    for e in Enrollment.objects.filter(course=course, status=Enrollment.ACTIVE).select_related("user", "user__profile"):
        if e.is_currently_active:
            yield e.user


def send_due_reminders(now=None):
    from apps.assessments.models import Assignment, Quiz, Submission
    from apps.courses.models import PublishStatus
    from apps.live.models import LiveSession

    now = now or timezone.now()
    site = SiteSettings.load()
    sent = 0

    live_offsets = site.live_reminder_offsets or [1440, 60]
    horizon = now + timedelta(minutes=max(live_offsets))
    for session in LiveSession.objects.filter(starts_at__gt=now, starts_at__lte=horizon).select_related("course"):
        for user in _active_students(session.course):
            if not user.profile.class_reminders:
                continue
            if _due_offset(user, "live", str(session.id), session.starts_at, live_offsets, now) is None:
                continue
            notify(user, Event.CLASS_REMINDER, {
                "course": {"title": session.course.title},
                "session": {"title": session.title, "starts_at": session.starts_at.strftime("%a %d %b %Y, %H:%M"),
                            "when": humanize_until(session.starts_at, now)},
            }, link=f"/learn/{session.course.slug}/live")
            sent += 1

    deadline_offsets = site.deadline_reminder_offsets or [1440]
    horizon = now + timedelta(minutes=max(deadline_offsets))
    pub = PublishStatus.PUBLISHED
    items = [("quiz", q, q.closes_at, f"/learn/{q.course.slug}/quizzes/{q.id}")
             for q in Quiz.objects.filter(status=pub, closes_at__gt=now, closes_at__lte=horizon).select_related("course")]
    items += [("assignment", a, a.due_at, f"/learn/{a.course.slug}/assignments/{a.id}")
              for a in Assignment.objects.filter(status=pub, due_at__gt=now, due_at__lte=horizon).select_related("course")]
    for kind, item, due, link in items:
        for user in _active_students(item.course):
            if not user.profile.deadline_reminders:
                continue
            if kind == "assignment" and Submission.objects.filter(assignment=item, user=user).exists():
                continue
            if kind == "quiz" and item.attempts.filter(user=user).exclude(status="in_progress").exists():
                continue
            if _due_offset(user, kind, str(item.id), due, deadline_offsets, now) is None:
                continue
            notify(user, Event.DEADLINE_REMINDER, {
                "course": {"title": item.course.title},
                "item": {"title": item.title, "due_at": due.strftime("%a %d %b %Y, %H:%M"), "when": humanize_until(due, now)},
            }, link=link)
            sent += 1
    return sent
