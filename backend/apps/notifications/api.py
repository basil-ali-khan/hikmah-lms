from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification


class NotificationListView(APIView):
    def get(self, request):
        qs = Notification.objects.filter(user=request.user)
        return Response({
            "unread_count": qs.filter(read_at__isnull=True).count(),
            "results": [{"id": n.id, "event": n.event, "title": n.title, "body": n.body, "link": n.link,
                         "read": n.read_at is not None, "created_at": n.created_at} for n in qs[:50]],
        })


class NotificationReadView(APIView):
    def post(self, request, pk=None):
        qs = Notification.objects.filter(user=request.user, read_at__isnull=True)
        if pk is not None:
            get_object_or_404(Notification, pk=pk, user=request.user)
            qs = qs.filter(pk=pk)
        updated = qs.update(read_at=timezone.now())
        return Response({"updated": updated})
