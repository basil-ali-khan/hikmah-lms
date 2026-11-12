"""Local development seed: dummy users for every role/state + realistic sample courses.

    uv run python manage.py seed_dev            # first time
    uv run python manage.py seed_dev --reset    # wipe seeded data and recreate

Refuses to run unless DEBUG=True and DEV_SEED_ALLOWED=True.
"""

import io
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

import yaml
from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

SEED_FILE = Path(settings.BASE_DIR) / "seed" / "dev_users.yaml"
DOCS_FILE = Path(settings.BASE_DIR).parent / "docs" / "DEV_USERS.md"
COURSE_SLUGS = ["foundations-of-aqeedah", "seerah-essentials", "fiqh-of-worship", "sisters-tafsir-circle",
                "arabic-for-beginners", "tafsir-juz-amma"]
VIDEOS = ["https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://youtu.be/YE7VzlLtp-4", "https://youtu.be/ScMzIvxBSi4"]


def _receipt(seed=b""):
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (600, 400), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 580, 380], outline="#003399", width=4)
    d.text((40, 40), "BANK TRANSFER RECEIPT (dev sample)", fill="black")
    d.text((40, 80), f"Amount: PKR 5,000   Ref: {seed.decode() or 'HKM'}", fill="black")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return SimpleUploadedFile("receipt.png", buf.getvalue(), content_type="image/png")


class Command(BaseCommand):
    help = "Seed local development data (refuses to run outside DEBUG)."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete previously seeded data first")

    def handle(self, *args, **opts):
        if not (settings.DEBUG and settings.DEV_SEED_ALLOWED):
            raise CommandError("seed_dev only runs with DEBUG=True and DEV_SEED_ALLOWED=True.")
        from apps.accounts.models import User
        from apps.core.bootstrap import ensure_defaults, ensure_schedules

        cfg = yaml.safe_load(SEED_FILE.read_text())
        ensure_defaults()
        ensure_schedules()
        if User.objects.filter(email="superadmin@hikmah.test").exists():
            if not opts["reset"]:
                self.stdout.write(self.style.WARNING("Already seeded. Use --reset to recreate."))
                return
            self._reset()
        with transaction.atomic():
            self._seed(cfg)
        self._write_docs(cfg)
        self.stdout.write(self.style.SUCCESS(f"Seeded. Accounts listed in {DOCS_FILE.relative_to(DOCS_FILE.parent.parent)}"))

    def _reset(self):
        from apps.accounts.models import User
        from apps.certificates.models import Certificate
        from apps.courses.models import Course
        from apps.payments.models import BankAccount

        Certificate.objects.filter(course__slug__in=COURSE_SLUGS).delete()
        Course.objects.filter(slug__in=COURSE_SLUGS).delete()
        BankAccount.objects.filter(display_name__endswith="(dev)").delete()
        User.objects.filter(email__endswith="@hikmah.test").delete()

    # ------------------------------------------------------------------ seed
    def _seed(self, cfg):  # noqa: C901 (linear script)
        from apps.accounts.models import User
        from apps.assessments.models import Assignment, Choice, Question, Quiz
        from apps.assessments.services import save_answer, start_attempt, submit_assignment, submit_attempt
        from apps.core.models import Category, EligibilityRule
        from apps.courses.models import Course, Lesson, Module
        from apps.courses.services import assign_instructor
        from apps.enrollments.models import Enrollment
        from apps.enrollments.services import request_enrollment
        from apps.learning.services import mark_complete
        from apps.live.models import LiveSession
        from apps.live.services import set_attendance
        from apps.payments.models import BankAccount
        from apps.payments.services import approve_payment, request_resubmission, submit_payment

        now = timezone.now()
        pw = cfg["password"]
        users = {}
        for spec in cfg["users"]:
            u = User.objects.create_user(spec["email"], pw, full_name=spec["name"])
            users[spec["email"].split("@")[0]] = u
            verified = spec["email"] != "student.unverified@hikmah.test"
            EmailAddress.objects.create(user=u, email=u.email, verified=verified, primary=True)
            if spec["role"] == "superadmin":
                u.is_staff = u.is_superuser = True
                u.save()
            elif spec["role"] == "manager":
                u.is_staff = True
                u.save()
                u.groups.add(Group.objects.get(name="Course Manager"))
            if spec["role"] == "student" and spec["email"] != "student.new@hikmah.test":
                female = spec["email"] == "student.female@hikmah.test"
                p = u.profile
                p.data = {"phone": "+92 300 1234567", "date_of_birth": "1998-03-14", "gender": "Female" if female else "Male",
                          "country": "PK" if not female else "GB", "city": "Karachi" if not female else "London",
                          "education": "Bachelor's", "occupation": "Student"}
                p.privacy_consent_at = p.terms_accepted_at = p.completed_at = now
                p.save()
            elif spec["role"] == "student":
                u.profile.terms_accepted_at = now
                u.profile.save()

        cats = {n: Category.objects.get_or_create(name=n, slug=n.lower())[0]
                for n in ["Aqeedah", "Fiqh", "Seerah", "Tafsir", "Arabic"]}
        pkr = BankAccount.objects.create(display_name="Meezan Bank · PKR (dev)", currency="PKR",
                                         account_title="Hikmah Institute", bank_name="Meezan Bank",
                                         account_number="PK36 MEZN 0000 0000 0000 0000", branch="Gulshan, Karachi",
                                         instructions="Write your payment reference in the transfer note.")
        usd = BankAccount.objects.create(display_name="International transfer · USD (dev)", currency="USD",
                                         account_title="Hikmah Institute", bank_name="[International bank]",
                                         account_number="[IBAN]", swift_code="[SWIFT]")
        i1, i2 = users["instructor1"], users["instructor2"]

        # A — paid hybrid course with everything
        a = Course.objects.create(
            title="Foundations of Aqeedah", slug="foundations-of-aqeedah", category=cats["Aqeedah"], course_type="hybrid",
            status="published", featured=True, price=Decimal("5000"), currency="PKR", capacity=40,
            summary="Core beliefs of Islam explained clearly, with weekly live classes and recorded lessons.",
            description="A structured introduction to Islamic creed.\n\n- Weekly live classes on Zoom\n- Recorded lessons\n"
                        "- Quizzes, a case study and a certificate",
            outcomes="- Explain the six pillars of faith\n- Read classical texts with confidence\n- Answer common questions",
            starts_at=now - timedelta(days=20), ends_at=now + timedelta(days=40), duration_label="8 weeks",
            schedule_label="Tue & Thu evenings", access_type="until", access_until=now + timedelta(days=120),
            min_attendance_percent=75, recording_policy="review")
        a.bank_accounts.add(pkr, usd)
        assign_instructor(a, i1)
        m1 = Module.objects.create(course=a, title="Foundations", order=1)
        m2 = Module.objects.create(course=a, title="The Pillars of Faith", order=2)
        m3 = Module.objects.create(course=a, title="Texts and Sources", order=3, release_at=now + timedelta(days=10))
        l11 = Lesson.objects.create(module=m1, title="Introduction to Aqeedah", kind="video", video_url=VIDEOS[0],
                                    duration_minutes=12, order=1, body="Welcome! In this lesson we cover **why creed matters**.")
        l12 = Lesson.objects.create(module=m1, title="Reading: Key terms", kind="text", order=2,
                                    body="## Key terms\n\n- **Tawheed** — oneness of Allah\n- **Iman** — faith\n- **Ihsan** — excellence")
        q1 = Quiz.objects.create(course=a, module=m1, title="Quiz 1 · Foundations", pass_percent=60, max_attempts=2,
                                 time_limit_minutes=10, order=3, show_answers="immediately")
        for i, (text, opts, correct) in enumerate([
            ("How many pillars of faith (iman) are there?", ["Five", "Six", "Seven"], 1),
            ("Tawheed refers to…", ["The oneness of Allah", "Prayer", "Fasting"], 0),
            ("Ihsan means…", ["Charity", "Excellence in worship", "Pilgrimage"], 1),
        ]):
            q = Question.objects.create(quiz=q1, kind="single", text=text, order=i)
            for j, o in enumerate(opts):
                Choice.objects.create(question=q, text=o, is_correct=(j == correct), order=j)
        l21 = Lesson.objects.create(module=m2, title="Belief in Allah", kind="video", video_url=VIDEOS[1], duration_minutes=18,
                                    order=1, prerequisite_lesson=l12)
        Lesson.objects.create(module=m2, title="Belief in the Angels", kind="video", video_url=VIDEOS[2], duration_minutes=15,
                              order=2, prerequisite_lesson=l21)
        q2 = Quiz.objects.create(course=a, module=m2, title="Quiz 2 · Pillars", pass_percent=60, max_attempts=2,
                                 time_limit_minutes=20, order=3, closes_at=now + timedelta(days=2))
        for i, (text, opts, correct) in enumerate([
            ("Which is NOT a pillar of faith?", ["Belief in the angels", "Belief in the books", "Belief in astrology"], 2),
            ("The final messenger is…", ["Musa (AS)", "Muhammad ﷺ", "Isa (AS)"], 1),
        ]):
            q = Question.objects.create(quiz=q2, kind="single", text=text, order=i)
            for j, o in enumerate(opts):
                Choice.objects.create(question=q, text=o, is_correct=(j == correct), order=j)
        Question.objects.create(quiz=q2, kind="short", text="In two or three sentences, explain belief in the unseen.",
                                points=Decimal("3"), order=5, model_answer="Mentions angels, the hereafter and qadr.")
        asg = Assignment.objects.create(course=a, module=m2, title="Case study: answering a friend's question",
                                        instructions="Read the case and write a short response (300–500 words).\n\n"
                                                     "**Graded on:** accuracy, clarity, use of sources.",
                                        due_at=now + timedelta(days=5), max_score=Decimal("20"), pass_score=Decimal("12"), order=4)
        Lesson.objects.create(module=m3, title="Introduction to the classical texts", kind="video", video_url=VIDEOS[0],
                              order=1, duration_minutes=20)
        sessions = []
        for k, days in enumerate([-14, -10, -7, -3]):
            s = LiveSession.objects.create(course=a, title=f"Session {k + 1}: {['Why Aqeedah', 'Tawheed', 'Iman', 'Ihsan'][k]}",
                                           starts_at=(now + timedelta(days=days)).replace(hour=14, minute=0, second=0, microsecond=0),
                                           duration_minutes=90, join_url="https://zoom.us/j/1234567890",
                                           recording_url=VIDEOS[k % 3] if k < 3 else "",
                                           recording_published=k < 2, recording_published_at=now if k < 2 else None)
            sessions.append(s)
        LiveSession.objects.create(course=a, title="Session 5: The Angels", starts_at=now + timedelta(minutes=45),
                                   duration_minutes=90, join_url="https://zoom.us/j/1234567890",
                                   description="Please read **Reading: Key terms** before class.")
        LiveSession.objects.create(course=a, title="Session 6: The Books", starts_at=now + timedelta(days=2),
                                   duration_minutes=90, join_url="https://meet.google.com/abc-defg-hij")

        # B — free recorded course (fast certificate)
        b = Course.objects.create(
            title="Seerah Essentials", slug="seerah-essentials", category=cats["Seerah"], course_type="recorded",
            status="published", featured=True, summary="The life of the Prophet ﷺ in ten short recorded lessons.",
            description="Self-paced. Watch, take the short quiz, and earn a certificate.", duration_label="Self-paced",
            access_type="days", access_days=90)
        assign_instructor(b, i1)
        bm = Module.objects.create(course=b, title="The Makkan period", order=1)
        bl1 = Lesson.objects.create(module=bm, title="Before prophethood", kind="video", video_url=VIDEOS[1], order=1,
                                    duration_minutes=10)
        bl2 = Lesson.objects.create(module=bm, title="The first revelation", kind="video", video_url=VIDEOS[2], order=2,
                                    duration_minutes=11)
        bq = Quiz.objects.create(course=b, module=bm, title="Seerah check-in", pass_percent=50, max_attempts=3, order=3,
                                 show_answers="immediately")
        bqq = Question.objects.create(quiz=bq, kind="single", text="Where did the first revelation take place?", order=0)
        bqc = [Choice.objects.create(question=bqq, text=t, is_correct=(t == "Cave Hira"), order=i)
               for i, t in enumerate(["Cave Hira", "Cave Thawr", "Masjid al-Haram"])]

        # C — free live, approval required, instructor2 only
        c = Course.objects.create(
            title="Fiqh of Worship", slug="fiqh-of-worship", category=cats["Fiqh"], course_type="live", status="published",
            enrollment_mode="approval", summary="Purification and prayer, taught live. Places are approved by the institute.",
            starts_at=now + timedelta(days=7), duration_label="6 weeks", schedule_label="Saturdays", capacity=25)
        assign_instructor(c, i2)
        cm = Module.objects.create(course=c, title="Purification", order=1)
        Lesson.objects.create(module=cm, title="Wudu step by step", kind="video", video_url=VIDEOS[0], order=1)
        LiveSession.objects.create(course=c, title="Session 1: Taharah", starts_at=now + timedelta(days=7),
                                   duration_minutes=60, join_url="https://zoom.us/j/9876543210")

        # D — women-only free course
        d = Course.objects.create(
            title="Sisters' Tafsir Circle", slug="sisters-tafsir-circle", category=cats["Tafsir"], course_type="live",
            status="published", eligibility=EligibilityRule.objects.get(label="Women only"),
            summary="A weekly tafsir circle for sisters.", duration_label="Ongoing", schedule_label="Sundays")
        assign_instructor(d, i2)
        Lesson.objects.create(module=Module.objects.create(course=d, title="Surah Al-Fatiha", order=1),
                              title="Overview", kind="video", video_url=VIDEOS[1], order=1)

        # E — paid USD course with access in days
        e = Course.objects.create(
            title="Arabic for Beginners", slug="arabic-for-beginners", category=cats["Arabic"], course_type="recorded",
            status="published", price=Decimal("40"), currency="USD", summary="Read and write Arabic from zero.",
            access_type="days", access_days=180, duration_label="12 weeks")
        e.bank_accounts.add(usd)
        assign_instructor(e, i1)
        Lesson.objects.create(module=Module.objects.create(course=e, title="The alphabet", order=1),
                              title="Letters alif to kha", kind="video", video_url=VIDEOS[2], order=1)

        # F — draft
        Course.objects.create(title="Tafsir of Juz Amma", slug="tafsir-juz-amma", category=cats["Tafsir"], status="draft",
                              course_type="live", summary="Coming soon.")

        # --- student states
        mgr = users["manager"]
        act = users["student.active"]
        enr = request_enrollment(act, a)
        approve_payment(submit_payment(enr, act, _receipt(b"act"), amount=Decimal("5000"), transaction_ref="MZ-88213",
                                       paid_on=now.date() - timedelta(days=18)), mgr, "Verified against bank statement.")
        for lesson in (l11, l12):
            mark_complete(act, lesson)
        att = start_attempt(act, q1)
        qs = list(q1.questions.order_by("order"))
        for q, idx in zip(qs, [1, 0, 0], strict=True):
            save_answer(att, act, q.id, [list(q.choices.order_by("order"))[idx].id])
        submit_attempt(att, act)
        for s, st in zip(sessions, ["present", "present", "late", "absent"], strict=True):
            set_attendance(s, act, st, i1)
        submit_assignment(act, asg, "My draft answer: belief in the unseen means …", None)

        pen = users["student.pending"]
        submit_payment(request_enrollment(pen, a), pen, _receipt(b"pen"), amount=Decimal("5000"), transaction_ref="MZ-99102",
                       paid_on=now.date())
        rej = users["student.rejected"]
        sub = submit_payment(request_enrollment(rej, a), rej, _receipt(b"rej"), amount=Decimal("4000"), transaction_ref="",
                             paid_on=now.date() - timedelta(days=1))
        request_resubmission(sub, mgr, "The amount and date aren't readable in this photo, and the amount differs from the fee.")
        # duplicate-receipt example in the queue
        submit_payment(request_enrollment(users["student.female"], e), users["student.female"], _receipt(b"pen"),
                       amount=Decimal("40"), transaction_ref="INTL-551")

        exp = users["student.expired"]
        ee = request_enrollment(exp, b)
        Enrollment.objects.filter(pk=ee.pk).update(status=Enrollment.EXPIRED, expires_at=now - timedelta(days=3))

        grad = users["student.graduate"]
        request_enrollment(grad, b)
        mark_complete(grad, bl1)
        mark_complete(grad, bl2)
        ga = start_attempt(grad, bq)
        save_answer(ga, grad, bqq.id, [bqc[0].id])
        submit_attempt(ga, grad)  # completes the course → certificate issued automatically

        request_enrollment(users["student.female"], c)  # approval request waiting for the manager

    def _write_docs(self, cfg):
        rows = "\n".join(f"| `{u['email']}` | {u['role']} | {u['state']} |" for u in cfg["users"])
        DOCS_FILE.parent.mkdir(parents=True, exist_ok=True)
        DOCS_FILE.write_text(
            "# Local development accounts\n\n"
            "Generated by `manage.py seed_dev` from `backend/seed/dev_users.yaml` (the password lives there).\n"
            "**Development only** — the seed command refuses to run when `DEBUG=False`.\n\n"
            f"- Web app: {settings.SITE_URL}\n- Staff panel: {settings.API_URL}/{settings.ADMIN_URL_PATH}/\n"
            "- Mailpit (emails): http://localhost:8025\n\n"
            "| Login | Role | State |\n|---|---|---|\n" + rows + "\n")
