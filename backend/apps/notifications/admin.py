from django.contrib import admin, messages
from django.shortcuts import redirect
from unfold.decorators import action, display

from apps.core.admin_base import AuditedModelAdmin

from .models import REQUIRED_EVENTS, EmailTemplate
from .services import _base_context, build_email, deliver_email


@admin.register(EmailTemplate)
class EmailTemplateAdmin(AuditedModelAdmin):
    list_display = ["event_label", "subject", "enabled", "updated_at"]
    list_editable = ["enabled"]
    readonly_fields = ["event", "variables"]
    fields = ["event", "subject", "body", "enabled", "variables"]
    actions_detail = ["send_test"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @display(description="Email")
    def event_label(self, obj):
        return obj.get_event_display() + (" (required)" if obj.event in REQUIRED_EVENTS else "")

    @display(description="Available variables")
    def variables(self, obj):
        return ", ".join("{{ " + v + " }}" for v in sorted(obj.allowed_variables()))

    @action(description="Send me a test", url_path="send-test")
    def send_test(self, request, object_id):
        template = self.get_object(request, object_id)
        ctx = _base_context(request.user, "/dashboard")
        sample = {v: f"[{v}]" for v in template.allowed_variables()}
        for dotted, value in sample.items():
            head, _, tail = dotted.partition(".")
            if tail:
                ctx.setdefault(head, {})
                if isinstance(ctx[head], dict):
                    ctx[head].setdefault(tail, value)
            else:
                ctx.setdefault(head, value)
        subject, text, html = build_email(template, ctx)
        deliver_email(request.user.email, "[TEST] " + subject, text, html)
        messages.success(request, f"Test sent to {request.user.email}.")
        return redirect(request.META.get("HTTP_REFERER", ".."))
