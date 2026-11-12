from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .services import ServiceError


def exception_handler(exc, context):
    if isinstance(exc, ServiceError):
        return Response({"detail": exc.message, "code": exc.code}, status=exc.status_code)
    if isinstance(exc, DjangoValidationError):
        if hasattr(exc, "message_dict"):
            return Response({"detail": "Please fix the highlighted fields.", "errors": exc.message_dict, "code": "invalid"},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": " ".join(exc.messages), "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
    return drf_exception_handler(exc, context)
