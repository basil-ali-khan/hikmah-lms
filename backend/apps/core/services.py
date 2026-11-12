"""Cross-cutting helpers: domain errors, audit logging, safe Markdown, short codes."""

import secrets

import markdown as md
import nh3


class ServiceError(Exception):
    """A business-rule violation. Rendered as HTTP 400 with a stable `code`."""

    status_code = 400

    def __init__(self, message, code="invalid", status_code=None):
        super().__init__(message)
        self.message = message
        self.code = code
        if status_code:
            self.status_code = status_code


class NotAllowed(ServiceError):
    status_code = 403

    def __init__(self, message="You don't have access to this.", code="forbidden"):
        super().__init__(message, code)


def client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def audit(actor, action, obj=None, details=None, request=None, object_repr=None):
    from .models import AuditLog

    return AuditLog.objects.create(
        actor=actor if getattr(actor, "pk", None) else None,
        actor_label=getattr(actor, "email", None) or (actor if isinstance(actor, str) else "system"),
        action=action,
        object_type=obj._meta.label_lower if obj is not None else "",
        object_id=str(obj.pk) if obj is not None else "",
        object_repr=(object_repr or (str(obj) if obj is not None else ""))[:200],
        details=details or {},
        ip_address=client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "")[:300] if request else ""),
    )


_ALLOWED_TAGS = {
    "p", "br", "strong", "em", "b", "i", "u", "a", "ul", "ol", "li", "h2", "h3", "h4",
    "blockquote", "code", "pre", "hr", "table", "thead", "tbody", "tr", "th", "td",
}


def render_markdown(text: str) -> str:
    """Markdown -> sanitized HTML. Safe to render from admin- or user-provided text."""
    html = md.markdown(text or "", extensions=["extra", "sane_lists"])
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes={"a": {"href", "title"}},
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
    )


_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def short_code(prefix="HKM", groups=2, size=4):
    parts = ["".join(secrets.choice(_CODE_ALPHABET) for _ in range(size)) for _ in range(groups)]
    return "-".join([prefix, *parts])
