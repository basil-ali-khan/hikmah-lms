from datetime import timedelta

import pytest
from django.core import mail
from django.core.exceptions import ValidationError
from django.utils import timezone
from freezegun import freeze_time

from apps.notifications.models import EmailTemplate, Event, Notification
from apps.notifications.rendering import render_text
from apps.notifications.services import notify, send_due_reminders
from conftest import AssignmentFactory, CourseFactory, LiveSessionFactory, enroll_active

pytestmark = pytest.mark.django_db


def test_render_escapes_html_and_ignores_unknown():
    out = render_text("Hi {{ student.first_name }} {{ nope }}", {"student": {"first_name": "<b>A</b>"}}, html_escape=True)
    assert out == "Hi &lt;b&gt;A&lt;/b&gt; "


def test_template_rejects_unknown_variables():
    t = EmailTemplate.objects.get(event=Event.PAYMENT_APPROVED)
    t.body = "Hello {{ student.password }}"
    with pytest.raises(ValidationError):
        t.full_clean()


def test_required_template_cannot_be_disabled():
    t = EmailTemplate.objects.get(event=Event.VERIFY_EMAIL)
    t.enabled = False
    with pytest.raises(ValidationError):
        t.full_clean()


def test_notify_creates_in_app_and_branded_email(student):
    course = CourseFactory(title="Seerah Essentials")
    notify(student, Event.ENROLLMENT_CONFIRMED, {"course": {"title": course.title}}, link="/learn/x")
    n = Notification.objects.get(user=student)
    assert "Seerah Essentials" in n.title
    msg = mail.outbox[-1]
    assert "Seerah Essentials" in msg.subject
    html = msg.alternatives[0][0]
    assert "Hikmah Online" in html and "#003399" in html


def test_disabled_template_still_creates_in_app(student):
    EmailTemplate.objects.filter(event=Event.NEW_RECORDING).update(enabled=False)
    notify(student, Event.NEW_RECORDING, {"course": {"title": "C"}, "session": {"title": "S"}})
    assert Notification.objects.filter(user=student).exists()
    assert len(mail.outbox) == 0


def test_class_reminders_sent_once_per_offset(student):
    course = CourseFactory()
    enroll_active(student, course)
    mail.outbox.clear()
    session = LiveSessionFactory(course=course, starts_at=timezone.now() + timedelta(minutes=50))
    send_due_reminders()
    send_due_reminders()
    reminders = [m for m in mail.outbox if "class" in m.subject.lower()]
    assert len(reminders) == 1  # 24h and 1h are both due (late joiner): only the nearest is sent, once
    assert session.join_url not in reminders[0].body


def test_reminder_opt_out(student):
    student.profile.class_reminders = False
    student.profile.save()
    course = CourseFactory()
    enroll_active(student, course)
    mail.outbox.clear()
    LiveSessionFactory(course=course, starts_at=timezone.now() + timedelta(minutes=30))
    send_due_reminders()
    assert not [m for m in mail.outbox if "class" in m.subject.lower()]


def test_deadline_reminder_skips_submitted(student):
    from apps.assessments.services import submit_assignment

    course = CourseFactory()
    enroll_active(student, course)
    mail.outbox.clear()
    a1 = AssignmentFactory(course=course, due_at=timezone.now() + timedelta(hours=10))
    a2 = AssignmentFactory(course=course, due_at=timezone.now() + timedelta(hours=10))
    submit_assignment(student, a2, "done", None)
    send_due_reminders()
    subjects = [m.subject for m in mail.outbox if "due" in m.subject.lower()]
    assert len(subjects) == 1 and a1.title in subjects[0]


def test_no_reminders_for_past_events(student):
    course = CourseFactory()
    enroll_active(student, course)
    mail.outbox.clear()
    with freeze_time(timezone.now() + timedelta(days=3)):
        LiveSessionFactory(course=course, starts_at=timezone.now() - timedelta(hours=1))
        send_due_reminders()
    assert not mail.outbox
