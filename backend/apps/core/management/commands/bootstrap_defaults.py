from django.core.management.base import BaseCommand

from apps.core.bootstrap import ensure_defaults, ensure_schedules


class Command(BaseCommand):
    help = "Create default settings, roles, email templates, pages and background schedules (idempotent)."

    def handle(self, *args, **options):
        ensure_defaults()
        ensure_schedules()
        self.stdout.write(self.style.SUCCESS("Defaults ensured."))
