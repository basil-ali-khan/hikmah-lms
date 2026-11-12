from django.conf import settings
from django.db import transaction


def run_async(func_path, *args):
    """Queue a background task after the current transaction commits (inline when Q_SYNC=True)."""
    if settings.Q_CLUSTER.get("sync"):
        from django.utils.module_loading import import_string

        return import_string(func_path)(*args)
    from django_q.tasks import async_task

    transaction.on_commit(lambda: async_task(func_path, *args), robust=True)
    return None
