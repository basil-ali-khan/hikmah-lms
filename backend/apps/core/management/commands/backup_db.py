"""Compressed Postgres dump to the private storage bucket (R2 in production), with retention.

Scheduled daily by bootstrap_defaults. Restore with:
    gunzip -c dump.sql.gz | psql "$DATABASE_URL"
R2 encrypts objects at rest; the bucket is private and the token is scoped to it.
"""

import gzip
import io
import subprocess
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

PREFIX = "backups/"


def run_backup():
    url = settings.DATABASES["default"]
    env = {"PGPASSWORD": url.get("PASSWORD", "")}
    cmd = ["pg_dump", "--no-owner", "--no-privileges", "-h", url.get("HOST") or "localhost", "-p", str(url.get("PORT") or 5432),
           "-U", url["USER"], url["NAME"]]
    result = subprocess.run(cmd, capture_output=True, env=env, check=False)  # noqa: S603 (fixed argv)
    if result.returncode != 0:
        raise CommandError(f"pg_dump failed: {result.stderr.decode()[:500]}")
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(result.stdout)
    name = f"{PREFIX}hikmah-{timezone.now():%Y%m%d-%H%M%S}.sql.gz"
    saved = default_storage.save(name, ContentFile(buf.getvalue()))
    prune_backups()
    return saved


def prune_backups():
    cutoff = timezone.now() - timedelta(days=settings.BACKUP_RETENTION_DAYS)
    try:
        _, files = default_storage.listdir(PREFIX.rstrip("/"))
    except FileNotFoundError:
        return
    for f in files:
        path = f"{PREFIX}{f}"
        try:
            if default_storage.get_modified_time(path) < cutoff:
                default_storage.delete(path)
        except (NotImplementedError, OSError):
            continue


class Command(BaseCommand):
    help = "Dump the database (gzip) to private storage and prune old backups."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f"Backup saved: {run_backup()}"))
