from django.http import Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.files import secure_url

from .models import Certificate
from .services import ensure_pdf, verify


def cert_json(c):
    return {"code": c.code, "course": {"slug": c.course.slug, "title": c.course.title}, "student_name": c.student_name,
            "completed_on": c.completed_on, "issued_at": c.issued_at, "valid": c.is_valid, "revoked_at": c.revoked_at}


class MyCertificatesView(APIView):
    def get(self, request):
        return Response([cert_json(c) for c in Certificate.objects.filter(user=request.user).select_related("course")])


class CertificateDownloadView(APIView):
    def get(self, request, code):
        cert = Certificate.objects.select_related("course", "user").filter(code=code.upper(), user=request.user).first()
        if not cert or not cert.is_valid:
            raise Http404
        pdf = ensure_pdf(cert)
        return Response({"url": secure_url(pdf, f"{cert.code}.pdf")})


class VerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "verify"

    def get(self, request, code):
        data = verify(code)
        if data is None:
            return Response({"status": "not_found"}, status=404)
        return Response(data)
