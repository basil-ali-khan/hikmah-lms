import json
from datetime import timedelta

from allauth.socialaccount.models import SocialAccount
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.models import FeatureFlag
from apps.core.services import ServiceError, audit

from .models import DeletionRequest
from .services import (
    active_field_definitions,
    export_user_data,
    get_profile,
    is_email_verified,
    missing_profile_fields,
    request_account_deletion,
    update_profile,
)


def field_definition_json(d):
    return {"key": d.key, "label": d.label, "type": d.field_type, "required": d.required, "options": d.options,
            "help_text": d.help_text, "locked_after_save": d.locked_after_save}


def me_json(user):
    profile = get_profile(user)
    missing = missing_profile_fields(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "first_name": user.first_name,
        "is_staff": user.is_staff,
        "staff_panel_url": f"{settings.API_URL}/{settings.ADMIN_URL_PATH}/" if user.is_staff else None,
        "email_verified": is_email_verified(user),
        "google_connected": SocialAccount.objects.filter(user=user, provider="google").exists(),
        "profile": {
            "data": profile.data,
            "timezone": profile.timezone,
            "class_reminders": profile.class_reminders,
            "deadline_reminders": profile.deadline_reminders,
            "privacy_consent_at": profile.privacy_consent_at,
        },
        "profile_complete": not missing,
        "missing_fields": missing,
        "deletion_pending": DeletionRequest.objects.filter(user=user, status=DeletionRequest.PENDING).exists(),
    }


class ProfileFieldsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response([field_definition_json(d) for d in active_field_definitions()])


class MeView(APIView):
    def get(self, request):
        user = request.user
        if not user.last_seen_at or user.last_seen_at < timezone.now() - timedelta(minutes=5):
            user.last_seen_at = timezone.now()
            user.save(update_fields=["last_seen_at"])
        return Response(me_json(user))

    def patch(self, request):
        body = request.data
        update_profile(
            request.user,
            full_name=body.get("full_name"),
            data=body.get("data") if isinstance(body.get("data"), dict) else {},
            consent=bool(body.get("consent")),
            timezone_name=body.get("timezone"),
            reminders=body.get("reminders") if isinstance(body.get("reminders"), dict) else None,
        )
        request.user.refresh_from_db()
        return Response(me_json(request.user))


class ExportView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "export"

    def get(self, request):
        audit(request.user, "account.export", request.user, request=request)
        payload = json.dumps(export_user_data(request.user), indent=2, default=str)
        resp = HttpResponse(payload, content_type="application/json")
        resp["Content-Disposition"] = 'attachment; filename="hikmah-online-my-data.json"'
        resp["Cache-Control"] = "no-store"
        return resp


class DeletionRequestView(APIView):
    def post(self, request):
        if not FeatureFlag.is_enabled(FeatureFlag.SELF_SERVICE_DELETION):
            raise ServiceError("Please contact support to delete your account.", "disabled", 403)
        if (request.data.get("confirm") or "").strip() != "DELETE":
            raise ServiceError("Type DELETE to confirm.", "confirm_required")
        request_account_deletion(request.user, request.data.get("reason", ""), request=request)
        return Response({"ok": True, "deletion_pending": True}, status=201)
