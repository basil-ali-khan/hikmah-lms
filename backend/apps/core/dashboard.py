from django.conf import settings


def environment_callback(request):
    if settings.DEBUG:
        return ["Development", "warning"]
    return None


def dashboard_callback(request, context):
    from .stats import admin_overview

    context.update(admin_overview(request.user))
    return context
