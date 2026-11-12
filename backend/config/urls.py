from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.generic import RedirectView

from apps.core.files import public_file_view, signed_file_view

admin.site.site_header = "Hikmah Staff"
admin_prefix = settings.ADMIN_URL_PATH


def healthz(request):
    return JsonResponse({"ok": True})


urlpatterns = [
    # Staff sign in through allauth (password + TOTP 2FA), never Django's bare admin login.
    path(f"{admin_prefix}/login/", RedirectView.as_view(url="/accounts/login/?next=/" + admin_prefix + "/", query_string=False)),
    path(f"{admin_prefix}/logout/", RedirectView.as_view(url="/accounts/logout/")),
    path(f"{admin_prefix}/", admin.site.urls),
    path("accounts/", include("allauth.urls")),
    path("_allauth/", include("allauth.headless.urls")),
    path("api/v1/", include("config.api_urls")),
    path("files/s/<str:token>/", signed_file_view, name="signed-file"),
    path("media-public/<path:path>", public_file_view, name="public-file"),
    path("healthz", healthz),
]

if settings.DEBUG:
    from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema")),
    ]
