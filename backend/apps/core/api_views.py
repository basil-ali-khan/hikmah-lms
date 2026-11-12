"""Public, unauthenticated endpoints: site config (branding/flags), pages, categories."""

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, FeatureFlag, Page, SiteSettings, google_login_available
from .services import render_markdown
from .turnstile import turnstile_enabled


def file_url(field_file):
    return field_file.url if field_file else None


class SiteConfigView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        s = SiteSettings.load()
        return Response({
            "institute_name": s.institute_name,
            "tagline": s.tagline,
            "description": s.description,
            "logo_url": file_url(s.logo),
            "favicon_url": file_url(s.favicon),
            "colors": {"primary": s.color_primary, "accent": s.color_accent, "heading": s.color_heading,
                       "text": s.color_text, "surface": s.color_surface},
            "fonts": {"heading": s.font_heading, "body": s.font_body},
            "support": {"email": s.support_email, "whatsapp": s.support_whatsapp},
            "social_links": s.social_links,
            "institute_timezone": s.institute_timezone,
            "payment_review_eta": s.payment_review_eta,
            "join_window_minutes": s.join_window_minutes,
            "max_upload_mb": settings.MAX_UPLOAD_MB,
            "password_min_length": settings.PASSWORD_MIN_LENGTH,
            "default_refund_policy": s.default_refund_policy,
            "flags": {
                "google_login": google_login_available(),
                "turnstile": turnstile_enabled(),
                "pwa_install_prompt": FeatureFlag.is_enabled(FeatureFlag.PWA_INSTALL_PROMPT),
                "analytics": FeatureFlag.is_enabled(FeatureFlag.ANALYTICS),
                "self_service_deletion": FeatureFlag.is_enabled(FeatureFlag.SELF_SERVICE_DELETION),
            },
            "turnstile_site_key": settings.TURNSTILE_SITE_KEY if turnstile_enabled() else "",
            "footer_pages": [{"slug": p.slug, "title": p.title}
                             for p in Page.objects.filter(status=Page.PUBLISHED, show_in_footer=True)],
        })


class PageView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        page = get_object_or_404(Page, slug=slug, status=Page.PUBLISHED)
        return Response({"slug": page.slug, "title": page.title, "body_html": render_markdown(page.body),
                         "updated_at": page.updated_at})


class CategoryListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response([{"id": c.id, "name": c.name, "slug": c.slug} for c in Category.objects.all()])


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Sets the csrftoken cookie so the web app can send X-CSRFToken on writes."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"ok": True})
