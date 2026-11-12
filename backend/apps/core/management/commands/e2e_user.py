"""Create a throwaway student for end-to-end tests (DEBUG only). Prints the email.

    uv run python manage.py e2e_user --email e2e-123@hikmah.test [--unverified] [--incomplete] [--gender Female]
"""

from allauth.account.models import EmailAddress
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


class Command(BaseCommand):
    help = "Create a test student for E2E runs (refuses outside DEBUG)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--name", default="E2E Student")
        parser.add_argument("--unverified", action="store_true")
        parser.add_argument("--incomplete", action="store_true")
        parser.add_argument("--gender", default="Male")
        parser.add_argument("--enroll", action="append", default=[], help="Course slug to activate an enrollment in")

    def handle(self, *args, **o):
        if not (settings.DEBUG and settings.DEV_SEED_ALLOWED):
            raise CommandError("e2e_user only runs with DEBUG=True and DEV_SEED_ALLOWED=True.")
        if not o["email"].endswith("@hikmah.test"):
            raise CommandError("E2E users must use the @hikmah.test domain.")
        from apps.accounts.models import User

        user = User.objects.create_user(o["email"], o["password"], full_name=o["name"])
        EmailAddress.objects.create(user=user, email=user.email, verified=not o["unverified"], primary=True)
        p = user.profile
        p.terms_accepted_at = timezone.now()
        if not o["incomplete"]:
            p.data = {"phone": "+44 7700 900123", "date_of_birth": "1999-09-09", "gender": o["gender"], "country": "GB",
                      "city": "Birmingham"}
            p.privacy_consent_at = p.completed_at = timezone.now()
        p.save()
        if o["enroll"]:
            from apps.courses.models import Course
            from apps.enrollments.services import activate, request_enrollment

            for slug in o["enroll"]:
                enrollment = request_enrollment(user, Course.objects.get(slug=slug))
                if enrollment.status != "active":
                    activate(enrollment, None, note="e2e")
        self.stdout.write(user.email)
