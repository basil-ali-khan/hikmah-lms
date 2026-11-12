from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render


def axes_username(request, credentials):
    credentials = credentials or {}
    value = credentials.get("email") or credentials.get("username") or credentials.get("login") or ""
    return str(value).strip().lower()


def lockout_response(request, original_response=None, credentials=None):
    minutes = int(settings.AXES_COOLOFF_TIME.total_seconds() // 60)
    message = f"Too many failed attempts. Try again in {minutes} minutes or reset your password."
    path = getattr(request, "path", "")
    if path.startswith(("/_allauth/", "/api/")):
        return JsonResponse(
            {"status": 429, "errors": [{"message": message, "code": "locked_out", "param": "password"}]}, status=429
        )
    return render(request, "account/lockout.html", {"message": message}, status=429)
