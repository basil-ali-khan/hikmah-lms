"""Upload validation and short-lived signed file access.

Private files are never served from a public URL. Callers check permissions first, then
hand out `secure_url(field_file)`, which is either an S3/R2 presigned URL or a signed
token to our own streaming view — both expire after SIGNED_URL_TTL_SECONDS.
"""

import hashlib
import mimetypes
import uuid
from pathlib import PurePosixPath

import filetype
from django.conf import settings
from django.core import signing
from django.core.files.storage import default_storage, storages
from django.http import FileResponse, Http404
from django.urls import reverse
from django.utils.deconstruct import deconstructible

from .services import ServiceError

_SALT = "hikmah.signed-file"


def validate_upload(upload, allowed_types=None, max_mb=None):
    """Check size and *content* type (magic bytes, not the extension). Returns (mime, sha256)."""
    allowed_types = allowed_types or settings.ALLOWED_UPLOAD_TYPES
    max_mb = max_mb or settings.MAX_UPLOAD_MB
    if upload is None:
        raise ServiceError("Please attach a file.", "file_required")
    if upload.size > max_mb * 1024 * 1024:
        raise ServiceError(f"File is too large (max {max_mb} MB).", "file_too_large")
    upload.seek(0)
    head = upload.read(8192)
    upload.seek(0)
    kind = filetype.guess(head)
    mime = kind.mime if kind else None
    if mime == "application/zip" and str(upload.name).lower().endswith((".docx", ".pptx")):
        mime = mimetypes.guess_type(upload.name)[0]
    if mime not in allowed_types:
        raise ServiceError("This file type isn't allowed.", "file_type")
    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return mime, digest.hexdigest()


@deconstructible
class randomized_name:  # noqa: N801 (used like a function in upload_to=)
    """upload_to that discards the user's filename (no path tricks, no personal data in names)."""

    def __init__(self, prefix):
        self.prefix = prefix

    def __call__(self, instance, filename):
        ext = PurePosixPath(filename).suffix.lower()[:10]
        return f"{self.prefix}/{uuid.uuid4().hex}{ext}"

    def __eq__(self, other):
        return isinstance(other, randomized_name) and other.prefix == self.prefix


def secure_url(field_file, download_name=None):
    if not field_file:
        return None
    if settings.STORAGE_BACKEND == "s3":
        params = {}
        if download_name:
            params["ResponseContentDisposition"] = f'inline; filename="{download_name}"'
        return field_file.storage.url(field_file.name, parameters=params or None)
    token = signing.dumps({"n": field_file.name, "d": download_name or ""}, salt=_SALT, compress=True)
    return settings.API_URL + reverse("signed-file", args=[token])


def signed_file_view(request, token):
    try:
        data = signing.loads(token, salt=_SALT, max_age=settings.SIGNED_URL_TTL_SECONDS)
    except signing.BadSignature as exc:
        raise Http404 from exc
    name = data["n"]
    if not default_storage.exists(name):
        raise Http404
    response = FileResponse(default_storage.open(name, "rb"), filename=data.get("d") or PurePosixPath(name).name)
    response["Content-Disposition"] = response["Content-Disposition"].replace("attachment", "inline")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
    return response


def public_file_view(request, path):
    """Stream branding/thumbnail files from the public storage (works for local and S3)."""
    storage = storages["public"]
    if ".." in path or path.startswith("/") or not storage.exists(path):
        raise Http404
    response = FileResponse(storage.open(path, "rb"))
    response["Cache-Control"] = "public, max-age=3600"
    response["X-Content-Type-Options"] = "nosniff"
    return response
